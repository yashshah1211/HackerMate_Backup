/* eslint-disable @typescript-eslint/no-require-imports -- Node-only synthetic benchmark infrastructure tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const benchmark = require('./fixtures/idea-quality-benchmarks.cjs');
const { validateBenchmark, createReviewPlan } = require('./idea-quality-benchmark.cjs');

test('benchmark infrastructure: 24 valid unique cases, four tracks, 19 relative expectations', () => {
  validateBenchmark(); assert.equal(benchmark.cases.length, 24); assert.equal(benchmark.expectations.length, 19);
  for (const tag of ['unsupported', 'plausible', 'meaningful_validation', 'buzzwords', 'unverified_metrics', 'simple_architecture', 'unnecessary_complexity', 'non_ai', 'optional_missing', 'optional_links', 'prompt_injection', 'low_effort', 'high_effort', 'wording_equivalence', 'length_equivalence', 'custom_rubric_switch']) {
    assert(benchmark.cases.some(c => c.tags.includes(tag)), tag);
  }
});
test('benchmark infrastructure: deterministic plan leaves all live quality properties unmeasured', () => {
  const first = createReviewPlan(); assert.deepEqual(first, createReviewPlan());
  assert.equal(first.primaryExecutions, 48); assert.equal(first.maximumProviderAttempts, 96);
  assert.equal(first.liveQualityMeasured, false); assert.equal(first.runs.length, 48);
  assert(first.expectations.every(e => e.status === 'unmeasured' && e.requiresRealModelOutputs));
  assert(!JSON.stringify(first).includes('totalScore')); // No invented target scores.
  for (const fixture of benchmark.cases) assert.equal(first.runs.filter(r => r.caseId === fixture.id).length, 2);
});
for (const count of [0, -1, 1.5, 4, '2', NaN]) test('benchmark infrastructure: rejects unbounded/invalid repetitions ' + count, () => {
  assert.throws(() => createReviewPlan(count));
});
for (const mutate of [
  b => { b.cases[1].id = b.cases[0].id; },
  b => { b.expectations[0].right = 'missing'; },
  b => { b.expectations[0].keys = ['unknown']; },
  b => { b.expectations[0].right = 'custom-specified'; },
  b => { b.expectations[0].requiresRealModelOutputs = false; },
  b => { b.cases[0].input.solutionDescription = 'x'.repeat(12001); },
  b => { b.expectations.push({ ...b.expectations[0] }); },
  b => { b.expectations.at(-1).right = 'custom-delivery-rubric'; },
]) test('benchmark infrastructure: malformed manifest fails closed: ' + mutate.toString(), () => {
  const copy = structuredClone(benchmark); mutate(copy); assert.throws(() => validateBenchmark(copy));
});
test('benchmark infrastructure: custom rubric switch keeps source fixed and changes authoritative labels', () => {
  const first = benchmark.cases.find(c => c.id === 'custom-specified').input;
  const second = benchmark.cases.find(c => c.id === 'custom-delivery-rubric').input;
  assert.equal(first.solutionDescription, second.solutionDescription); assert.notEqual(first.customRubric, second.customRubric);
});
