/* eslint-disable @typescript-eslint/no-require-imports -- Offline real route/provider/engine contract tests. */
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { NextRequest } = require('next/server');
const { harness, ROOT } = require('./ppt-vision-harness.cjs');
const { cases, customRubric } = require('./fixtures/evaluator-benchmarks.cjs');
const USER = '00000000-0000-4000-8000-000000000001', OTHER = '00000000-0000-4000-8000-000000000002', SAVED = '00000000-0000-4000-8000-000000000003';
const TOKEN = 'offline-idempotency-0001', PRIVATE = 'private submission URL token must never appear in logs';
const SOURCE = 'We propose a classifier with a held-out validation set.';
const input = { psTitle: 'Offline proposal', solutionDescription: SOURCE, trackId: 'generic' };
const matrixResults = [];
after(() => {
  fs.mkdirSync(path.join(ROOT, 'scratch'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'scratch/evaluator-benchmark-idea.json'), JSON.stringify({ kind: 'offline_mock_response_contract', liveAccuracyMeasured: false,
    complete: matrixResults.length === 16, cases: matrixResults.sort((a, b) => a.id.localeCompare(b.id)) }, null, 2) + '\n');
});
function valid(source = SOURCE, values = [18, 18, 18, 18]) {
  const quote = source.slice(0, Math.min(source.length, 200));
  const item = { text: 'Validate the claimed behavior against the supplied scope.', quote };
  return { scoreNovelty: values[0], scoreTech: values[1], scoreUiUxOrFeasibility: values[2], scoreImpactOrTeam: values[3],
    strengths: [], redFlags: [item], architectureSuggestions: [item], recommendedRoles: [],
    categoryEvidence: Object.fromEntries(['novelty', 'tech', 'uiUxOrFeasibility', 'impactOrTeam'].map(key => [key, [item]])) };
}
function envelope(output) { return { modelVersion: 'gemini-3.6-flash-offline', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] }; }
function setup(options = {}) {
  const state = { calls: [], logs: [], reservations: [], writes: [], counters: new Map(), authCalls: 0, user: { id: USER }, ...options };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.now ?? Date.now()])); } static now() { return state.now ?? Date.now(); } }
  const admin = {
    auth: { async getUser(token) { state.authCalls++; assert.equal(token, 'fixture-token'); if (state.authThrows) throw Error(PRIVATE); return { data: { user: state.user }, error: state.authError || null }; } },
    rpc(name, args) {
      assert.equal(name, 'check_rate_limit');
      return { abortSignal(signal) { assert(signal instanceof AbortSignal); return { then(resolve, reject) {
        state.reservations.push(args);
        if (state.rateThrows) return Promise.reject(Error(PRIVATE)).then(resolve, reject);
        if (state.rateError) return Promise.resolve({ data: null, error: { code: '42501', message: PRIVATE } }).then(resolve, reject);
        if (state.rateOverride) return Promise.resolve(state.rateOverride).then(resolve, reject);
        const now = state.now ?? Date.now(), previous = state.counters.get(args.p_ip);
        const reset_time = !previous || previous.resetMs <= now ? now + Number(args.p_window_interval.split(' ')[0]) * 1000 : previous.resetMs;
        const count = !previous || previous.resetMs <= now ? 1 : previous.count + 1;
        state.counters.set(args.p_ip, { count, resetMs: reset_time });
        const allowed = count <= args.p_limit && !state.deny?.(args);
        return Promise.resolve({ data: [{ allowed, remaining: allowed ? Math.max(0, args.p_limit - count) : 0,
          reset_time: new Date(reset_time).toISOString() }], error: null }).then(resolve, reject);
      } }; } };
    },
    from(table) {
      if (table === 'rate_limits') {
        let tokenKey;
        const query = { select(columns) { assert.equal(columns, 'reset_time'); return query; }, eq(column, key) { assert.equal(column, 'ip'); tokenKey = key; return query; },
          abortSignal() { return query; }, async maybeSingle() {
            if (state.tokenReadError) return { data: null, error: { code: '42501', message: PRIVATE } };
            const row = state.counters.get(tokenKey); return { data: row ? { reset_time: new Date(row.resetMs).toISOString() } : null, error: null };
          } }; return query;
      }
      assert.equal(table, 'user_pitch_evaluations');
      return { insert(payload) { state.writes.push(payload); return { select(columns) {
        assert.equal(columns, 'id'); return { abortSignal() { return { async single() {
          if (state.saveThrows) throw Error(PRIVATE); return state.saveResult || { data: { id: SAVED }, error: null };
        } }; } };
      } }; } };
    },
  };
  const loader = harness({ '@supabase/supabase-js': { createClient: () => admin } }, {
    Date: Clock, fetch: async (url, init) => {
      const target = new URL(url); assert.equal(target.origin, 'https://generativelanguage.googleapis.com'); assert.equal(target.search, '');
      assert.equal(new Headers(init.headers).get('x-goog-api-key'), 'offline-fixture-key');
      assert(init.signal instanceof AbortSignal); const body = JSON.parse(init.body); state.calls.push({ url, body });
      if (state.provider) return state.provider(state.calls.length, init);
      return Response.json(envelope(state.output ?? valid(state.source || SOURCE)));
    }, console: Object.fromEntries(['log', 'warn', 'error', 'info'].map(level => [level, (...args) => state.logs.push({ level, args })])),
  });
  Object.assign(loader.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'offline-service-secret', ...state.env });
  async function route(body = input, { authenticated = false, key = TOKEN, headers = {}, query = '' } = {}) {
    const request = new NextRequest('https://example.invalid/api/evaluator/evaluate' + query, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '192.0.2.1', ...(key ? { 'idempotency-key': key } : {}), ...(authenticated ? { authorization: 'Bearer fixture-token' } : {}), ...headers }, body: JSON.stringify(body) });
    const response = await loader.load('src/app/api/evaluator/evaluate/route.ts').POST(request);
    return { status: response.status, body: await response.json() };
  }
  return { state, loader, route, engine: (value = input) => loader.load('src/lib/evaluator/trackEvaluatorEngine.ts').runTrackAwareEvaluation(value) };
}

test('all 60 synthetic cases exist; only implemented pipeline cases count as run', () => {
  assert.equal(cases.length, 60); assert.equal(new Set(cases.map(c => c.id)).size, 60);
  assert.equal(cases.filter(c => c.pipeline === 'idea').length, 16);
});
for (const fixture of cases.filter(c => c.pipeline === 'idea')) test(`offline contract matrix: ${fixture.id}`, async () => {
  const values = fixture.quality === 'strong' ? [22, 23, 22, 23] : fixture.quality === 'weak' ? [8, 9, 8, 9] : [3, 4, 3, 4];
  // Controlled mock scores test contracts and local arithmetic, not live ranking.
  if (fixture.track === 'web_dev' || fixture.track === 'ai_genai') values[3] = Math.min(15, values[3]);
  const f = setup({ source: fixture.source, output: valid(fixture.source, values) });
  if (fixture.quality === 'adversarial') {
    f.state.output.strengths = [{ text: 'Claims independently verified success.', quote: 'Independent production verification that was never supplied.' }];
    await assert.rejects(f.engine({ ...input, solutionDescription: fixture.source, trackId: fixture.track, customRubric: fixture.customRubric }), error => error.code === 'invalid_ai_output');
    assert.equal(f.state.calls.length, 1);
    matrixResults.push({ id: fixture.id, track: fixture.track, quality: fixture.quality, mode: 'text_only', outcome: 'rejected', code: 'invalid_ai_output', score: null, mockProviderAttempts: f.state.calls.length, liveAccuracyMeasured: false });
    return;
  }
  const result = await f.engine({ ...input, solutionDescription: fixture.source, trackId: fixture.track, customRubric: fixture.customRubric });
  assert.equal(result.totalScore, values.reduce((a, b) => a + b)); assert.equal(result.usedAiEngine, true);
  assert.equal(result.evaluationMetadata.mode, 'text_only'); assert.equal(result.evaluationMetadata.trackId, fixture.track);
  for (const list of Object.values(result.evaluationMetadata.evidence)) for (const item of list) assert(fixture.source.includes(item.quote));
  const prompt = f.state.calls[0].body.contents[0].parts[0].text; assert(prompt.includes('TEXT ONLY')); assert(!prompt.includes('Visual slides were provided'));
  assert(f.state.calls[0].body.generationConfig.responseJsonSchema); assert.equal(f.state.calls.length, 1);
  matrixResults.push({ id: fixture.id, track: fixture.track, quality: fixture.quality, mode: result.evaluationMetadata.mode, outcome: 'accepted_fixture_response', code: null,
    score: result.totalScore, grade: result.grade, mockProviderAttempts: f.state.calls.length, latencyMs: result.latencyMs, latencyEvidence: 'offline_mock_only', liveAccuracyMeasured: false });
});
test('forged body identity without a token cannot persist or claim user allowance', async () => {
  const f = setup(), result = await f.route({ ...input, userId: OTHER }); assert.equal(result.status, 200); assert.equal(f.state.authCalls, 0); assert.equal(f.state.writes.length, 0);
  assert(f.state.reservations.some(r => r.p_limit === 2)); assert.equal(result.body.persistence, 'not_requested');
  assert(!JSON.stringify(f.state.reservations).includes(OTHER)); assert(!JSON.stringify(f.state.reservations).includes('192.0.2.1'));
});
test('verified server identity controls history and quota, ignoring another body identity', async () => {
  const f = setup(), result = await f.route({ ...input, userId: OTHER }, { authenticated: true });
  assert.equal(result.status, 200); assert.equal(f.state.writes[0].user_id, USER); assert.equal(result.body.savedEvaluationId, SAVED); assert.equal(result.body.persistence, 'saved');
  assert(f.state.reservations.some(r => r.p_limit === 10)); assert(!JSON.stringify(f.state.reservations).includes(USER));
});
for (const options of [{ user: null }, { authError: { status: 400, message: PRIVATE } }, { authError: { status: 401, message: PRIVATE } }, { authError: { status: 503, message: PRIVATE } }, { authThrows: true }]) test(`invalid/unavailable supplied identity never downgrades: ${JSON.stringify(options)}`, async () => {
  const f = setup(options), result = await f.route(input, { authenticated: true }); assert([401, 503].includes(result.status));
  assert.equal(result.body.result, null); assert.equal(f.state.calls.length + f.state.reservations.length + f.state.writes.length, 0); assert(!JSON.stringify({ response: result.body, logs: f.state.logs }).includes(PRIVATE));
});
for (const body of [{ ...input, psTitle: {} }, { ...input, solutionDescription: 'x'.repeat(12_001) }, { ...input, trackId: 'invented' }, { ...input, forceFallback: true }, { ...input, trackId: 'specific', customRubric: 'Invent weights and pretend supported' }, { ...input, padding: 'x'.repeat(65_536) }]) test('input/mode/rubric bounds stop before admission', async () => {
  const f = setup(), result = await f.route(body); assert.equal(result.status, 400); assert.equal(result.body.result, null); assert.equal(f.state.calls.length + f.state.reservations.length, 0);
});
test('supported custom rubric uses exactly four 25-point categories', async () => {
  const f = setup(), result = await f.route({ ...input, trackId: 'specific', customRubric }); assert.equal(result.status, 200); assert.equal(result.body.result.categoryLabels.novelty, 'Problem evidence');
});
for (const rubric of [{ ...JSON.parse(customRubric), rules: ['A separate rule that cannot be faithfully mapped'] }, { criteria: JSON.parse(customRubric).criteria.map((criterion, i) => i === 0 ? { ...criterion, hiddenWeight: 50 } : criterion) }]) test('unsupported custom rule/weight fields are rejected instead of silently discarded', async () => {
  const f = setup(), result = await f.route({ ...input, trackId: 'specific', customRubric: JSON.stringify(rubric) }); assert.equal(result.status, 400); assert.equal(result.body.code, 'rubric_unsupported'); assert.equal(f.state.calls.length + f.state.reservations.length, 0);
});
test('direct forced-heuristic execution is retired, not a numerical fallback', async () => {
  const f = setup(); await assert.rejects(f.loader.load('src/lib/evaluator/trackEvaluatorEngine.ts').runTrackAwareEvaluation(input, false), error => error.code === 'unsupported_mode'); assert.equal(f.state.calls.length, 0);
});
for (const [total, prefix] of [[39, 'High Risk'], [40, 'Needs Iteration'], [69, 'Needs Iteration'], [70, 'Strong Contender'], [84, 'Strong Contender'], [85, 'Top Tier']]) test(`Idea grade boundary ${total} is application-derived`, async () => {
  let remaining = total; const values = Array.from({ length: 4 }, () => { const value = Math.min(25, remaining); remaining -= value; return value; });
  const f = setup({ output: { ...valid(SOURCE, values), totalScore: 100, grade: 'arbitrary override' } }), result = await f.engine(); assert.equal(result.totalScore, total); assert(result.grade.startsWith(prefix));
});
test('retired heuristic query mode cannot silently start a provider call', async () => {
  const f = setup(), response = await f.route(input, { query: '?engine=heuristic' }); assert.equal(response.status, 400); assert.equal(response.body.code, 'unsupported_mode'); assert.equal(f.state.calls.length + f.state.reservations.length, 0);
});
for (const saveResult of [{ data: null, error: { code: '42501', message: PRIVATE } }, { data: null, error: null }, { data: { id: 'bad-id' }, error: null }]) test('valid score survives unconfirmed history save with an explicit warning', async () => {
  const f = setup({ saveResult }), result = await f.route(input, { authenticated: true }); assert.equal(result.status, 200); assert.equal(result.body.persistence, 'unavailable'); assert.equal(result.body.savedEvaluationId, null); assert(result.body.warning);
  assert.equal(f.state.calls.length, 1); assert(!JSON.stringify({ logs: f.state.logs, response: result.body }).includes(PRIVATE));
});
for (const rateOverride of [{ data: [], error: null }, { data: [{ allowed: 'true' }], error: null }, { data: [{ allowed: true, remaining: -1, reset_time: 'bad' }], error: null }]) test('malformed or zero-row admission fails closed', async () => {
  const f = setup({ rateOverride }), result = await f.route(); assert.equal(result.status, 503); assert.equal(f.state.calls.length + f.state.writes.length, 0);
});
for (const options of [{ rateError: true }, { rateThrows: true }]) test('admission store errors never fall back to memory or heuristic scores', async () => {
  const f = setup(options), result = await f.route(); assert.equal(result.status, 503); assert.equal(result.body.result, null); assert.equal(f.state.calls.length, 0);
});
test('concurrent same-token requests permit at most one provider execution in the mocked atomic store', async () => {
  const f = setup(), results = await Promise.all([f.route(), f.route()]); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(f.state.calls.length, 1);
  assert.equal((await f.route()).status, 409); assert.equal(f.state.calls.length, 1);
});
test('fresh token cannot evade the active cooldown', async () => {
  const f = setup(); assert.equal((await f.route()).status, 200); const result = await f.route(input, { key: 'offline-idempotency-0002' }); assert.equal(result.status, 409); assert.equal(result.body.code, 'cooldown'); assert.equal(f.state.calls.length, 1);
});
test('cooldown-denied token spraying cannot grow per-request persisted keys', async () => {
  const f = setup(); assert.equal((await f.route()).status, 200);
  for (let i = 0; i < 8; i++) assert.equal((await f.route(input, { key: `offline-rejected-${i.toString().padStart(4, '0')}` })).body.code, 'cooldown');
  assert.equal([...f.state.counters.keys()].filter(k => k.includes(':idem:')).length, 1); assert.equal(f.state.calls.length, 1);
});
test('known duplicate does not charge another actor allowance or active slot', async () => {
  const f = setup(); await f.route(); const reservations = f.state.reservations.length;
  assert.equal((await f.route()).body.code, 'duplicate_request'); assert.equal(f.state.reservations.length, reservations);
});
test('failed exact-token read stops admission without claiming no prior execution', async () => {
  const f = setup({ tokenReadError: true }), result = await f.route(); assert.equal(result.status, 503); assert.equal(result.body.code, 'limiter_unavailable'); assert.equal(f.state.calls.length + f.state.reservations.length, 0);
});
for (const authenticated of [false, true]) test(`${authenticated ? 'verified-user 10' : 'anonymous 2'} daily boundary is enforced after cooldowns`, async () => {
  const f = setup({ now: Date.parse('2026-10-23T12:00:00Z') }), allowance = authenticated ? 10 : 2;
  for (let index = 0; index < allowance; index++) {
    assert.equal((await f.route(input, { authenticated, key: `offline-boundary-${index.toString().padStart(4, '0')}` })).status, 200);
    f.state.now += 76_000;
  }
  const denied = await f.route(input, { authenticated, key: 'offline-boundary-denied' }); assert.equal(denied.status, 429); assert.equal(denied.body.code, 'admission_limit'); assert.equal(f.state.calls.length, allowance);
});
test('UTC midnight creates new daily allowance while old duplicate token remains reserved', async () => {
  const f = setup({ now: Date.parse('2026-10-23T23:59:30Z') }); assert.equal((await f.route()).status, 200);
  assert(f.state.reservations.some(r => r.p_ip.endsWith('daily:2026-10-23') && r.p_window_interval === '30 seconds'));
  f.state.now += 90_000; assert.equal((await f.route()).status, 409);
  assert.equal((await f.route(input, { key: 'offline-next-day-token' })).status, 200);
  assert(f.state.reservations.some(r => r.p_ip.endsWith('daily:2026-10-24')));
});
test('independent handler instances share admission decisions through the mocked durable store', async () => {
  const counters = new Map(), first = setup({ counters }); assert.equal((await first.route()).status, 200);
  const restarted = setup({ counters }); assert.equal((await restarted.route()).status, 409); assert.equal(restarted.state.calls.length, 0);
});
test('failed provider requests conservatively consume actor reservations', async () => {
  const f = setup({ now: Date.parse('2026-10-23T12:00:00Z'), provider: () => new Response(null, { status: 403 }) });
  assert.equal((await f.route()).status, 503); f.state.now += 76_000;
  assert.equal((await f.route(input, { key: 'offline-failure-second' })).status, 503); f.state.now += 76_000;
  assert.equal((await f.route(input, { key: 'offline-failure-denied' })).status, 429); assert.equal(f.state.calls.length, 2);
});
test('global allowance is reserved immediately before every transport attempt', async () => {
  const f = setup({ provider: count => count === 1 ? new Response(null, { status: 503 }) : Response.json(envelope(valid())) });
  const result = await f.route(); assert.equal(result.status, 200); assert.equal(f.state.calls.length, 2); assert.equal(f.state.reservations.filter(r => r.p_limit === 100).length, 2);
  assert(f.state.calls[0].url.includes('gemini-3.6-flash')); assert(f.state.calls[1].url.includes('gemini-3.5-flash-lite'));
});
test('global denial prevents provider work and token growth without refunding partial actor reservations', async () => {
  const f = setup({ deny: r => r.p_limit === 100 }), result = await f.route(); assert.equal(result.status, 429); assert.equal(result.body.code, 'budget_exhausted'); assert.equal(f.state.calls.length, 0);
  assert.equal(f.state.reservations.length, 3); assert(!f.state.reservations.some(r => r.p_ip.includes(':idem:')));
});
test('100th global attempt may run; a retry cannot become a 101st provider call', async () => {
  const now = Date.parse('2026-10-23T12:00:00Z'), counters = new Map([['eval:v1:idea:global:2026-10-23', { count: 99, resetMs: now + 43_200_000 }]]);
  const f = setup({ now, counters, provider: () => new Response(null, { status: 503 }) }), result = await f.route();
  assert.equal(result.status, 429); assert.equal(result.body.code, 'budget_exhausted'); assert.equal(f.state.calls.length, 1); assert.equal(f.state.reservations.filter(r => r.p_limit === 100).length, 2);
});
test('two unavailable transport attempts stop without scores, persistence or raw provider logging', async () => {
  const f = setup({ provider: () => { throw Error(PRIVATE); } }), result = await f.route(input, { authenticated: true });
  assert.equal(result.status, 503); assert.equal(result.body.result, null); assert.equal(f.state.calls.length, 2); assert.equal(f.state.writes.length, 0); assert(!JSON.stringify(f.state.logs).includes(PRIVATE));
});
test('per-attempt body timeout permits at most one further bounded transport attempt', async () => {
  const f = setup({ provider: () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } })) });
  const execution = { deadlineAt: Date.now() + 5_000, attempts: 0 };
  await assert.rejects(f.loader.load('src/lib/ai/geminiClient.ts').callGeminiText('fixture', { execution, perModelTimeoutMs: 25 }), e => e.code === 'provider_unavailable');
  assert.equal(f.state.calls.length, 2); assert.equal(execution.attempts, 2);
});
test('request cancellation during a stalled provider never cascades', async () => {
  const f = setup({ provider: () => new Promise(() => {}) }), controller = new AbortController();
  const pending = f.loader.load('src/lib/ai/geminiClient.ts').callGeminiText('fixture', { execution: { deadlineAt: Date.now() + 5_000, attempts: 0, signal: controller.signal } });
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(pending, e => e.code === 'deadline_exceeded'); assert.equal(f.state.calls.length, 1);
});
test('a stalled attempt reservation is bounded by the same provider deadline before any network call', async () => {
  const f = setup(), deadlineAt = Date.now() + 1_500;
  await assert.rejects(f.loader.load('src/lib/ai/geminiClient.ts').callGeminiText('fixture', { execution: { deadlineAt, attempts: 0, beforeProviderAttempt: providerDeadline => { assert.equal(providerDeadline, deadlineAt); return new Promise(() => {}); } } }), e => e.code === 'deadline_exceeded');
  assert.equal(f.state.calls.length, 0);
});
test('oversized provider response fails once without parsing or publishing a score', async () => {
  const f = setup({ provider: () => Response.json({ ...envelope(valid()), padding: PRIVATE.repeat(12_000) }) }), result = await f.route();
  assert.equal(result.status, 502); assert.equal(result.body.result, null); assert.equal(f.state.calls.length, 1); assert(!JSON.stringify(f.state.logs).includes(PRIVATE));
});
for (const key of [null, 'short', '<invalid-idempotency-key>']) test('invalid/missing request token stops before shared reservations or provider execution', async () => {
  const f = setup(), result = await f.route(input, { key }); assert.equal(result.status, 400); assert.equal(f.state.reservations.length + f.state.calls.length, 0);
});
test('same client token is independently scoped to each server-verified account', async () => {
  const f = setup(); assert.equal((await f.route(input, { authenticated: true })).status, 200); f.state.user = { id: OTHER };
  assert.equal((await f.route({ ...input, userId: USER }, { authenticated: true })).status, 200); assert.equal(f.state.writes[1].user_id, OTHER); assert.equal(f.state.calls.length, 2);
});
for (const status of [400, 401, 402, 403, 404, 429]) test(`HTTP ${status} never cascades`, async () => {
  const f = setup({ provider: () => new Response(PRIVATE, { status, headers: { 'retry-after': '1' } }) }), result = await f.route();
  assert.equal(result.status, 503); assert.equal(result.body.result, null); assert.equal(f.state.calls.length, 1); assert.equal(f.state.writes.length, 0); assert(!JSON.stringify(f.state.logs).includes(PRIVATE));
});
for (const output of [{}, { ...valid(), scoreNovelty: '18' }, { ...valid(), scoreNovelty: null }, { ...valid(), scoreNovelty: true }, { ...valid(), scoreNovelty: 1.5 }, { ...valid(), scoreNovelty: -1 }, { ...valid(), scoreNovelty: 26 }, { ...valid(), strengths: ['invented praise'] }, { ...valid(), redFlags: [{ text: 'Invented observation', quote: 'not in source' }] }, { ...valid(), categoryEvidence: {} }]) test('invalid scoring/evidence produces no new score or persistence', async () => {
  const f = setup({ output }), result = await f.route(input, { authenticated: true }); assert.equal(result.status, 502); assert.equal(result.body.result, null); assert.equal(f.state.writes.length, 0); assert.equal(f.state.calls.length, 1);
});
test('finite integer validator rejects NaN/infinities without clamping', () => {
  const f = setup(), { score } = f.loader.load('src/lib/evaluator/evaluationContract.ts');
  for (const value of [NaN, Infinity, -Infinity, '5', null, true, 1.1, -1, 26]) assert.throws(() => score(value, 25));
  assert.equal(score(5, 25), 5);
});
test('application totals and grade ignore provider overrides and preserve low valid scores', async () => {
  const f = setup({ output: { ...valid(SOURCE, [5, 5, 5, 5]), totalScore: 100, grade: 'Nomination ready' } }), result = await f.route(); assert.equal(result.status, 200); assert.equal(result.body.result.totalScore, 20); assert(result.body.result.grade.startsWith('High Risk')); assert.deepEqual(result.body.result.strengths, []);
});
for (const providerData of [{}, { candidates: [] }, { promptFeedback: { blockReason: 'SAFETY' } }, { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] }, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'invalid JSON' }] } }] }]) test('invalid/blocked/incomplete envelope cannot become a scorecard or retry', async () => {
  const f = setup({ provider: () => Response.json(providerData) }), result = await f.route(); assert([422, 502].includes(result.status)); assert.equal(result.body.result, null); assert.equal(f.state.calls.length, 1);
});
test('all non-thought text parts are joined; thought content is not parsed', async () => {
  const serialized = JSON.stringify(valid()), halfway = Math.floor(serialized.length / 2);
  const f = setup({ provider: () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: PRIVATE }, { text: serialized.slice(0, halfway) }, { text: serialized.slice(halfway) }] } }] }) });
  assert.equal((await f.route()).status, 200); assert(!JSON.stringify(f.state.logs).includes(PRIVATE));
});
test('missing server key never uses public key or heuristic score', async () => {
  const f = setup({ env: { GEMINI_API_KEY: '', NEXT_PUBLIC_GEMINI_API_KEY: 'not-approved-public-key' } }), result = await f.route(); assert.equal(result.status, 503); assert.equal(result.body.result, null); assert.equal(f.state.calls.length, 0);
});
test('shared image transport preserves modality and uses the server key in headers, never URLs', async () => {
  const f = setup({ provider: () => Response.json({ candidates: [{ content: { parts: [{ text: '{"safe":true}' }] } }] }) });
  const bytes = Buffer.from('offline-image-bytes');
  const response = await f.loader.load('src/lib/ai/geminiClient.ts').callGeminiVision('Moderate this fixture', bytes, 'image/png');
  assert.equal(response.text, '{"safe":true}'); assert.equal(f.state.calls.length, 1);
  assert.equal(f.state.calls[0].body.contents[0].parts[1].inlineData.mimeType, 'image/png'); assert.equal(f.state.calls[0].body.contents[0].parts[1].inlineData.data, bytes.toString('base64'));
  assert(!f.state.calls[0].url.includes('key='));
});
test('aborted/stale execution stops before a provider attempt', async () => {
  const f = setup(), controller = new AbortController(); controller.abort();
  await assert.rejects(f.loader.load('src/lib/ai/geminiClient.ts').callGeminiText('fixture', { execution: { deadlineAt: Date.now() + 5_000, attempts: 0, signal: controller.signal } }), e => e.code === 'deadline_exceeded');
  assert.equal(f.state.calls.length, 0);
});
