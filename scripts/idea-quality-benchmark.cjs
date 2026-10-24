/* eslint-disable @typescript-eslint/no-require-imports -- Pure offline benchmark manifest tooling. */
const assert = require('node:assert/strict');
const benchmark = require('./fixtures/idea-quality-benchmarks.cjs');
const keys = ['novelty', 'tech', 'uiUxOrFeasibility', 'impactOrTeam'];

// No provider imports, credentials, network, environment loading or database clients.
function validateBenchmark(value = benchmark) {
  assert.equal(value.requiresRealModelOutputs, true);
  assert(value.cases.length >= 16);
  const ids = new Set();
  for (const fixture of value.cases) {
    assert(!ids.has(fixture.id), 'Duplicate case ID'); ids.add(fixture.id);
    assert(fixture.tags.length && fixture.expectedPrinciples.length);
    const { input } = fixture;
    assert(['web_dev', 'ai_genai', 'generic', 'specific'].includes(input.trackId));
    assert(input.psTitle.trim() && input.psTitle.length <= 200);
    assert(input.solutionDescription.trim() && input.solutionDescription.length <= 12000);
    if (input.trackId === 'specific') {
      const { criteria } = JSON.parse(input.customRubric);
      assert.equal(criteria.length, 4); assert.equal(new Set(criteria.map(c => c.label)).size, 4);
      for (const criterion of criteria) assert(criterion.label.trim() && criterion.label.length <= 100 && criterion.maxPoints === 25);
    }
  }
  assert.equal(new Set(value.cases.map(c => c.input.trackId)).size, 4);
  const expectationIds = new Set();
  for (const expectation of value.expectations) {
    assert(!expectationIds.has(expectation.id), 'Duplicate expectation ID'); expectationIds.add(expectation.id);
    assert(ids.has(expectation.left) && ids.has(expectation.right), 'Unknown comparison case');
    assert.notEqual(expectation.left, expectation.right);
    assert(['higher', 'equivalent', 'not_lower'].includes(expectation.relation));
    assert(expectation.keys.length && expectation.keys.every(key => keys.includes(key)));
    assert(expectation.reason.trim()); assert.equal(expectation.requiresRealModelOutputs, true);
    const left = value.cases.find(c => c.id === expectation.left).input;
    const right = value.cases.find(c => c.id === expectation.right).input;
    assert.equal(left.trackId, right.trackId, 'Comparisons must use the same rubric');
    assert.equal(left.customRubric, right.customRubric, 'Comparisons must use the same rubric');
  }
  return value;
}

// A review plan, never a quality pass/fail computed from canned provider scores.
function createReviewPlan(repetitions = 2, value = benchmark) {
  assert(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 3);
  validateBenchmark(value);
  return {
    benchmarkId: value.id, kind: 'offline_review_plan', liveQualityMeasured: false,
    primaryExecutions: value.cases.length * repetitions,
    maximumProviderAttempts: value.cases.length * repetitions * 2,
    runs: value.cases.flatMap(fixture => Array.from({ length: repetitions }, (_, repeat) => ({ caseId: fixture.id, repeat: repeat + 1, input: fixture.input }))),
    expectations: value.expectations.map(expectation => ({ ...expectation, status: 'unmeasured' })),
    limitation: value.limitation,
  };
}

module.exports = { validateBenchmark, createReviewPlan };
if (require.main === module) process.stdout.write(JSON.stringify(createReviewPlan(), null, 2) + '\n');
