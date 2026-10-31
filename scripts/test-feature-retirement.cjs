/* eslint-disable @typescript-eslint/no-require-imports -- Offline retirement and surviving PPT contracts. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { harness, ROOT } = require('./ppt-vision-harness.cjs');
const { presentationSetup } = require('./fixtures/evaluator-benchmarks.cjs');
const retired = ['src/app/evaluator', 'src/app/tools/pitch-evaluator', 'src/app/challenges',
  'src/app/api/evaluator', 'src/app/api/challenges', 'src/app/api/admin/challenges',
  'src/components/challenges', 'src/lib/challenges'];
function files(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]) : [];
}
for (const dir of retired) test('retired feature contains no executable files: ' + dir, () => {
  assert.deepEqual(files(path.join(ROOT, dir)), []);
});
test('active source has no retired endpoints, tables, prefill or imports', () => {
  for (const file of files(path.join(ROOT, 'src'))) {
    if (!/\.(?:ts|tsx|js|jsx)$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    assert(!/user_pitch_evaluations|weekly_challenges|challenge_submissions|hackermate_team_prefill|LinkedIdeaScorecard|PitchEvaluatorClient|lib\/challenges|["'`]\/(?:api\/)?(?:admin\/)?(?:evaluator|challenges)(?:[\/"'`?])|\/tools\/pitch-evaluator/.test(source), file);
  }
});
test('campus navigation survives while retired sections and detail mappings are absent', () => {
  const nav = harness().load('src/components/shell/navConfig.tsx');
  assert(nav.NAV_ITEMS.some(item => item.href === '/leaderboard'));
  for (const route of ['/evaluator', '/tools/pitch-evaluator', '/challenges', '/challenges/old']) {
    assert.equal(nav.sectionFor(route), null);
    assert.equal(nav.isDetailRoute(route), false);
  }
  assert.equal(nav.sectionFor('/leaderboard'), 'leaderboard');
  for (const route of ['src/app/leaderboard/page.tsx', 'src/app/expo/printables/challenges/page.tsx',
    'src/app/teams/create/page.tsx', 'src/app/partners/[slug]/page.tsx',
    'src/app/api/teams/[id]/ppt-evaluate/route.ts', 'src/app/api/teams/[id]/ppt-evaluations/route.ts']) {
    assert(fs.existsSync(path.join(ROOT, route)), route);
  }
});
test('old standalone PPT alias leads to teams, not a fake standalone tool', () => {
  let destination;
  const loader = harness({ 'next/navigation': { redirect(url) { destination = url; } } });
  loader.load('src/app/tools/ppt-evaluator/page.tsx').default();
  assert.equal(destination, '/my-teams');
  assert(fs.existsSync(path.join(ROOT, 'src/app/my-teams/page.tsx')));
});
test('M1 migration remains byte-normalized identical; historical tables are not retired by SQL', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261024030634_mission05_evaluator_result_authority.sql'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(sql).digest('hex'), '35336ee3c43dddb513dc92ce235c17b4ee3d6811eff18eade9b7b7a0c86ff5a3');
});
function quotaFixture(options = {}) {
  const f = presentationSetup(options);
  const guard = f.loader.load('src/lib/evaluator/evaluatorBudgetGuard.ts');
  const run = (token = 'synthetic-retirement-token-0001', actor = f.USER, target = f.TEAM) => guard.reserveEvaluation(f.admin,
    { deadlineAt: Date.now() + 5000, attempts: 0 }, { pipeline: 'ppt', actor, target, idempotencyKey: token });
  const releaseActive = () => { for (const [key, row] of f.state.counters) if (key.endsWith('active')) row.resetMs = Date.now() - 1; };
  return { ...f, run, releaseActive };
}
test('PPT exact duplicate is rejected without reserving additional allowance', async () => {
  const f = quotaFixture(); await f.run();
  const before = JSON.stringify([...f.state.counters]);
  await assert.rejects(f.run(), e => e.code === 'duplicate_request');
  assert.equal(JSON.stringify([...f.state.counters]), before);
});
test('PPT token spraying cannot bypass active cooldown or grow idempotency keys', async () => {
  const f = quotaFixture(); await f.run();
  for (let i = 0; i < 8; i++) await assert.rejects(f.run('synthetic-spray-token-' + i), e => e.code === 'cooldown');
  assert.equal([...f.state.counters.keys()].filter(key => key.includes(':idem:')).length, 1);
  assert.equal(f.state.calls.length, 0);
});
test('PPT retains exactly 15 attempts per target over its rolling 24-hour window', async () => {
  const f = quotaFixture();
  for (let i = 0; i < 15; i++) { await f.run('synthetic-boundary-token-' + i); f.releaseActive(); }
  await assert.rejects(f.run('synthetic-boundary-denied'), e => e.code === 'admission_limit');
  const entries = [...f.state.counters];
  assert.equal(entries.filter(([key]) => key.includes(':idem:')).length, 15);
  const quota = entries.find(([key]) => key.endsWith(':attempts'))[1];
  assert.equal(quota.count, 16); assert(quota.resetMs > Date.now() + 86_390_000);
  assert(!JSON.stringify(entries).includes(f.USER)); assert(!JSON.stringify(entries).includes(f.TEAM));
});
test('PPT actor and target cooldowns remain independently enforced', async () => {
  const f = quotaFixture(); await f.run();
  await assert.rejects(f.run('synthetic-other-token-0001', 'other-synthetic-actor'), e => e.code === 'cooldown');
  f.releaseActive();
  await f.run('synthetic-other-token-0001', 'other-synthetic-actor', 'other-synthetic-team');
  assert.equal([...f.state.counters.keys()].filter(key => key.includes(':idem:')).length, 2);
});
for (const key of ['', 'short', '<invalid-token>']) test('PPT rejects invalid token before any quota mutation: ' + key, async () => {
  const f = quotaFixture(); await assert.rejects(f.run(key), e => e.code === 'invalid_input');
  assert.equal(f.state.counters.size, 0); assert.equal(f.state.calls.length, 0);
});
test('PPT exact token lookup failures fail closed', async () => {
  const f = quotaFixture({ queryOverride(q) { if (q.table === 'rate_limits') return { data: null, error: { code: '42501' } }; } });
  await assert.rejects(f.run(), e => e.code === 'limiter_unavailable');
  assert.equal(f.state.counters.size, 0); assert.equal(f.state.calls.length, 0);
});
for (const data of [[], [{ allowed: 'true' }], [{ allowed: true, remaining: -1, reset_time: 'invalid' }]]) test('PPT malformed quota result fails closed: ' + JSON.stringify(data), async () => {
  const f = quotaFixture({ rateOverride: { data, error: null } });
  await assert.rejects(f.run(), e => e.code === 'limiter_unavailable'); assert.equal(f.state.calls.length, 0);
});
for (const status of [400, 401, 402, 403, 404, 429]) test('shared gateway preserves one-attempt non-retryable HTTP ' + status, async () => {
  const f = presentationSetup({ provider: () => new Response('private synthetic detail', { status }) });
  await assert.rejects(f.loader.load('src/lib/ai/geminiClient.ts').callGeminiText('Synthetic fixture'), e => ['provider_rejected', 'provider_unavailable'].includes(e.code));
  assert.equal(f.state.calls.length, 1); assert(!JSON.stringify(f.state.logs).includes('private synthetic detail'));
});
