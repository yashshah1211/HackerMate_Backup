/* eslint-disable @typescript-eslint/no-require-imports -- Focused offline real-module regression suite. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness } = require('./ppt-vision-harness.cjs');
const { makePitchPdf } = require('./fixtures/pitch-pdf.cjs');

const extractorPath = 'src/lib/ppt/presentationExtractor.ts';
const enginePath = 'src/lib/ppt/evaluatorEngine.ts';
const gatewayPath = 'src/lib/ai/geminiClient.ts';
const downloadPath = 'src/lib/ppt/presentationDownload.ts';
const slideFeedback = [
  { slideNumber: 1, title: 'Architecture', observation: 'Client, API and database blocks are already connected.', recommendation: 'Label the API-to-database arrow with the query and failure behavior.' },
  { slideNumber: 2, title: 'Prototype mockup', observation: 'An illustrative screen is present, but it does not establish a running implementation.', recommendation: 'Add an observed demo result and state which interactions work.' },
];
function scoring(track = 'generic') {
  return { scoreNovelty: 20, scoreTech: 21, scoreUiUx: 20, scoreTeam: ['generic', 'specific'].includes(track) ? 24 : 12, scoreDeductions: { novelty: 'Differentiation needs evidence.', tech: 'Show observed failure handling.', uiUx: 'Supply relevant measured outcomes.', team: 'Supply evidence for this final criterion.' }, strengths: ['Architecture shown'], criticalRisks: ['Mockup is not implementation evidence'], formatViolations: [], slideFeedback, slideRecommendations: { technicalApproach: 'Label the existing diagram.' } };
}
const aiResponse = (result = scoring(), extra = {}) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(result) }] } }], modelVersion: 'fixture-model', ...extra }), { headers: { 'content-type': 'application/json' } });
const downloadOverride = fn => ({ '@/lib/ppt/presentationDownload': undefined, './presentationDownload': { ...harness().load(downloadPath), downloadPresentation: fn } });

for (const kind of ['mixed', 'images', 'text']) {
  test(`local ${kind} PDF preserves every physical page and actual bytes`, async () => {
    const pdf = makePitchPdf(kind);
    const result = await harness().load(extractorPath).extractTextFromPDF(pdf);
    assert.equal(result.success, true, result.errorMessage);
    assert.equal(result.totalSlidesDetected, 3);
    assert.equal(result.slides.length, 3);
    assert.deepEqual(Array.from(result.slides, slide => slide.slideNumber), [1, 2, 3]);
    assert(result.pdf.bytes.equals(pdf));
    if (kind === 'mixed') { assert.equal(result.slides[1].wordCount, 0); assert.match(result.slides[0].rawText, /Architecture/); assert.match(result.rawDocumentText, /\[Slide 3\]/); }
    if (kind === 'images') assert(result.slides.every(slide => slide.wordCount === 0));
  });
}

test('invalid, oversized, and over-page-limit PDFs are rejected before vision', async () => {
  const api = harness().load(extractorPath);
  assert.equal((await api.extractTextFromPDF(Buffer.from('<html>sign in</html>'))).success, false);
  assert.equal((await api.extractTextFromPDF(Buffer.alloc(8 * 1024 * 1024 + 1))).success, false);
  const over = await api.extractTextFromPDF(makePitchPdf('text', 61));
  assert.equal(over.success, false); assert.match(over.errorMessage, /60 pages/);
});

test('PDF text is bounded while streaming and parser timeout destroys its loading task', async () => {
  let destroyed = 0;
  const source = Buffer.from('%PDF-synthetic-stub');
  const doc = {
    numPages: 1,
    loadingTask: { destroy: async () => { destroyed++; } },
    getPage: async () => ({ streamTextContent: () => new ReadableStream({ start(controller) { controller.enqueue({ items: [{ str: 'x'.repeat(120001), hasEOL: false }] }); controller.close(); } }), cleanup() {} }),
  };
  const limited = await harness({ unpdf: { getDocumentProxy: async () => doc } }).load(extractorPath).extractTextFromPDF(source);
  assert.equal(limited.success, false); assert.match(limited.errorMessage, /text exceeds/); assert.equal(destroyed, 1);
  let controller;
  const stalled = { ...doc, loadingTask: { destroy: async () => { destroyed++; controller?.close(); } }, getPage: async () => ({ streamTextContent: () => new ReadableStream({ start(value) { controller = value; } }), cleanup() {} }) };
  const timeout = await harness({ unpdf: { getDocumentProxy: async () => stalled } }).load(extractorPath).extractTextFromPDF(source, 'linked_pdf', 15);
  assert.equal(timeout.success, false); assert.match(timeout.errorMessage, /timed out/); assert(destroyed >= 2);
});

for (const [link, expected] of [
  ['https://docs.google.com/presentation/d/test-id/edit', '/export/pdf'],
  ['https://slides.google.com/presentation/d/test-id/edit', '/export/pdf'],
  ['https://drive.google.com/file/d/test-id/view', 'uc?export=download'],
  ['https://drive.google.com/open?id=test-id', 'uc?export=download'],
]) {
  test(`presentation link obtains PDF first: ${link}`, async () => {
    const calls = []; const pdf = makePitchPdf();
    const { load } = harness(downloadOverride(async url => { calls.push(url); return { bytes: pdf, contentType: 'application/pdf' }; }));
    const result = await load(extractorPath).extractPresentationFromUrl(link);
    assert.equal(result.success, true, result.errorMessage); assert(result.pdf.bytes.equals(pdf));
    assert.equal(calls.length, 1); assert(calls[0].includes(expected));
  });
}

test('missing PDF uses bounded existing text export, preserving all sections', async () => {
  const calls = [];
  const { load } = harness(downloadOverride(async url => {
    calls.push(url);
    if (url.endsWith('/export/pdf')) throw new Error('Not exportable');
    return { bytes: Buffer.from('[Slide 1]\nOur problem affects commuters and the proposed solution saves time.\n[Slide 2]\nArchitecture connects an API and database with clear fallback behavior.'), contentType: 'text/plain' };
  }));
  const result = await load(extractorPath).extractPresentationFromUrl('https://docs.google.com/presentation/d/test-id/edit');
  assert.equal(result.success, true); assert.equal(result.pdf, undefined); assert.equal(result.slides.length, 2);
  assert.match(result.rawDocumentText, /commuters/); assert.match(result.rawDocumentText, /Architecture/);
  assert.equal(calls.length, 2);
});

test('published Google Slides remains a text fallback when no exportable deck ID exists', async () => {
  const calls = [];
  const { load } = harness(downloadOverride(async url => { calls.push(url); return { bytes: Buffer.from('<html><body>A published slide explains the problem, solution, architecture and impact to its intended users.</body></html>'), contentType: 'text/html' }; }));
  const url = 'https://docs.google.com/presentation/d/e/published-fixture/pub';
  const result = await load(extractorPath).extractPresentationFromUrl(url);
  assert.equal(result.success, true); assert.equal(result.pdf, undefined); assert.deepEqual(calls, [url]);
});

test('auth HTML and mislabeled/non-PDF bytes never become visual input', async () => {
  const { load } = harness(downloadOverride(async () => ({ bytes: Buffer.from('<html>Sign in to continue to Google. Use your Google account.</html>'), contentType: 'text/html' })));
  const result = await load(extractorPath).extractPresentationFromUrl('https://docs.google.com/presentation/d/test-id/edit');
  assert.equal(result.success, false); assert.equal(result.pdf, undefined);
  const mislabeled = harness(downloadOverride(async () => ({ bytes: Buffer.from('not a pdf'), contentType: 'application/pdf' })));
  assert.equal((await mislabeled.load(extractorPath).extractPresentationFromUrl('https://drive.google.com/file/d/test-id/view')).success, false);
});

for (const track of ['generic', 'specific', 'web_dev', 'ai_genai']) {
  test(`one native PDF request; ${track} rubric and actionable slide evidence survive`, async () => {
    const calls = []; const pdf = makePitchPdf();
    const { load } = harness({}, { fetch: async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return aiResponse(scoring(track)); } });
    const extraction = await load(extractorPath).extractTextFromPDF(pdf);
    const result = await load(enginePath).runPitchDeckEvaluation('Local fixture', 'software', extraction.rawDocumentText, { memberCount: 3 }, track, 'Organizer rule: 40% usability and 60% working evidence.', extraction.pdf);
    assert.equal(result.analysis.mode, 'visual_text'); assert.equal(result.analysis.pdfReceived, true);
    assert.equal(result.usedAiFallback, false); assert.equal(result.trackId, track); assert.equal(calls.length, 1);
    const part = calls[0].body.contents[0].parts[0];
    assert.equal(part.inlineData.mimeType, 'application/pdf'); assert(Buffer.from(part.inlineData.data, 'base64').equals(pdf));
    const prompt = calls[0].body.contents[0].parts[1].text;
    assert.match(prompt, /mockup alone NEVER proves/); assert.match(prompt, /Credit diagrams visibly present/);
    if (track === 'specific') assert.match(prompt, /Organizer rule: 40% usability/);
    assert.equal(result.slideFeedback[0].slideNumber, 1); assert.match(result.slideFeedback[0].recommendation, /Label/);
    assert.match(result.slideFeedback[1].observation, /does not establish/);
    assert.equal(result.scoreTeam, ['generic', 'specific'].includes(track) ? 24 : 12);
    assert.equal(result.totalScore, 20 + 21 + 20 + result.scoreTeam);
  });
}

for (const status of [400, 403, 429, 404]) {
  test(`document HTTP ${status} falls back to text and never claims visual review`, async () => {
    const calls = []; const { load } = harness({}, { fetch: async (url, options) => {
      const body = JSON.parse(options.body); calls.push(body);
      return body.contents[0].parts.some(part => part.inlineData) ? new Response('', { status }) : aiResponse();
    } });
    const extraction = await load(extractorPath).extractTextFromPDF(makePitchPdf());
    const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', extraction.rawDocumentText, undefined, 'generic', undefined, extraction.pdf);
    assert.equal(result.analysis.mode, 'text_only'); assert.equal(result.analysis.pdfReceived, false);
    assert.equal(result.analysis.fallbackReason.code, 'http_error');
    assert.equal(result.analysis.fallbackReason.httpStatus, status);
    assert(result.analysis.fallbackReason.attempts.length <= 3);
    assert.match(calls.at(-1).contents[0].parts[0].text, /Do NOT pretend you inspected/);
    assert(calls.length <= 4);
  });
}

test('malformed visual scoring/missing slide evidence uses text-only fallback', async () => {
  let count = 0;
  const { load } = harness({}, { fetch: async (_url, options) => {
    count++; return aiResponse(JSON.parse(options.body).contents[0].parts[0].inlineData ? { ...scoring(), slideFeedback: [{ ...slideFeedback[0], slideNumber: 99 }] } : scoring());
  } });
  const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', '[Slide 1]\nLocal text content', undefined, 'generic', undefined, { bytes: makePitchPdf(), pageCount: 3, source: 'linked_pdf' });
  assert.equal(result.analysis.mode, 'text_only'); assert.equal(count, 2);
});

test('missing PDF is TEXT ONLY, default rubric is General, and low scores are not inflated', async () => {
  const calls = [];
  const { load } = harness({}, { fetch: async (_url, options) => { calls.push(JSON.parse(options.body)); return aiResponse({ ...scoring(), scoreNovelty: 1, scoreTech: 2, scoreUiUx: 3, scoreTeam: 4 }); } });
  const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', 'Local extracted problem and solution text.');
  assert.equal(result.trackId, 'generic'); assert.equal(result.analysis.mode, 'text_only'); assert.equal(result.totalScore, 10);
  assert.equal(calls.length, 1); assert.equal(calls[0].contents[0].parts.length, 1);
});

test('no key, exhausted budget, and AI errors use honest heuristic/custom-rubric disclosure', async () => {
  const { load, env } = harness(); delete env.GEMINI_API_KEY;
  const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', 'Architecture and mockup are proposed.', undefined, 'specific', 'Organizer custom criteria');
  assert.equal(result.analysis.mode, 'heuristic_fallback'); assert.equal(result.usedAiFallback, true);
  assert(result.criticalRisks.some(text => /cannot apply an arbitrary custom rubric/.test(text)));
  assert(result.criticalRisks.some(text => /Visual content was not inspected/.test(text)));
  const exhausted = await harness().load(enginePath).runPitchDeckEvaluation('Fixture', 'software', 'Some text', undefined, 'generic', undefined, undefined, 0);
  assert.equal(exhausted.analysis.mode, 'heuristic_fallback');
  const apiError = await harness().load(enginePath).runPitchDeckEvaluation('Fixture', 'software', 'Some text');
  assert.equal(apiError.analysis.mode, 'heuristic_fallback');
});

test('image-only PDF failure skips useless text model requests', async () => {
  let calls = 0;
  const { load } = harness({}, { fetch: async () => { calls++; return new Response('', { status: 429 }); } });
  const extraction = await load(extractorPath).extractTextFromPDF(makePitchPdf('images'));
  const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', extraction.rawDocumentText, undefined, 'generic', undefined, extraction.pdf);
  assert.equal(calls, 1); assert.equal(result.analysis.mode, 'heuristic_fallback');
});

test('shared text and image gateway callers still send their existing modalities', async () => {
  const bodies = [];
  const { load } = harness({}, { fetch: async (_url, options) => { bodies.push(JSON.parse(options.body)); return aiResponse(); } });
  await load(gatewayPath).callGeminiText('text caller');
  await load(gatewayPath).callGeminiVision('image caller', Buffer.from('local-image'), 'image/png');
  assert.equal(bodies[0].contents[0].parts.length, 1);
  assert.equal(bodies[1].contents[0].parts[1].inlineData.mimeType, 'image/png');
});

test('legacy feedback never receives a visual label; all three modes render accurately', () => {
  const Tape = ({ children, title }) => React.createElement('span', { title }, children);
  const { load } = harness({ '@/components/system': { Tape } });
  const Badge = load('src/components/PitchAnalysisBadge.tsx').default;
  for (const [feedback, label] of [
    [undefined, 'TEXT ONLY'], [{ usedAiFallback: true }, 'HEURISTIC FALLBACK'],
    [{ analysis: { mode: 'visual_text', pdfReceived: true } }, 'VISUAL + TEXT'],
    [{ analysis: { mode: 'visual_text', pdfReceived: false } }, 'TEXT ONLY'],
    [{ analysis: { mode: 'text_only', pdfReceived: false } }, 'TEXT ONLY'],
  ]) assert(renderToStaticMarkup(React.createElement(Badge, { feedback })).includes(label));
});

function renderEvaluation(feedback, track = 'generic', previousFeedback) {
  const record = { id: 'evaluation-1', team_id: 'team-1', ps_title: 'Local fixture pitch', track_id: track, file_name: 'fixture.pdf', version: 3, status: 'completed', score_novelty: 20, score_tech: 21, score_ui_ux: 20, score_team: 24, total_score: 85, grade: 'Promising', ai_feedback: feedback, created_at: '2026-10-09T00:00:00Z' };
  let hook = 0;
  const fakeReact = { ...React,
    useState(initial) { const index = hook++; return [index === 0 ? [record, ...(previousFeedback ? [{ ...record, id: 'evaluation-2', version: 2, ai_feedback: previousFeedback }] : [])] : index === 1 ? record : index === 3 ? false : initial, () => {}]; },
    useRef(initial) { return { current: initial }; }, useEffect() {},
  };
  const component = tag => ({ children, title }) => React.createElement(tag, title ? { title } : {}, children);
  const system = Object.fromEntries(['Button', 'FieldLabel', 'IconButton', 'Input', 'List', 'Panel', 'Progress', 'Segmented', 'Select', 'Spinner', 'Tape'].map(name => [name, component('div')]));
  const { load } = harness({ react: fakeReact, '@/components/system': system, '@/lib/supabase': { supabase: {} }, '@/components/LinkedIdeaScorecard': { __esModule: true, default: () => null }, '@/components/ui/PresentationErrorAlert': { __esModule: true, default: () => null } });
  return renderToStaticMarkup(React.createElement(load('src/components/PPTEvaluatorTab.tsx').default, { teamId: 'team-1' }));
}

test('real evaluator UI renders physical slide evidence and correct General/custom categories', () => {
  const feedback = { analysis: { mode: 'visual_text', pdfReceived: true }, slideFeedback, scoreDeductions: { team: 'Presentation pacing deduction.' } };
  const general = renderEvaluation(feedback);
  assert.match(general, /VISUAL \+ TEXT/); assert.match(general, /Slide 2: Prototype mockup/);
  assert.match(general, /does not establish a running implementation/); assert.match(general, /General Hackathon/);
  assert.match(general, /Impact &amp; Viability/); assert.match(general, /Presentation Quality/);
  assert.match(general, /24\/25/); assert.doesNotMatch(general, /24\/15/);
  const custom = renderEvaluation(feedback, 'specific');
  assert.match(custom, /Custom Criteria 4/); assert.match(custom, /Specific Hackathon/);
});

test('real evaluator UI retains legacy feedback, red flags and versions without claiming vision', () => {
  const html = renderEvaluation({ spocRedFlags: ['Legacy risk preserved'], slideRecommendations: { technicalApproach: 'Legacy architecture guidance preserved' }, scoreDeductions: { novelty: 'Legacy score explanation' } }, 'web_dev');
  assert.match(html, /TEXT ONLY/); assert.doesNotMatch(html, /VISUAL \+ TEXT/);
  assert.match(html, /Legacy risk preserved/); assert.match(html, /Legacy architecture guidance preserved/);
  assert.match(html, /Legacy score explanation/); assert.match(html, /Versions/); assert.match(html, /v3/);
});

test('PDF overload falls through to the working lite provider before sacrificing visual input', async () => {
  const calls = [];
  const { load } = harness({}, { fetch: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return url.includes('gemini-flash-lite-latest') ? aiResponse() : new Response('provider detail must never be persisted', { status: 503 });
  } });
  const extraction = await load(extractorPath).extractTextFromPDF(makePitchPdf());
  const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', extraction.rawDocumentText, { memberCount: 6 }, 'generic', undefined, extraction.pdf);
  assert.equal(result.analysis.mode, 'visual_text');
  assert.equal(calls.length, 3);
  assert(calls.every(call => call.body.contents[0].parts[0].inlineData?.mimeType === 'application/pdf'));
});

test('text-only topic guidance never masquerades as physical slides, including old history', () => {
  const html = renderEvaluation({ slideRecommendations: { technicalApproach: 'Architecture topic guidance' } });
  assert.match(html, /Topic recommendations/);
  assert.doesNotMatch(html, /Slide by slide|Slide 3:/);
});

test('reworded or omitted risks never receive a resolved claim', () => {
  const html = renderEvaluation({ criticalRisks: ['No measured accuracy results for the classifier.'] }, 'ai_genai', { criticalRisks: ['Classifier accuracy has not been validated.'] });
  assert(!html.includes('Resolved since'));
  assert(html.includes('Omission does not establish resolution'));
  assert(html.includes('No measured accuracy results'));
});

for (const [name, visualResult, code] of [
  ['malformed JSON', new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{broken' }] } }] })), 'invalid_json'],
  ['missing evidence', aiResponse({ ...scoring(), slideFeedback: undefined }), 'missing_slide_feedback'],
  ['invalid page references', aiResponse({ ...scoring(), slideFeedback: [{ ...slideFeedback[0], slideNumber: 99 }] }), 'invalid_slide_feedback'],
  ['invalid category score', aiResponse({ ...scoring(), scoreTech: 100 }), 'invalid_scores'],
  ['missing category deductions', aiResponse({ ...scoring(), scoreDeductions: {} }), 'invalid_deductions'],
  ['token truncation', new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(scoring()) }] } }] })), 'incomplete_response'],
  ['safety block', new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })), 'blocked_response'],
  ['empty result', new Response(JSON.stringify({ candidates: [] })), 'empty_response'],
  ['invalid response envelope', new Response('{bad envelope'), 'invalid_json'],
]) {
  test(`PDF fallback distinguishes ${name} without leaking provider content`, async () => {
    const { load } = harness({}, { fetch: async (_url, options) => JSON.parse(options.body).contents[0].parts[0].inlineData ? visualResult.clone() : aiResponse() });
    const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', 'Local extracted text.', undefined, 'generic', undefined, { bytes: makePitchPdf(), pageCount: 3, source: 'linked_pdf' });
    assert.equal(result.analysis.mode, 'text_only'); assert.equal(result.analysis.fallbackReason.code, code);
    assert(!JSON.stringify(result.analysis.fallbackReason).includes('{broken'));
    assert.equal(result.slideFeedback.length, 0);
  });
}

test('PDF diagnostics distinguish transport failure, timeout and insufficient budget', async () => {
  for (const [fetch, code] of [
    [async () => { throw new Error('credential or document content must not escape'); }, 'network_error'],
    [async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout with unsafe detail')))), 'timeout'],
  ]) {
    const { load } = harness({}, { fetch });
    await assert.rejects(load(gatewayPath).callGeminiDocument('fixture', makePitchPdf(), { perModelTimeoutMs: 5, maxAttempts: 1 }), error => error.failure.code === code && !JSON.stringify(error.failure).includes('unsafe'));
  }
  let calls = 0;
  const { load } = harness({}, { fetch: async () => { calls++; throw new Error('unexpected'); } });
  const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', 'Text', undefined, 'generic', undefined, { bytes: makePitchPdf(), pageCount: 3, source: 'linked_pdf' }, 0);
  assert.equal(calls, 0); assert.equal(result.analysis.fallbackReason.code, 'budget_exhausted');
});

test('PDF cascade retains earlier HTTP failures when the shared budget prevents another request', async () => {
  let now = 0, calls = 0;
  const { load } = harness({}, { Date: class extends Date { static now() { return now; } }, fetch: async () => { calls++; now += 10000; return new Response('', { status: 503 }); } });
  await assert.rejects(load(gatewayPath).callGeminiDocument('fixture', makePitchPdf()), error => {
    assert.equal(error.failure.code, 'budget_exhausted');
    assert.equal(error.failure.attempts.filter(attempt => attempt.httpStatus === 503).length, 2);
    return true;
  });
  assert.equal(calls, 2);
});

test('all rubric prompts and deductions align categories and prohibit invented eligibility/AI requirements', async () => {
  for (const track of ['generic', 'specific', 'web_dev', 'ai_genai']) {
    let prompt;
    const { load } = harness({}, { fetch: async (_url, options) => { prompt = JSON.parse(options.body).contents[0].parts[0].text; return aiResponse(scoring(track)); } });
    const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', 'Classifier architecture with measured precision and latency.', { memberCount: 6 }, track, 'Maximum team size: 5, per organizer rules.');
    const categories = load('src/lib/ppt/analysisMetadata.ts').getPitchCategories(track);
    for (const [key, category] of [['novelty', categories.novelty], ['tech', categories.tech], ['uiUx', categories.uiUxOrFeasibility], ['team', categories.impactOrTeam]]) {
      assert(prompt.includes(`scoreDeductions.${key}: ${category.label}`));
      assert(result.scoreDeductions[key].startsWith(category.label + ':'));
    }
    assert.match(prompt, /Never penalize the number of members/);
    assert.doesNotMatch(prompt, /Squads of 2–5|Vector database, chunking/);
    if (track === 'specific') assert.match(prompt, /Maximum team size: 5/);
    if (track === 'ai_genai') assert.match(prompt, /optional approaches, not prerequisites/);
    const heuristic = load(enginePath).generateHeuristicEvaluation;
    assert.deepEqual(JSON.parse(JSON.stringify(heuristic('Fixture', 'software', 'Classifier architecture with measured latency', undefined, 3, track))), JSON.parse(JSON.stringify(heuristic('Fixture', 'software', 'Classifier architecture with measured latency', undefined, 6, track))));
  }
});

test('track detection remains specialized when confident and General when ambiguous', () => {
  const detect = harness().load('src/lib/evaluator/trackDetection.ts').detectJudgingTrack;
  for (const [input, track] of [['Chennai Civic Hackathon', 'generic'], ['AI agents challenge', 'ai_genai'], ['Full-stack web challenge', 'web_dev']]) assert.equal(detect(input).detectedTrack, track);
});

for (const mode of ['visual_text', 'text_only']) {
test(`team API stores ${mode} JSONB diagnostics and history with missing track_id compatibility`, async () => {
  const writes = [], selects = []; let insertion = 0; let passedRubric;
  const extraction = await harness().load(extractorPath).extractTextFromPDF(makePitchPdf());
  const evaluation = { ...scoring('specific'), totalScore: 85, grade: 'Promising', usedAiFallback: false, analysis: { mode, pdfReceived: mode === 'visual_text', pageCount: 3, source: 'google_slides_pdf', ...(mode === 'text_only' ? { fallbackReason: { stage: 'request', code: 'http_error', model: 'gemini-flash-lite-latest', httpStatus: 503 } } : {}) } };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table) {
      let operation = 'select', payload, columns;
      const result = () => {
        if (table === 'teams') return { data: { id: 'team-1', owner_id: 'user-1', name: 'Fixture team', team_members: [], team_hackathons: [] } };
        if (table === 'profiles') return { data: { id: 'user-1', role: 'developer' } };
        if (table === 'team_members') return { data: { id: 'member-1' } };
        if (operation === 'insert') {
          writes.push({ operation, payload }); insertion++;
          return insertion === 1 ? { data: null, error: { code: 'PGRST204', message: "Could not find track_id in schema cache" } } : { data: { id: 'evaluation-3' }, error: null };
        }
        if (operation === 'update') { writes.push({ operation, payload }); return { data: { id: 'evaluation-3', version: 3, ...payload }, error: null }; }
        return { data: columns === 'version' ? [{ version: 2 }] : [], error: null };
      };
      const builder = {
        select(value) { columns = value; selects.push(value); return this; }, eq() { return this; }, gte() { return this; }, order() { return this; }, limit() { return this; },
        insert(value) { operation = 'insert'; payload = value; return this; }, update(value) { operation = 'update'; payload = value; return this; },
        maybeSingle: async () => result(), single: async () => result(), then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return builder;
    },
  };
  const { load, env } = harness({
    'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), { ...options, headers: { 'content-type': 'application/json' } }) } },
    '@supabase/supabase-js': { createClient: () => client },
    '@/lib/ppt/presentationExtractor': { ...harness().load(extractorPath), extractPresentationFromUrl: async () => extraction },
    '@/lib/ppt/evaluatorEngine': { runPitchDeckEvaluation: async (_title, _category, _text, _team, track, rubric, pdf) => { assert.equal(track, 'specific'); assert(pdf.bytes.equals(extraction.pdf.bytes)); passedRubric = rubric; return evaluation; } },
  });
  env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.invalid'; env.SUPABASE_SERVICE_ROLE_KEY = 'offline-key';
  const req = new Request('https://fixture.invalid/api/teams/team-1/ppt-evaluate', { method: 'POST', headers: { authorization: 'Bearer offline-token', 'content-type': 'application/json' }, body: JSON.stringify({ external_link_url: 'https://docs.google.com/presentation/d/local-id/edit', track_id: 'specific', customRubric: 'Organizer rubric stays intact.' }) });
  const response = await load('src/app/api/teams/[id]/ppt-evaluate/route.ts').POST(req, { params: Promise.resolve({ id: 'team-1' }) });
  const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(passedRubric, 'Organizer rubric stays intact.');
  assert.equal(writes[0].payload.track_id, 'specific'); assert.equal(writes[1].payload.track_id, undefined);
  assert.equal(writes[1].payload.version, 3);
  const completed = writes[2].payload;
  assert.deepEqual(completed.ai_feedback.analysis, evaluation.analysis); assert.equal(completed.ai_feedback.track_id, 'specific');
  assert.equal(completed.ai_feedback.customRubric, 'Organizer rubric stays intact.');
  assert.equal(completed.slide_breakdown.length, 3); assert.equal(completed.slide_breakdown[1].wordCount, 0);
  assert(!JSON.stringify(completed).includes(extraction.pdf.bytes.toString('base64')));
  assert.equal(body.evaluation.version, 3); assert.equal(writes.filter(write => write.operation === 'update').length, 1);
  assert(!selects.some(columns => typeof columns === 'string' && (columns.includes('owner_id, track') || columns.includes('name, tag'))));
});
}

function transport(responses, addresses = [{ address: '142.250.1.1', family: 4 }]) {
  const calls = [];
  return {
    calls,
    overrides: {
      'node:dns/promises': { lookup: async () => addresses },
      'node:https': { request(url, options, callback) {
        calls.push({ url: String(url), options });
        const req = new EventEmitter();
        req.end = () => queueMicrotask(() => {
          const response = responses.shift();
          if (!response) return req.emit('error', new Error('Unexpected request'));
          const stream = Readable.from(response.chunks || [Buffer.from('fixture')]);
          stream.statusCode = response.status || 200; stream.headers = response.headers || { 'content-type': 'application/pdf' };
          callback(stream);
        });
        return req;
      } },
    },
  };
}

test('safe download validates every redirect and pins public DNS without credentials', async () => {
  const mock = transport([{ status: 302, headers: { location: 'https://doc.googleusercontent.com/fixture' } }, { chunks: [Buffer.from('%PDF-fixture')] }]);
  const result = await harness(mock.overrides).load(downloadPath).downloadPresentation('https://drive.google.com/uc?id=fixture', 100, Date.now() + 5000);
  assert.equal(result.bytes.toString(), '%PDF-fixture'); assert.equal(mock.calls.length, 2);
  mock.calls[0].options.lookup('drive.google.com', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '142.250.1.1'); assert.equal(family, 4); });
  assert.equal(mock.calls[0].options.headers.Authorization, undefined);
  assert.equal(mock.calls[0].options.family, 4);
});

test('private DNS, IP redirects, credential URLs, and redirect loops are blocked', async () => {
  for (const address of ['127.0.0.1', '169.254.169.254', '10.0.0.1', '100.64.0.1', '::1', 'fc00::1', '::ffff:127.0.0.1']) {
    const mock = transport([], [{ address, family: address.includes(':') ? 6 : 4 }]);
    await assert.rejects(harness(mock.overrides).load(downloadPath).downloadPresentation('https://drive.google.com/uc?id=fixture', 100, Date.now() + 5000), /Private-network/);
    assert.equal(mock.calls.length, 0);
  }
  for (const location of ['http://drive.google.com/file', 'https://127.0.0.1/private', 'https://accounts.google.com/login', 'https://user:password@docs.google.com/secret', 'https://evil.example/file']) {
    const mock = transport([{ status: 302, headers: { location } }]);
    await assert.rejects(harness(mock.overrides).load(downloadPath).downloadPresentation('https://drive.google.com/uc', 100, Date.now() + 5000), /not allowed/);
    assert.equal(mock.calls.length, 1);
  }
  const loop = transport(Array.from({ length: 4 }, () => ({ status: 302, headers: { location: '/loop' } })));
  await assert.rejects(harness(loop.overrides).load(downloadPath).downloadPresentation('https://drive.google.com/uc', 100, Date.now() + 5000), /Too many/);
});

test('declared and streamed byte limits, compressed bodies, and deadlines are enforced', async () => {
  for (const response of [
    { headers: { 'content-length': '101' } },
    { chunks: [Buffer.alloc(60), Buffer.alloc(60)] },
    { headers: { 'content-encoding': 'gzip' } },
  ]) {
    const mock = transport([response]);
    await assert.rejects(harness(mock.overrides).load(downloadPath).downloadPresentation('https://drive.google.com/uc', 100, Date.now() + 5000));
  }
  const mock = transport([]);
  const stalled = { ...mock.overrides, 'node:dns/promises': { lookup: () => new Promise(() => {}) } };
  await assert.rejects(harness(stalled).load(downloadPath).downloadPresentation('https://drive.google.com/uc', 100, Date.now() + 10), /timed out/);
  assert.equal(mock.calls.length, 0);
});
