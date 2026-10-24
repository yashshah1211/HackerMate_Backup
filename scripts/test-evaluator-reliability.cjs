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
      if (table === 'profiles') {
        const query = { select(columns) { assert.equal(columns, 'id, is_banned'); return query; }, eq(key, value) { assert.equal(key, 'id'); assert.equal(value, state.user.id); return query; },
          abortSignal(signal) { assert(signal instanceof AbortSignal); return query; }, async maybeSingle() {
            if (state.profileThrows) throw Error(PRIVATE);
            if (state.profileDeadline) state.now = (state.now ?? Date.now()) + 6_000;
            return state.profileResult || { data: { id: state.user.id, is_banned: false }, error: null };
          } }; return query;
      }
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

// Stage B: actual PPT/Challenge engines and routes; all transports are synthetic.
const { pitchOutput, challengeOutput, providerEnvelope, makeBenchmarkPdf, presentationSetup } = require('./fixtures/evaluator-benchmarks.cjs');
const presentationMatrix = [];
after(() => fs.writeFileSync(path.join(ROOT, 'scratch/evaluator-benchmark-presentations.json'), JSON.stringify({ kind: 'offline_mock_response_contract', liveAccuracyMeasured: false, complete: presentationMatrix.length === 44, cases: presentationMatrix.sort((a,b)=>a.id.localeCompare(b.id)) }, null, 2) + '\n'));
for (const fixture of cases.filter(c => c.pipeline !== 'idea')) test('benchmark contract '+fixture.id, async () => {
  const context = { deadlineAt: Date.now()+30000, attempts:0, requestId:'offline-'+fixture.id };
  let output = fixture.pipeline === 'ppt' ? pitchOutput(fixture.source,fixture.track,fixture.mode,fixture.quality === 'strong' ? undefined : [5,5,5,5]) : challengeOutput(fixture.source,fixture.quality === 'strong' ? undefined : [5,5,5,5]);
  if(fixture.quality === 'adversarial') {
    if(fixture.mode === 'visual_text') output.scoreDeductions.novelty.feedback.pageNumber=99;
    else if(fixture.pipeline==='ppt') output.scoreDeductions.novelty.feedback.quote='Invented test result not in submission';
    else output.scoreDeductions.problem.feedback.quote='Invented test result not in submission';
  }
  let calls=0;
  const loader=harness({}, {fetch:async()=>{calls++;return Response.json(providerEnvelope(output))}});
  const started=Date.now();
  try {
    const result=fixture.pipeline==='ppt' ? await loader.load('src/lib/ppt/evaluatorEngine.ts').runPitchDeckEvaluation('Synthetic proposal','open',fixture.source,{memberCount:6},fixture.track,fixture.customRubric,fixture.mode==='visual_text'?{bytes:makeBenchmarkPdf(fixture.source),pageCount:1,source:'linked_pdf'}:undefined,30000,context)
      :await loader.load('src/lib/challenges/challengeEvaluatorEngine.ts').runChallengePitchEvaluation('Synthetic challenge',fixture.domain,'Explain the system.',fixture.source,{},context);
    assert.notEqual(fixture.quality,'adversarial');assert.equal(result.usedAiFallback,false);assert.equal(result.analysis.mode,fixture.mode);
    const sum=fixture.pipeline==='ppt'?result.scoreNovelty+result.scoreTech+result.scoreUiUx+result.scoreTeam:result.scoreProblem+result.scoreSolution+result.scoreArchitecture+result.scoreFeasibilityImpact;
    assert.equal(result.totalScore,sum);assert.equal(calls,1);assert.equal(context.attempts,1);
    if(fixture.quality!=='strong')assert.equal(sum,20);
    for(const items of Object.values(result.analysis.evidence))for(const item of items)if(item.quote)assert(fixture.source.includes(item.quote));else assert.equal(item.pageNumber,1);
    presentationMatrix.push({id:fixture.id,pipeline:fixture.pipeline,mode:result.analysis.mode,status:'accepted_mock_contract',total:sum,grade:result.grade,attempts:context.attempts,latencyMs:Date.now()-started,evidenceAnchors:'validated',liveAccuracy:false});
  } catch(error) {
    assert.equal(fixture.quality,'adversarial',error.stack);assert.equal(error.code,'invalid_ai_output');assert.equal(calls,1);
    presentationMatrix.push({id:fixture.id,pipeline:fixture.pipeline,mode:fixture.mode,status:'rejected_invalid_mock_evidence',score:null,code:error.code,attempts:context.attempts,latencyMs:Date.now()-started,liveAccuracy:false});
  }
});
for(const pipeline of ['ppt','challenge']) {
  for(const [label,mutate] of [
    ['missing identity',s=>{s.user=null}],['Auth service error',s=>{s.authError={status:503,message:PRIVATE}}],['Auth throws',s=>{s.authThrows=true}],
    ['limiter error',s=>{s.rateError=true}],['malformed atomic result',s=>{s.rateOverride={data:[],error:null}}],
  ])test(pipeline+' '+label+' stops before provider or business mutation',async()=>{
    const setup=presentationSetup({pipeline});mutate(setup.state);const response=await setup[pipeline]();assert(response.status>=400);assert.equal(setup.state.calls.length,0);assert.equal(setup.state.writes.length,0);assert(!JSON.stringify(response).includes(PRIVATE));
  });
  test(pipeline+' zero/uncertain completed persistence never returns success',async()=>{
    const setup=presentationSetup({pipeline,queryOverride(q){if(q.table===(pipeline==='ppt'?'team_ppt_evaluations':'challenge_submissions')&&((q.operation==='update'&&q.payload.status==='completed')||(pipeline==='challenge'&&q.operation==='insert')))return{data:null,error:null}}});
    const response=await setup[pipeline]();assert.equal(response.status,409,JSON.stringify(response));assert.equal(response.body.code,'persistence_uncertain');assert.equal(response.body.result,null);assert.equal(setup.state.calls.length,1);
    assert(!setup.state.tables[pipeline==='ppt'?'team_ppt_evaluations':'challenge_submissions'].some(row=>row.status==='completed'));
  });
  test(pipeline+' lost successful save is reconciled without a second provider call',async()=>{
    const setup=presentationSetup({pipeline,afterMutation(q){if((q.operation==='update'&&q.payload.status==='completed')||(pipeline==='challenge'&&q.operation==='insert'))throw Error(PRIVATE)}});
    const response=await setup[pipeline]();assert.equal(response.status,200,JSON.stringify(response));assert.equal(response.body.success,true);assert.equal(setup.state.calls.length,1);assert(!setup.state.writes.some(q=>q.payload.status==='failed'));
  });
  test(pipeline+' known duplicate does not rerun model or charge another slot',async()=>{
    const setup=presentationSetup({pipeline});assert.equal((await setup[pipeline]()).status,200);const count=setup.state.counters.size;
    const duplicate=await setup[pipeline]();assert.equal(duplicate.body.code,'duplicate_request');assert.equal(setup.state.calls.length,1);assert.equal(setup.state.counters.size,count);
  });
  test(pipeline+' concurrent distinct tokens share a fixed active slot',async()=>{
    let release,started;const reached=new Promise(resolve=>{started=resolve});
    const setup=presentationSetup({pipeline,provider:async()=>{started();await new Promise(resolve=>{release=resolve});return Response.json(providerEnvelope(pipeline==='ppt'?pitchOutput(SOURCE):challengeOutput(SOURCE)))}});
    const first=setup[pipeline]();await reached;
    const second=await setup[pipeline]({}, {'idempotency-key':'offline-distinct-token-0002'});assert.equal(second.body.code,'cooldown');release();assert.equal((await first).status,200);assert.equal(setup.state.calls.length,1);
  });
  for(const column of ['version','id'])test(pipeline+' failed '+column+' read cannot fail open',async()=>{
    const setup=presentationSetup({pipeline,queryOverride(q){if(q.table===(pipeline==='ppt'?'team_ppt_evaluations':'challenge_submissions')&&q.operation==='select'&&(q.columns===column||(column==='id'&&q.columns==='id, status')))return{data:null,error:{code:'42501',message:PRIVATE}}}});
    const response=await setup[pipeline]();assert.equal(response.body.code,'database_unavailable');assert.equal(setup.state.calls.length,0);assert(!setup.state.writes.some(q=>q.operation==='insert'));
  });
}
for(const code of ['42703','PGRST204'])test('PPT optional track-column '+code+' retries once with metadata intact',async()=>{
 const setup=presentationSetup({track:'specific',trackError:code});const result=await setup.ppt({customRubric});assert.equal(result.status,200);assert.equal(setup.state.writes.filter(q=>q.operation==='insert').length,2);assert.equal(result.body.evaluation.ai_feedback.analysis.trackId,'specific');assert.equal(result.body.evaluation.ai_feedback.analysis.rubricVersion,'ppt-v1');
});
test('PPT unrelated/uncertain initialization never retries insert',async()=>{
 let inserts=0;const setup=presentationSetup({queryOverride(q){if(q.operation==='insert'){inserts++;return{data:null,error:{code:'08006',message:PRIVATE}}}}});
 const result=await setup.ppt();assert.equal(result.body.code,'persistence_uncertain');assert.equal(inserts,1);assert.equal(setup.state.calls.length,0);
});
for(const bad of ['nonsense',3,null])test('PPT invalid explicit track '+JSON.stringify(bad)+' is rejected',async()=>{
 const setup=presentationSetup();const result=await setup.ppt({track_id:bad});assert.equal(result.status,bad===null?200:400);if(bad!==null)assert.equal(setup.state.calls.length,0);
});
test('PPT unsupported custom rubric is rejected before reservation',async()=>{
 const setup=presentationSetup({track:'specific'});assert.equal((await setup.ppt({customRubric:'Use arbitrary organizer weights'})).body.code,'rubric_unsupported');assert.equal(setup.state.counters.size,0);
});
for(const permission of ['owner','member','admin','visitor'])test('PPT preserves '+permission+' authorization',async()=>{
 const setup=presentationSetup();if(permission!=='owner')setup.state.tables.teams[0].owner_id=OTHER;
 if(!['owner','member'].includes(permission))setup.state.tables.team_members=[];
 if(permission==='admin')setup.state.tables.profiles[0].role='admin';
 const result=await setup.ppt();assert.equal(result.status,permission==='visitor'?403:200);if(permission==='visitor')assert.equal(setup.state.calls.length,0);
});
for(const age of [119000,121000])test('PPT explicit authorized POST distinguishes '+age+'ms processing',async()=>{
 const setup=presentationSetup();const old={id:'00000000-0000-4000-8000-000000000009',team_id:setup.TEAM,status:'evaluating',version:1,created_at:new Date(Date.now()-age).toISOString(),updated_at:new Date(Date.now()-age).toISOString()};setup.state.tables.team_ppt_evaluations.push(old);
 const result=await setup.ppt();assert.equal(result.status,age<120000?409:200);assert.equal(old.status,age<120000?'evaluating':'failed');
 if(age>120000){const recovery=setup.state.writes.find(q=>q.payload.error_message==='processing_interrupted');assert(recovery.filters.some(f=>f.key==='status'&&f.value==='evaluating'));assert(recovery.filters.some(f=>f.kind==='lt'&&f.key==='updated_at'));}
});
test('PPT stale recovery is bounded and reports a remaining backlog',async()=>{
 const setup=presentationSetup();for(let i=0;i<4;i++)setup.state.tables.team_ppt_evaluations.push({id:`00000000-0000-4000-8000-00000000001${i}`,team_id:setup.TEAM,status:'evaluating',version:i+1,updated_at:new Date(Date.now()-200000).toISOString(),created_at:new Date(Date.now()-200000).toISOString()});
 const result=await setup.ppt();assert.equal(result.body.code,'processing_interrupted');assert.equal(setup.state.writes.length,3);assert.equal(setup.state.calls.length,0);
});
test('PPT stale CAS zero-row or read failure stops initialization',async()=>{
 const setup=presentationSetup({queryOverride(q){if(q.operation==='update')return{data:[],error:null}}});setup.state.tables.team_ppt_evaluations.push({id:SAVED,team_id:setup.TEAM,status:'evaluating',updated_at:new Date(Date.now()-200000).toISOString()});
 const result=await setup.ppt();assert.equal(result.body.code,'processing_interrupted');assert.equal(setup.state.calls.length,0);
});
test('PPT model failure terminalizes the initialized row without scores',async()=>{
 const setup=presentationSetup({provider:async()=>new Response('',{status:403})});const result=await setup.ppt();assert.equal(result.body.code,'provider_rejected');assert.equal(setup.state.tables.team_ppt_evaluations[0].status,'failed');assert.equal(setup.state.tables.team_ppt_evaluations[0].total_score,undefined);
});
test('PPT failed cleanup is observable as persistence uncertainty and sanitized',async()=>{
 const setup=presentationSetup({provider:async()=>new Response('',{status:403}),queryOverride(q){if(q.operation==='update'&&q.payload.status==='failed')return{data:null,error:{code:'42501',message:PRIVATE}}}});
 const result=await setup.ppt();assert.equal(result.body.code,'persistence_uncertain');assert.equal(setup.state.tables.team_ppt_evaluations[0].status,'evaluating');assert(setup.state.logs.some(l=>JSON.stringify(l).includes('fail_ppt_processing')));assert(!JSON.stringify(setup.state.logs).includes(PRIVATE));
});
test('PPT completion racing terminal failure never overwrites completed status',async()=>{
 const setup=presentationSetup({provider:async()=>new Response('',{status:403}),queryOverride(q,state){if(q.operation==='update'&&q.payload.status==='failed'){state.tables.team_ppt_evaluations[0].status='completed';return{data:[],error:null}}}});
 const result=await setup.ppt();assert.equal(result.body.code,'persistence_uncertain');assert.equal(setup.state.tables.team_ppt_evaluations[0].status,'completed');
});
for(const status of ['draft','closed','archived'])test('Challenge '+status+' cannot start evaluation',async()=>{
 const setup=presentationSetup({pipeline:'challenge'});setup.state.tables.weekly_challenges[0].status=status;assert.equal((await setup.challenge()).status,403);assert.equal(setup.state.calls.length,0);
});
for(const dateCase of ['future','expired','invalid'])test('Challenge '+dateCase+' window fails closed',async()=>{
 const setup=presentationSetup({pipeline:'challenge'}),challenge=setup.state.tables.weekly_challenges[0];if(dateCase==='future')challenge.starts_at=new Date(Date.now()+100000).toISOString();else challenge.ends_at=dateCase==='invalid'?'invalid':new Date(Date.now()-1000).toISOString();
 assert((await setup.challenge()).status>=400);assert.equal(setup.state.calls.length,0);
});
for(const slug of ['does-not-exist','fixture','', '%ZZ'])test('Challenge never picks another target for '+slug,async()=>{
 const setup=presentationSetup({pipeline:'challenge'});assert((await setup.challenge({}, {},slug)).status>=400);assert.equal(setup.state.calls.length,0);assert(!setup.state.queries.some(q=>q.table==='weekly_challenges'&&!q.filters.length));
});
for(const modeCase of [{submission_mode:'team'},{submission_mode:'unknown'},{submission_mode:'solo',team_id:OTHER},{submission_mode:'team',team_id:OTHER}])test('Challenge invalid mode/membership '+JSON.stringify(modeCase)+' stops before model',async()=>{
 const setup=presentationSetup({pipeline:'challenge'});assert((await setup.challenge(modeCase)).status>=400);assert.equal(setup.state.calls.length,0);
});
test('Challenge verified team uses the same actor/challenge quota as solo',async()=>{
 const setup=presentationSetup({pipeline:'challenge'});assert.equal((await setup.challenge()).status,200);
 const quota=[...setup.state.counters.keys()].find(k=>k.endsWith(':attempts'));
 for(const [key,row]of setup.state.counters)if(key.endsWith('active'))row.resetMs=Date.now()-1;
 assert.equal((await setup.challenge({submission_mode:'team',team_id:setup.TEAM},{'idempotency-key':'offline-challenge-team-token'})).status,200);
 assert.equal(setup.state.counters.get(quota).count,2);assert.equal([...setup.state.counters.keys()].filter(k=>k.endsWith(':attempts')).length,1);
});
for(const link of ['http://127.0.0.1','https://docs.google.com.evil.invalid/deck','https://user:pass@docs.google.com/presentation/d/test/edit','https://example.invalid/deck'])test('Challenge rejects unsafe presentation URL '+link,async()=>{
 const setup=presentationSetup({pipeline:'challenge'});assert.equal((await setup.challenge({external_link_url:link})).status,400);assert.equal(setup.state.calls.length,0);
});
test('Challenge uploaded PDF limit is 8MB and image-only extraction stays unscored',async()=>{
 const setup=presentationSetup({pipeline:'challenge'});const oversized=new Blob([Buffer.alloc(8*1024*1024+1)],{type:'application/pdf'});
 assert.equal((await setup.challenge({external_link_url:undefined,file:oversized})).status,400);assert.equal(setup.state.calls.length,0);
 const extractor=harness().load('src/lib/challenges/challengeExtractor.ts');const {makePitchPdf}=require('./fixtures/pitch-pdf.cjs');
 assert.equal((await extractor.extractChallengeTextFromPDF(makePitchPdf('images'))).success,false);
 const real=await extractor.extractChallengeTextFromPDF(makePitchPdf('text',8));assert.equal(real.success,true);assert.equal(real.slides.length,8);assert.equal(real.pdf,undefined);
});
test('Challenge forged feedback/default objects cannot produce numeric scores',async()=>{
 for(const output of [{},challengeOutput(SOURCE,[5,5,5,5])]){
  const setup=presentationSetup({pipeline:'challenge',output});const result=await setup.challenge();
  if(Object.keys(output).length){assert.equal(result.status,200);assert.equal(result.body.submission.total_score,20);assert.equal(result.body.submission.grade,'Needs Revision 🛠️');}
  else{assert.equal(result.body.code,'invalid_ai_output');assert.equal(setup.state.writes.length,0);}
 }
});
test('PDF transport-only degradation shares two attempts and one provider deadline',async()=>{
 const setup=presentationSetup({mode:'visual_text',provider:async(n)=>n===1?new Response('',{status:503}):Response.json(providerEnvelope(pitchOutput(SOURCE)))});
 const result=await setup.ppt();assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.body.evaluation.ai_feedback.analysis.mode,'text_only');assert.equal(result.body.evaluation.ai_feedback.analysis.attempts,2);assert.equal(setup.state.calls.length,2);assert(setup.state.calls[0].body.contents[0].parts[0].inlineData);assert(!setup.state.calls[1].body.contents[0].parts[0].inlineData);
});
for(const [pipeline,keys,caps]of [['ppt',['scoreNovelty','scoreTech','scoreUiUx','scoreTeam'],[25,25,25,25]],['challenge',['scoreProblem','scoreSolution','scoreArchitecture','scoreFeasibilityImpact'],[25,25,30,20]]]) {
 for(const [i,key]of keys.entries())for(const value of [undefined,null,'5',true,0.5,-1,NaN,Infinity,caps[i]+1])test(pipeline+' rejects '+key+'='+String(value),async()=>{
  const output=pipeline==='ppt'?pitchOutput(SOURCE):challengeOutput(SOURCE);output[key]=value;
  const setup=presentationSetup({pipeline,output});const result=await setup[pipeline]();assert.equal(result.body.code,'invalid_ai_output');assert.equal(result.body.result,null);assert(!setup.state.tables[pipeline==='ppt'?'team_ppt_evaluations':'challenge_submissions'].some(row=>row.status==='completed'));
 });
}
test('PPT/Challenge cancellation makes no provider call when already aborted',async()=>{
 const signal=AbortSignal.abort();for(const pipeline of ['ppt','challenge']){
  const loader=harness();const context={deadlineAt:Date.now()+1000,attempts:0,signal};
  await assert.rejects(pipeline==='ppt'?loader.load('src/lib/ppt/evaluatorEngine.ts').runPitchDeckEvaluation('Title','software',SOURCE,undefined,'generic',undefined,undefined,1000,context):loader.load('src/lib/challenges/challengeEvaluatorEngine.ts').runChallengePitchEvaluation('Title','Open','Problem',SOURCE,{},context),e=>e.code==='deadline_exceeded');
 }
});
for(const pipeline of ['ppt','challenge'])test(pipeline+' requires a Bearer token before any read or write',async()=>{
 const setup=presentationSetup({pipeline});const result=await setup[pipeline]({}, {authorization:''});assert.equal(result.status,401);assert.equal(setup.state.queries.length,0);assert.equal(setup.state.calls.length,0);
});
for(const pipeline of ['ppt','challenge'])test(pipeline+' derives total/grade and rejects non-grounded or malformed feedback',async()=>{
 const low=pipeline==='ppt'?pitchOutput(SOURCE,'generic','text_only',[5,5,5,5]):challengeOutput(SOURCE,[5,5,5,5]);
 const setup=presentationSetup({pipeline,output:{...low,totalScore:100,grade:'Mastery'}});const response=await setup[pipeline]();assert.equal(response.status,200);const row=response.body.evaluation||response.body.submission;assert.equal(row.total_score,20);assert.notEqual(row.grade,'Mastery');
 for(const mutation of [output=>{output.strengths=['unanchored praise']},output=>{output.scoreDeductions[pipeline==='ppt'?'novelty':'problem'].pointsLost=0},output=>{output.scoreDeductions[pipeline==='ppt'?'novelty':'problem'].feedback.quote='Fabricated result'},output=>{output.formatViolations=[{text:'Unsupplied six-member penalty',quote:SOURCE,ruleQuote:'invented cap'}]}]){
  const output=pipeline==='ppt'?pitchOutput(SOURCE):challengeOutput(SOURCE);mutation(output);const failed=presentationSetup({pipeline,output});assert.equal((await failed[pipeline]()).body.code,'invalid_ai_output');assert(!failed.state.tables[pipeline==='ppt'?'team_ppt_evaluations':'challenge_submissions'].some(row=>row.status==='completed'));
 }
});
for(const total of [49,50,71,72,87,88])test('PPT local grade boundary '+total,()=>{
 const grade=harness().load('src/lib/ppt/evaluatorEngine.ts').computeGrade(total,6,['Invented eligibility violation'],'ai_genai');assert.equal(grade,total>=88?'Strong Pitch 🏆':total>=72?'Promising ✅':total>=50?'Needs Iteration ⚠️':'Major Concerns 🚨');
});
for(const total of [54,55,71,72,84,85])test('Challenge local grade boundary '+total,async()=>{
 let remaining=total;const values=[25,25,30,20].map(cap=>{const value=Math.min(remaining,cap);remaining-=value;return value});
 const setup=presentationSetup({pipeline:'challenge',output:challengeOutput(SOURCE,values)});const response=await setup.challenge();assert.equal(response.status,200);assert.equal(response.body.submission.grade,total>=85?'Mastery 🏆':total>=72?'Strong Contender 🚀':total>=55?'Developing 💡':'Needs Revision 🛠️');
});
test('Challenge only accepts rule-grounded violations and retains verified organizer rules',async()=>{
 const output=challengeOutput(SOURCE);output.formatViolations=[{text:'Explain how the required validation will be supplied.',quote:SOURCE,ruleQuote:'Supply a validation method'}];
 const setup=presentationSetup({pipeline:'challenge',output});setup.state.tables.weekly_challenges[0].additional_rules='Supply a validation method';const response=await setup.challenge();assert.equal(response.status,200);assert.equal(response.body.submission.format_violations.length,1);assert(setup.state.calls[0].body.contents[0].parts[0].text.includes('Supply a validation method'));
});
test('Challenge hardened adapter never fetches an arbitrary host and preserves >6 pages',async()=>{
 let fetches=0;const loader=harness({}, {fetch:async()=>{fetches++;throw Error('Unexpected network')}});const result=await loader.load('src/lib/challenges/challengeExtractor.ts').extractChallengePresentationFromUrl('https://127.0.0.1/private');assert.equal(result.success,false);assert.equal(fetches,0);
});
test('PPT request-wide deadline and PDF degradation never grant another provider budget',async()=>{
 let now=0,calls=0;const loader=harness({}, {Date:class extends Date{static now(){return now}},fetch:async()=>{calls++;now=30000;return new Response('',{status:503})}});
 const context={deadlineAt:50000,attempts:0};const {makePitchPdf}=require('./fixtures/pitch-pdf.cjs');
 await assert.rejects(loader.load('src/lib/ppt/evaluatorEngine.ts').runPitchDeckEvaluation('Title','open',SOURCE,undefined,'generic',undefined,{bytes:makePitchPdf(),pageCount:3,source:'linked_pdf'},30000,context),e=>e.code==='deadline_exceeded');assert.equal(calls,1);assert.equal(context.providerDeadlineAt,30000);
});
test('PDF parent cancellation destroys parser state and prevents a scored continuation',async()=>{
 const abort=new AbortController();let destroyed=0;
 const document={numPages:1,loadingTask:{async destroy(){destroyed++}},getPage:()=>new Promise(()=>{})};
 const loader=harness({unpdf:{getDocumentProxy:async()=>document}});const pending=loader.load('src/lib/ppt/presentationExtractor.ts').extractTextFromPDF(Buffer.from('%PDF-fixture'),'linked_pdf',5000,abort.signal);abort.abort();assert.equal((await pending).success,false);assert(destroyed>=1);
});
for(const pipeline of ['ppt','challenge'])test(pipeline+' malformed persisted category data cannot confirm a new score',async()=>{
 const column=pipeline==='ppt'?'score_tech':'score_architecture';const malformed=row=>({...row,[column]:null});
 const setup=presentationSetup({pipeline,afterMutation(q,rows){if((pipeline==='ppt'&&q.operation==='update'&&q.payload.status==='completed')||(pipeline==='challenge'&&q.operation==='insert'))return{data:malformed(rows[0]),error:null}},queryOverride(q,state){if(q.operation==='select'&&q.columns?.includes('total_score')&&q.filters.some(f=>f.key==='id'))return{data:malformed(state.tables[q.table][0]),error:null}}});
 const result=await setup[pipeline]();assert.equal(result.body.code,'persistence_uncertain');assert.equal(result.body.result,null);assert.equal(setup.state.calls.length,1);assert.equal(setup.state.tables[pipeline==='ppt'?'team_ppt_evaluations':'challenge_submissions'][0].status,'completed');
});
test('PPT failed cleanup response identity must match the intended record',async()=>{
 const setup=presentationSetup({provider:async()=>new Response('',{status:403}),queryOverride(q){if(q.operation==='update'&&q.payload.status==='failed')return{data:[{id:OTHER}],error:null}}});
 const result=await setup.ppt();assert.equal(result.body.code,'persistence_uncertain');assert.equal(setup.state.tables.team_ppt_evaluations[0].status,'evaluating');
});

// Mission 05 security remediation: current protected profile before any effects.
for(const authorization of ['', 'Basic fixture', 'Bearer', 'Bearer fixture token'])test('Idea supplied malformed credentials cannot become anonymous: '+authorization,async()=>{
  const f=setup(),result=await f.route(input,{headers:{authorization}});assert.equal(result.status,401);
  assert.equal(f.state.authCalls+f.state.calls.length+f.state.reservations.length+f.state.writes.length,0);
});
for (const profile of [null, [], {id:OTHER,is_banned:false}, {id:USER,is_banned:true}, {id:USER,is_banned:null}, {id:USER}, {id:USER,is_banned:'false'}, {id:USER,is_banned:0}]) {
  test('Idea rejects unknown/suspended profile '+JSON.stringify(profile),async()=>{
    const f=setup({profileResult:{data:profile,error:null}}),result=await f.route(input,{authenticated:true});
    assert.equal(result.status,403);assert.equal(result.body.result,null);
    assert.equal(f.state.calls.length+f.state.reservations.length+f.state.writes.length,0);
  });
  for(const pipeline of ['ppt','challenge'])test(pipeline+' rejects unknown/suspended profile '+JSON.stringify(profile),async()=>{
    const f=presentationSetup({pipeline,queryOverride(q){if(q.table==='profiles'&&q.columns==='id, is_banned')return{data:profile,error:null}}});
    const result=await f[pipeline]();assert.equal(result.status,403);assert.equal(result.body.result,null);
    assert.equal(f.state.calls.length+f.state.writes.length+f.state.counters.size,0);
  });
}
for(const profileOptions of [{profileThrows:true},{profileResult:{data:null,error:{code:'42501',message:PRIVATE}}},{profileDeadline:true}])test('Idea profile lookup fails closed '+JSON.stringify(profileOptions),async()=>{
  const f=setup(profileOptions),result=await f.route(input,{authenticated:true});assert([503,504].includes(result.status));
  assert.equal(f.state.calls.length+f.state.reservations.length+f.state.writes.length,0);assert(!JSON.stringify(f.state.logs).includes(PRIVATE));
});
for(const pipeline of ['ppt','challenge'])for(const scenario of ['error','throw','timeout','banned-admin'])test(pipeline+' protected profile '+scenario,async()=>{
  const f=presentationSetup({pipeline,queryOverride(q){if(q.table!=='profiles'||q.columns!=='id, is_banned')return;
    if(scenario==='error')return{data:null,error:{code:'42501',message:PRIVATE}};
    if(scenario==='throw')throw Error(PRIVATE);
    if(scenario==='timeout')return new Promise(()=>{});
    return{data:{id:USER,role:'admin',is_banned:true},error:null};
  }});
  const result=await f[pipeline]();assert.equal(result.status,scenario==='banned-admin'?403:scenario==='timeout'?504:503);
  assert.equal(f.state.calls.length+f.state.writes.length+f.state.counters.size,0);assert(!JSON.stringify(f.state.logs).includes(PRIVATE));
});
for(const pipeline of ['ppt','challenge'])test(pipeline+' explicit non-banned member retains evaluation access',async()=>{
  const f=presentationSetup({pipeline}),result=await f[pipeline]();assert.equal(result.status,200);assert.equal(f.state.calls.length,1);
  const gate=f.state.queries.findIndex(q=>q.table==='profiles'&&q.columns==='id, is_banned');
  assert(gate>=0);assert(f.state.queries.slice(0,gate).every(q=>q.operation==='select'));
});
test('non-banned DB admin keeps PPT exception; Challenge does not gain one',async()=>{
  const tables={teams:[{id:'00000000-0000-4000-8000-000000000004',owner_id:OTHER,team_members:[]}],team_members:[],profiles:[{id:USER,role:'admin',is_banned:false}]};
  const ppt=presentationSetup({tables});assert.equal((await ppt.ppt()).status,200);
  const challenge=presentationSetup({pipeline:'challenge',tables});assert.equal((await challenge.challenge({submission_mode:'team',team_id:challenge.TEAM})).status,403);assert.equal(challenge.state.calls.length,0);
});
for(const error of [{code:'42703',message:'column weekly_challenges.additional_rules does not exist'},{code:'PGRST204',message:"Could not find the 'additional_rules' column of 'weekly_challenges' in the schema cache"}])
for(const slug of ['fixture-challenge','Fixture Challenge','00000000-0000-4000-8000-000000000005'])test('Challenge optional rules compatibility '+error.code+' '+slug,async()=>{
  const f=presentationSetup({pipeline:'challenge',queryOverride(q,state){if(q.table!=='weekly_challenges')return;
    if(q.columns.includes('additional_rules'))return{data:null,error};
    const row=state.tables.weekly_challenges.find(r=>q.filters.every(filter=>r[filter.key]===filter.value));
    if(!row)return{data:null,error:null};const copy={...row};delete copy.additional_rules;return{data:copy,error:null};
  }});
  const result=await f.challenge({}, {},slug);assert.equal(result.status,200);
  const reads=f.state.queries.filter(q=>q.table==='weekly_challenges');assert.equal(reads.filter(q=>q.columns.includes('additional_rules')).length,1);
  assert(!f.state.calls[0].body.contents[0].parts.at(-1).text.includes('undefined'));
});
for(const error of [{code:'42501',message:'column weekly_challenges.additional_rules does not exist'},{code:'42703',message:'column weekly_challenges.status does not exist'},{code:'PGRST204',message:"Could not find the 'additional_rules' column of 'profiles' in the schema cache"},{code:'42703',message:'private error '+PRIVATE}])test('Challenge never masks another query error '+error.code+' '+error.message,async()=>{
  const f=presentationSetup({pipeline:'challenge',queryOverride(q){if(q.table==='weekly_challenges')return{data:null,error}}});const result=await f.challenge();
  assert.equal(result.status,503);assert.equal(f.state.queries.filter(q=>q.table==='weekly_challenges').length,1);assert.equal(f.state.calls.length+f.state.counters.size+f.state.writes.length,0);
});
test('Challenge actual organizer rules are preserved',async()=>{
  const f=presentationSetup({pipeline:'challenge'});f.state.tables.weekly_challenges[0].additional_rules='Discuss the prototype limitations honestly.';
  assert.equal((await f.challenge()).status,200);assert(JSON.stringify(f.state.calls[0].body).includes('Discuss the prototype limitations honestly.'));
});
test('Challenge malformed stored rules stop before admission',async()=>{
  const f=presentationSetup({pipeline:'challenge'});f.state.tables.weekly_challenges[0].additional_rules={fake:'rules'};
  assert.equal((await f.challenge()).status,503);assert.equal(f.state.calls.length+f.state.counters.size+f.state.writes.length,0);
});
