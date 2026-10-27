/* eslint-disable @typescript-eslint/no-require-imports -- Focused offline real-module regression suite. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness } = require('./ppt-vision-harness.cjs');
const { makePitchPdf } = require('./fixtures/pitch-pdf.cjs');
const { pitchOutput, customRubric, presentationSetup } = require('./fixtures/evaluator-benchmarks.cjs');
const TEXT = 'Classifier architecture with measured precision and latency.';

const extractorPath = 'src/lib/ppt/presentationExtractor.ts';
const enginePath = 'src/lib/ppt/evaluatorEngine.ts';
const gatewayPath = 'src/lib/ai/geminiClient.ts';
const downloadPath = 'src/lib/ppt/presentationDownload.ts';
const slideFeedback = [
  { slideNumber: 1, title: 'Architecture', observation: 'Client, API and database blocks are already connected.', recommendation: 'Label the API-to-database arrow with the query and failure behavior.' },
  { slideNumber: 2, title: 'Prototype mockup', observation: 'An illustrative screen is present, but it does not establish a running implementation.', recommendation: 'Add an observed demo result and state which interactions work.' },
];
function scoring(track = 'generic', mode = 'visual_text', source = TEXT, points) {
 const output = pitchOutput(source, track, mode, points || [20,21,20,['generic','specific'].includes(track)?24:12]);
 if (mode === 'visual_text') output.slideFeedback = slideFeedback;
 return output;
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
    const result = await load(enginePath).runPitchDeckEvaluation('Local fixture', 'software', extraction.rawDocumentText, { memberCount: 3 }, track, track === 'specific' ? customRubric : undefined, extraction.pdf);
    assert.equal(result.analysis.mode, 'visual_text'); assert.equal(result.analysis.pdfReceived, true);
    assert.equal(result.usedAiFallback, false); assert.equal(result.trackId, track); assert.equal(calls.length, 1);
    const part = calls[0].body.contents[0].parts[0];
    assert.equal(part.inlineData.mimeType, 'application/pdf'); assert(Buffer.from(part.inlineData.data, 'base64').equals(pdf));
    const prompt = calls[0].body.contents[0].parts[1].text;
    assert.match(prompt, /Mockups are not proof/); assert.match(prompt, /physical page order/);
    assert.match(prompt, /self-reported performance, adoption and impact as claims, not independently verified results/);
    if (track === 'specific') assert(prompt.includes(customRubric));
    assert.equal(result.slideFeedback[0].slideNumber, 1); assert.match(result.slideFeedback[0].recommendation, /Label/);
    assert.match(result.slideFeedback[1].observation, /does not establish/);
    assert.equal(result.scoreTeam, ['generic', 'specific'].includes(track) ? 24 : 12);
    assert.equal(result.totalScore, 20 + 21 + 20 + result.scoreTeam);
  });
}

for (const status of [400, 401, 402, 403, 404, 429]) {
 test('document HTTP '+status+' stops without text bypass or numeric fallback', async()=>{
  let calls=0;const {load}=harness({}, {fetch:async()=>{calls++;return new Response('',{status})}});
  await assert.rejects(load(enginePath).runPitchDeckEvaluation('Fixture','software',TEXT,undefined,'generic',undefined,{bytes:makePitchPdf(),pageCount:3,source:'linked_pdf'}),e=>e.code==='provider_rejected');
  assert.equal(calls,1);
 });
}

test('invalid visual evidence is terminal and never bypassed through text', async()=>{
 let count=0;const {load}=harness({}, {fetch:async()=>{count++;return aiResponse({...scoring(),slideFeedback:[{...slideFeedback[0],slideNumber:99}]})}});
 await assert.rejects(load(enginePath).runPitchDeckEvaluation('Fixture','software',TEXT,undefined,'generic',undefined,{bytes:makePitchPdf(),pageCount:3,source:'linked_pdf'}),e=>e.code==='invalid_ai_output');assert.equal(count,1);
});

test('text fallback retains the original downloaded PDF identity without claiming visual analysis', async () => {
  const pdf = makePitchPdf('text');
  let calls = 0, source = '';
  const { load } = harness({}, { fetch: async () => ++calls === 1 ? new Response('', { status: 503 }) : aiResponse(scoring('generic', 'text_only', source)) });
  const extracted = await load(extractorPath).extractTextFromPDF(pdf, 'google_drive_pdf');
  source = extracted.rawDocumentText;
  const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', source, undefined, 'generic', undefined, extracted.pdf);
  assert.equal(result.analysis.mode, 'text_only');
  assert.equal(result.analysis.pdfReceived, false);
  assert.equal(result.analysis.pdfSha256, createHash('sha256').update(pdf).digest('hex'));
  assert.equal(result.analysis.pageCount, 3);
  assert.equal(calls, 2);
});

test('missing PDF is TEXT ONLY, default rubric is General, and low scores are not inflated', async () => {
  const calls = [];
  const { load } = harness({}, { fetch: async (_url, options) => { calls.push(JSON.parse(options.body)); return aiResponse(scoring('generic', 'text_only', 'Local extracted problem and solution text.', [1,2,3,4])); } });
  const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', 'Local extracted problem and solution text.');
  assert.equal(result.trackId, 'generic'); assert.equal(result.analysis.mode, 'text_only'); assert.equal(result.totalScore, 10);
  assert.equal(calls.length, 1); assert.equal(calls[0].contents[0].parts.length, 1);
});

test('missing key, exhausted budget and transport failure remain scoreless',async()=>{
 const {load,env}=harness();delete env.GEMINI_API_KEY;
 await assert.rejects(load(enginePath).runPitchDeckEvaluation('Fixture','software',TEXT),e=>e.code==='provider_unavailable');
 await assert.rejects(harness().load(enginePath).runPitchDeckEvaluation('Fixture','software',TEXT,undefined,'generic',undefined,undefined,0),e=>e.code==='deadline_exceeded');
 await assert.rejects(harness().load(enginePath).runPitchDeckEvaluation('Fixture','software',TEXT),e=>e.code==='provider_unavailable');
});

test('image-only PDF failure skips useless text model requests', async () => {
  let calls = 0;
  const { load } = harness({}, { fetch: async () => { calls++; return new Response('', { status: 429 }); } });
  const extraction = await load(extractorPath).extractTextFromPDF(makePitchPdf('images'));
  await assert.rejects(load(enginePath).runPitchDeckEvaluation('Fixture','software',extraction.rawDocumentText,undefined,'generic',undefined,extraction.pdf),e=>e.code==='provider_rejected');
  assert.equal(calls,1);
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
    [undefined, 'MODE UNRECORDED'], [{ usedAiFallback: true }, 'LEGACY HEURISTIC'],
    [{ analysis: { mode: 'visual_text', pdfReceived: true } }, 'VISUAL + TEXT'],
    [{ analysis: { mode: 'visual_text', pdfReceived: false } }, 'MODE UNRECORDED'],
    [{ analysis: { mode: 'text_only', pdfReceived: false } }, 'TEXT ONLY'],
  ]) {
    assert(renderToStaticMarkup(React.createElement(Badge, { feedback, currentResponse: true })).includes(label));
    const historical = renderToStaticMarkup(React.createElement(Badge, { feedback }));
    assert(historical.includes('Historical provenance unverified'));
    assert(!historical.includes('VISUAL + TEXT'));
  }
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
  assert.match(general, /Historical provenance unverified/); assert.doesNotMatch(general, /VISUAL \+ TEXT/); assert.match(general, /Slide 2: Prototype mockup/);
  assert.match(general, /does not establish a running implementation/); assert.match(general, /General Hackathon/);
  assert.match(general, /Impact &amp; Viability/); assert.match(general, /Presentation Quality/);
  assert.match(general, /24\/25/); assert.doesNotMatch(general, /24\/15/);
  const custom = renderEvaluation(feedback, 'specific');
  assert.match(custom, /Custom Criteria 4/); assert.match(custom, /Specific Hackathon/);
});

test('real evaluator UI retains legacy feedback, red flags and versions without claiming vision', () => {
  const html = renderEvaluation({ spocRedFlags: ['Legacy risk preserved'], slideRecommendations: { technicalApproach: 'Legacy architecture guidance preserved' }, scoreDeductions: { novelty: 'Legacy score explanation' } }, 'web_dev');
  assert.match(html, /Historical provenance unverified/); assert.doesNotMatch(html, /VISUAL \+ TEXT/);
  assert.match(html, /Legacy risk preserved/); assert.match(html, /Legacy architecture guidance preserved/);
  assert.match(html, /Legacy score explanation/); assert.match(html, /Versions/); assert.match(html, /v3/);
});

test('repeated PDF is identified as a separate evaluation without certifying historical provenance', () => {
  const digest = 'a'.repeat(64);
  const analysis = { mode: 'visual_text', pdfReceived: true, pdfSha256: digest, source: 'google_drive_pdf', pageCount: 6, modelUsed: 'gemini-3.5-flash-lite' };
  const html = renderEvaluation({ analysis }, 'generic', { analysis });
  assert.match(html, /Recorded PDF SHA-256/);
  assert(html.includes(digest));
  assert.match(html, /Recorded PDF matches evaluation v2/);
  assert.match(html, /separate evaluation of the same document; scores may vary/);
  assert.match(html, /Historical provenance unverified/);
});

test('native PDF uses one pinned lite model with a bounded attempt',async()=>{
 const calls=[];const {load}=harness({}, {fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return aiResponse()}});
 const result=await load(enginePath).runPitchDeckEvaluation('Fixture','software',TEXT,undefined,'generic',undefined,{bytes:makePitchPdf(),pageCount:3,source:'linked_pdf'});
 assert.equal(result.analysis.mode,'visual_text');assert.equal(calls.length,1);assert(calls[0].url.includes('gemini-3.5-flash-lite'));assert(calls[0].body.contents[0].parts[0].inlineData);
});

test('text-only topic guidance never masquerades as physical slides, including old history', () => {
  const html = renderEvaluation({ slideRecommendations: { technicalApproach: 'Architecture topic guidance' } });
  assert.match(html, /Topic recommendations/);
  assert.doesNotMatch(html, /Slide by slide|Slide 3:/);
});

test('reworded or omitted risks never receive a resolved claim', () => {
  const html = renderEvaluation({ criticalRisks: ['No measured accuracy results for the classifier.'] }, 'ai_genai', { criticalRisks: ['Classifier accuracy has not been validated.'] });
  assert(!html.includes('Resolved since'));
  // Unversioned historical rubrics are not compared as equivalent.
  assert(!html.includes('Change since'));
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
  test('PDF rejects '+name+' without text bypass or private error output',async()=>{
    let count=0;const {load}=harness({}, {fetch:async()=>{count++;return visualResult.clone()}});
    await assert.rejects(load(enginePath).runPitchDeckEvaluation('Fixture','software',TEXT,undefined,'generic',undefined,{bytes:makePitchPdf(),pageCount:3,source:'linked_pdf'}),e=>['invalid_ai_output','blocked_content'].includes(e.code)&&!e.message.includes('{broken'));
    assert.equal(count,1);assert(code);
  });
}


test('PDF transport failures and timeouts are sanitized; no-budget makes no request',async()=>{
 for(const fetch of [async()=>{throw Error('private detail')},async()=>new Promise(()=>{})]) {
  const {load}=harness({}, {fetch});await assert.rejects(load(gatewayPath).callGeminiDocument('fixture',makePitchPdf(),{perModelTimeoutMs:5}),e=>e.code==='provider_unavailable'&&!e.message.includes('private'));
 }
 let calls=0;const {load}=harness({}, {fetch:async()=>{calls++;throw Error('unexpected')}});
 await assert.rejects(load(enginePath).runPitchDeckEvaluation('Fixture','software',TEXT,undefined,'generic',undefined,{bytes:makePitchPdf(),pageCount:3,source:'linked_pdf'},0),e=>e.code==='deadline_exceeded');assert.equal(calls,0);
});
test('lite PDF 503 consumes one document attempt and records fixed diagnostics',async()=>{
 const context={deadlineAt:Date.now()+30000,attempts:0};let calls=0;
 const {load}=harness({}, {fetch:async url=>{calls++;assert(url.includes('gemini-3.5-flash-lite'));return new Response('',{status:503})}});
 await assert.rejects(load(gatewayPath).callGeminiDocument('fixture',makePitchPdf(),{execution:context}),e=>e.code==='provider_unavailable');assert.equal(calls,1);assert.equal(context.trace[0].httpStatus,503);
});

test('all rubric prompts and deductions align categories and prohibit invented eligibility/AI requirements', async () => {
  for (const track of ['generic', 'specific', 'web_dev', 'ai_genai']) {
    let prompt;
    const { load } = harness({}, { fetch: async (_url, options) => { prompt = JSON.parse(options.body).contents[0].parts[0].text; return aiResponse(scoring(track, 'text_only')); } });
    const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', 'Classifier architecture with measured precision and latency.', { memberCount: 6 }, track, track === 'specific' ? customRubric : undefined);
    const categories = load('src/lib/ppt/analysisMetadata.ts').getPitchCategories(track);
    for (const [key, category] of [['novelty', categories.novelty], ['tech', categories.tech], ['uiUx', categories.uiUxOrFeasibility], ['team', categories.impactOrTeam]]) {
      if (track !== 'specific') assert(prompt.includes(category.label));
      assert(result.scoreDeductions[key].includes('Lost '));
    }
    assert.match(prompt, /Do not impose gender, team size/);
    assert.doesNotMatch(prompt, /Squads of 2–5|Vector database, chunking/);
    if (track === 'specific') assert(prompt.includes(customRubric));
    if (track === 'ai_genai') assert.match(prompt, /optional, never universal requirements/);
    const heuristic = load(enginePath).generateHeuristicEvaluation;
    assert.deepEqual(JSON.parse(JSON.stringify(heuristic('Fixture', 'software', 'Classifier architecture with measured latency', undefined, 3, track))), JSON.parse(JSON.stringify(heuristic('Fixture', 'software', 'Classifier architecture with measured latency', undefined, 6, track))));
  }
});

test('track detection remains specialized when confident and General when ambiguous', () => {
  const detect = harness().load('src/lib/evaluator/trackDetection.ts').detectJudgingTrack;
  for (const [input, track] of [['Chennai Civic Hackathon', 'generic'], ['AI agents challenge', 'ai_genai'], ['Full-stack web challenge', 'web_dev']]) assert.equal(detect(input).detectedTrack, track);
});

for(const mode of ['visual_text','text_only']) test('team route preserves '+mode+' metadata across missing track column',async()=>{
 const {ppt,state}=presentationSetup({mode,track:'specific',trackError:'PGRST204'});
 const result=await ppt({customRubric});assert.equal(result.status,200,JSON.stringify(result.body));
 const inserts=state.writes.filter(q=>q.operation==='insert');assert.equal(inserts.length,2);assert.equal(inserts[0].payload.track_id,'specific');assert.equal(inserts[1].payload.track_id,undefined);
 const completed=state.writes.find(q=>q.operation==='update'&&q.payload.status==='completed').payload;
 assert.equal(completed.ai_feedback.analysis.mode,mode);assert.equal(completed.ai_feedback.track_id,'specific');assert.equal(completed.ai_feedback.customRubric,customRubric);
 if (mode === 'visual_text') assert.match(completed.ai_feedback.analysis.pdfSha256, /^[a-f0-9]{64}$/);
 else assert.equal(completed.ai_feedback.analysis.pdfSha256, undefined);
 assert.equal(completed.ai_feedback.analysis.rubricVersion,'ppt-v1');assert(!JSON.stringify(completed).includes('base64'));assert.equal(result.body.evaluation.version,1);
});

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
