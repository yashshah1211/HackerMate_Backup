/* eslint-disable @typescript-eslint/no-require-imports -- Offline fixture regression tests. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { harness } = require('./ppt-vision-harness.cjs');
const { makePitchPdf } = require('./fixtures/pitch-pdf.cjs');
const { pitchOutput, makeBenchmarkPdf, cases, providerEnvelope, presentationSetup } = require('./fixtures/evaluator-benchmarks.cjs');

const extractionPath = 'src/lib/ppt/presentationExtractor.ts';
const enginePath = 'src/lib/ppt/evaluatorEngine.ts';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('PDF metadata identifies the exact downloaded bytes in a real extraction and synthetic provider response', async () => {
  const pdf = makePitchPdf('text', 3);
  const extraction = await harness().load(extractionPath).extractTextFromPDF(pdf, 'google_drive_pdf');
  assert.equal(extraction.success, true);
  const output = pitchOutput(extraction.rawDocumentText, 'generic', 'visual_text', [20, 19, 18, 17]);
  output.slideFeedback = [{ slideNumber: 1, title: 'Problem', observation: 'Problem statement is present.', recommendation: 'Add supporting evidence.' }];
  const { load } = harness({ '@/lib/ai/geminiClient': {
    callGeminiDocument: async () => ({ text: JSON.stringify(output), modelUsed: 'synthetic-model', latencyMs: 1 }),
    callGeminiText: async () => { throw Error('unexpected text call'); },
    extractJsonFromResponse: text => text,
  } });
  const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', extraction.rawDocumentText, {}, 'generic', undefined, extraction.pdf);
  assert.equal(result.analysis.pdfSha256, hash(pdf));
  assert.equal(result.analysis.pageCount, 3);
  assert.equal(result.analysis.pdfBytes, pdf.length);
  assert.equal(result.analysis.source, 'google_drive_pdf');
  assert.equal(result.analysis.modelUsed, 'synthetic-model');
  assert.equal(result.analysis.mode, 'visual_text');
  assert.equal(result.totalScore, 74);
  assert.equal(JSON.stringify(result).includes(pdf.toString('base64')), false);
});

test('matching requires an earlier completed record, the same team and a complete SHA-256', () => {
  const { findEarlierMatchingPdf } = harness().load('src/lib/ppt/analysisMetadata.ts');
  const digest = hash(Buffer.from('same bytes'));
  const row = (id, team, version, value, status = 'completed') => ({ id, team_id: team, version, status, ai_feedback: { analysis: { mode: 'visual_text', pdfReceived: true, pdfSha256: value } } });
  const current = row('new', 'team-a', 4, digest);
  const earlier = row('old', 'team-a', 2, digest);
  assert.equal(findEarlierMatchingPdf(current, [row('other-team', 'team-b', 3, digest), row('failed', 'team-a', 3, digest, 'failed'), earlier]), earlier);
  assert.equal(findEarlierMatchingPdf(current, [row('different', 'team-a', 1, hash(Buffer.from('different bytes')))]), undefined);
  assert.equal(findEarlierMatchingPdf(row('old-unknown', 'team-a', 4, undefined), [earlier]), undefined);
  assert.equal(findEarlierMatchingPdf(row('invalid', 'team-a', 4, 'abc'), [row('bad', 'team-a', 1, 'abc')]), undefined);
  assert.equal(findEarlierMatchingPdf(current, [row('future', 'team-a', 5, digest)]), undefined);
});

test('strong and weak local PDFs traverse the real extractor and bounded score contract with controlled model responses', async () => {
  const fixtures = cases.filter(item => item.pipeline === 'ppt' && item.track === 'generic' && item.mode === 'text_only' && ['strong', 'weak'].includes(item.quality));
  const totals = [];
  for (const fixture of fixtures) {
    const pdf = makeBenchmarkPdf(fixture.source);
    const extracted = await harness().load(extractionPath).extractTextFromPDF(pdf);
    assert.equal(extracted.success, true);
    const values = fixture.quality === 'strong' ? [21, 20, 19, 18] : [8, 7, 6, 5];
    const provider = pitchOutput(extracted.rawDocumentText, 'generic', 'visual_text', values);
    const { load } = harness({ '@/lib/ai/geminiClient': {
      callGeminiDocument: async (_prompt, bytes) => { assert(bytes.equals(pdf)); return { text: JSON.stringify(provider), modelUsed: 'offline-mock', latencyMs: 1 }; },
      extractJsonFromResponse: text => text,
    } });
    const result = await load(enginePath).runPitchDeckEvaluation('Fixture', 'software', extracted.rawDocumentText, {}, 'generic', undefined, extracted.pdf);
    assert.equal(result.analysis.mode, 'visual_text');
    assert.equal(result.analysis.pdfSha256, hash(pdf));
    assert.equal(result.totalScore, values.reduce((sum, value) => sum + value, 0));
    assert(result.analysis.evidence.criticalRisks.every(item => item.pageNumber === 1 && item.evidence.length > 0));
    totals.push({ quality: fixture.quality, total: result.totalScore });
  }
  assert(totals.find(item => item.quality === 'strong').total > totals.find(item => item.quality === 'weak').total);
  // Provider scores above are explicit mocks; this is not a live ranking or repeatability claim.
});

test('a second explicit request for the same bytes gets a new version and independent provider score', async () => {
  const { ppt, state } = presentationSetup({ mode: 'visual_text' });
  state.provider = async count => Response.json(providerEnvelope(pitchOutput(state.source, 'generic', 'visual_text', count === 1 ? [4, 4, 4, 4] : [8, 8, 8, 8])));
  const first = await ppt();
  assert.equal(first.status, 200);
  state.counters.clear(); // Advance only the in-memory fixture's cooldown and allowance state.
  const second = await ppt({}, { 'idempotency-key': 'offline-second-token-0002' });
  assert.equal(second.status, 200);
  assert.equal(first.body.evaluation.version, 1);
  assert.equal(second.body.evaluation.version, 2);
  assert.equal(first.body.evaluation.ai_feedback.analysis.pdfSha256, second.body.evaluation.ai_feedback.analysis.pdfSha256);
  assert.equal(first.body.evaluation.total_score, 16);
  assert.equal(second.body.evaluation.total_score, 32);
  assert.equal(state.calls.length, 2);
});

test('a completed database row with a different fingerprint is not confirmed as the generated result', async () => {
  const { ppt, state } = presentationSetup({ mode: 'visual_text' });
  state.afterMutation = (query, rows) => {
    if (query.operation === 'update' && query.payload.status === 'completed') rows[0].ai_feedback = {
      ...rows[0].ai_feedback, analysis: { ...rows[0].ai_feedback.analysis, pdfSha256: '0'.repeat(64) },
    };
  };
  const result = await ppt();
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'persistence_uncertain');
  assert.equal(result.body.success, false);
});
