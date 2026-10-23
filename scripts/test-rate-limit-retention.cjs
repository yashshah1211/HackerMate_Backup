/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-module maintenance regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NextRequest, NextResponse } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const { createClient } = require('@supabase/supabase-js');
const NOW = Date.parse('2026-10-23T10:00:00Z');
const PRIVATE = 'private-IP-hash-idempotency-token-never-log';
const row = (ip, delta = -120_000) => ({ ip, reset_time: new Date(NOW + delta).toISOString(), request_count: 3 });

function setup(options = {}) {
  const state = { rows: [row(PRIVATE)], queries: [], logs: [], clock: NOW, calls: {}, sends: 0, streaks: 0, reports: 0, adminChecks: 0, ...options };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [state.clock])); } static now() { return state.clock; } }
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: '00000000-0000-4000-8000-000000000001' } }, error: null }) },
    async rpc(name, args) {
      if (name === 'cleanup_lapsed_streaks') { state.streaks++; return { data: { success: true }, error: null }; }
      assert.equal(name, 'check_rate_limit'); state.rateArgs = args;
      return { data: [{ allowed: false, remaining: 0, reset_time: new Date(NOW + 3_600_000).toISOString() }], error: null };
    },
    from(table) {
      if (table === 'app_settings') return { upsert() { return { select: async () => ({ data: [{ key: 'last_db_report_run' }], error: null }) }; } };
      assert.equal(table, 'rate_limits');
      const q = { table, kind: 'select', predicates: [], orders: [] };
      const chain = {
        select(columns) { q.columns = columns; return chain; },
        delete(settings) { q.kind = 'delete'; q.settings = settings; return chain; },
        lt(column, value) { q.predicates.push([column, value]); return chain; },
        order(column) { q.orders.push(column); return chain; },
        limit(count) { q.limit = count; return chain; },
        in(column, keys) { assert.equal(column, 'ip'); q.keys = keys; return chain; },
        abortSignal(signal) { q.signal = signal; return chain; },
        async then(resolve, reject) {
          try {
            q.operation = q.kind === 'delete' ? 'delete' : q.columns === 'reset_time' ? 'probe' : 'select';
            state.queries.push(q); state.calls[q.operation] = (state.calls[q.operation] || 0) + 1;
            assert(q.signal instanceof AbortSignal); assert.deepEqual(q.predicates, [['reset_time', new Date(NOW - 60_000).toISOString()]]);
            if (state.stall === q.operation) return; // Deliberately ignores cancellation; client waiting must still stop.
            if (state.beforeQuery) state.beforeQuery(q, state);
            if (state.throwOn === q.operation) throw Object.assign(Error(PRIVATE), { code: '42501', details: PRIVATE });
            if (state.errorOn === q.operation) return resolve({ data: null, count: null, error: { code: '42501', message: PRIVATE, details: PRIVATE } });
            if (state.override?.[q.operation]) return resolve(state.override[q.operation]);
            const cutoff = Date.parse(q.predicates[0][1]);
            if (q.kind === 'delete') {
              assert(q.keys.length > 0 && q.keys.length <= 100); assert.equal(q.settings.count, 'exact'); assert.deepEqual(Object.keys(q.settings), ['count']);
              if (state.beforeDelete) state.beforeDelete(q, state);
              const eligible = state.rows.filter(r => q.keys.includes(r.ip) && Date.parse(r.reset_time) < cutoff);
              const deleted = eligible.slice(0, state.deleteCap ?? Infinity);
              state.rows = state.rows.filter(r => !deleted.includes(r));
              if (state.uncertainDelete) throw Error(PRIVATE);
              return resolve({ data: null, count: deleted.length, error: null });
            }
            const eligible = state.rows.filter(r => Date.parse(r.reset_time) < cutoff).sort((a, b) => a.reset_time.localeCompare(b.reset_time) || a.ip.localeCompare(b.ip));
            if (q.operation === 'select') { assert.deepEqual(q.orders, ['reset_time', 'ip']); assert.equal(q.limit, 100); }
            else assert.equal(q.limit, 1);
            return resolve({ data: eligible.slice(0, q.limit).map(r => q.operation === 'probe' ? { reset_time: r.reset_time } : { ip: r.ip, reset_time: r.reset_time }), error: null });
          } catch (error) { return reject(error); }
        },
      }; return chain;
    },
  };
  const loader = harness({
    '@supabase/supabase-js': { createClient: () => admin },
    '@supabase/ssr': { createServerClient: () => admin },
    '@/lib/admin/requireAdmin': { requireAdmin: async () => { state.adminChecks++; return state.adminAllowed ? { user: { id: 'fixture-admin' }, supabaseAdmin: admin } : NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); } },
    '@/lib/admin/databaseActivityReport': {
      fetchDatabaseActivity: async () => { state.reports++; if (state.reportThrows) throw Error('fixture report failed'); return { summary: { totalNewItems: 0 }, team_hackathons: [], timeWindow: { until: 'fixture' } }; },
      generateDatabaseActivityPdf: () => Buffer.from('%PDF-fixture'),
    },
    '@/lib/admin/emailBudgetGuard': { recordEmailSendSuccess: async () => ({ status: 'recorded' }) },
    '@/lib/emailDispatch': {
      dispatchEmail: async () => { state.sends++; return { status: 'accepted', intendedRecipientAccepted: true }; },
      dispatchHttpStatus: () => 200,
      dispatchResponse: value => ({ status: value.status }),
      recordEmailBookkeeping: async fn => { await fn(); return 'recorded'; },
    },
  }, { Date: Clock, AbortController, console: Object.fromEntries(['error', 'warn', 'info', 'log'].map(level => [level, (...args) => state.logs.push({ level, args })])) });
  Object.assign(loader.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', CRON_SECRET: 'fixture-machine-secret', ...state.env });
  const cleanup = () => loader.load('src/lib/evaluator/rateLimitRetention.ts').pruneExpiredRateLimits(admin);
  async function invoke({ token = 'fixture-machine-secret', method = 'GET', query = '', extraHeaders = {} } = {}) {
    const request = new NextRequest(`https://example.invalid/api/cron/database-activity-report${query}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders } });
    const response = await loader.load('src/app/api/cron/database-activity-report/route.ts')[method](request);
    return { status: response.status, body: response.headers.get('content-type')?.includes('application/pdf') ? await response.text() : await response.json() };
  }
  return { state, loader, cleanup, invoke };
}

test('deletes old legacy and namespaced keys, preserving active, just-expired and cutoff rows', async () => {
  const f = setup({ rows: [row('legacy'), row('eval:v1:opaque'), row('contact-active', 60_000), row('email-active', 3_600_000), row('just-expired', -30_000), row('cutoff', -60_000)] });
  const result = await f.cleanup();
  assert.equal(result.status, 'complete'); assert.equal(result.deleted, 2); assert.equal(result.remaining, false);
  assert.deepEqual(f.state.rows.map(r => r.ip), ['contact-active', 'email-active', 'just-expired', 'cutoff']);
  assert(f.state.rows.every(r => r.request_count === 3));
});
test('concurrently renewed row survives the deletion predicate', async () => {
  const f = setup({ rows: [row('renewed'), row('expired')], beforeDelete: (_q, s) => { const r = s.rows.find(r => r.ip === 'renewed'); r.reset_time = new Date(NOW + 60_000).toISOString(); r.request_count = 1; } });
  const result = await f.cleanup(); assert.equal(result.deleted, 1); assert.equal(result.status, 'complete');
  assert.equal(f.state.rows[0].ip, 'renewed'); assert.equal(f.state.rows[0].request_count, 1);
});
test('500-row limit reports a remaining backlog; repeated runs are safe', async () => {
  const f = setup({ rows: Array.from({ length: 730 }, (_, i) => row(`opaque-${i}`)) });
  const first = await f.cleanup(); assert.equal(first.status, 'partial'); assert.equal(first.deleted, 500); assert.equal(first.batches, 5); assert.equal(first.remaining, true);
  assert.equal(f.state.calls.delete, 5); assert(f.state.logs.some(l => l.level === 'error'));
  assert.equal((await f.cleanup()).deleted, 230); assert.equal((await f.cleanup()).deleted, 0); assert.equal(f.state.rows.length, 0);
});
test('partial deletion counts only confirmed rows and reports backlog', async () => {
  const f = setup({ rows: Array.from({ length: 20 }, (_, i) => row(`key-${i}`)), deleteCap: 1 });
  const result = await f.cleanup(); assert.equal(result.deleted, 5); assert.equal(result.status, 'partial'); assert.equal(f.state.rows.length, 15);
});
test('zero-row deletion is not treated as backlog clearance', async () => {
  const f = setup({ deleteCap: 0 }); const result = await f.cleanup(); assert.equal(result.status, 'partial'); assert.equal(result.deleted, 0); assert.equal(f.state.rows[0].request_count, 3);
});
for (const operation of ['select', 'delete', 'probe']) for (const kind of ['errorOn', 'throwOn']) test(`${operation} ${kind} is observable and sanitized`, async () => {
  const f = setup({ [kind]: operation }); const result = await f.cleanup();
  assert.equal(result.status, 'unverified'); assert.equal(result.remaining, null); assert(f.state.logs.some(l => l.level === 'error'));
  assert(!JSON.stringify({ result, logs: f.state.logs }).includes(PRIVATE));
  assert.equal(result.deleted, operation === 'probe' ? 1 : 0);
});
for (const [operation, value] of [
  ['select', { data: null, error: null }], ['select', { data: [row('not-expired', 0)], error: null }],
  ['select', { data: [row('duplicate'), row('duplicate')], error: null }],
  ['select', { data: [row('unsafe",other-key,"')], error: null }],
  ['delete', { count: null, error: null }], ['delete', { count: 2, error: null }], ['delete', { count: -1, error: null }],
  ['probe', { data: null, error: null }], ['probe', { data: [{ reset_time: 'invalid' }], error: null }],
]) test(`${operation} malformed response never establishes retention: ${JSON.stringify(value)}`, async () => {
  const f = setup({ override: { [operation]: value } }); const result = await f.cleanup(); assert.equal(result.status, 'unverified'); assert.equal(result.code, 'invalid_response');
  if (operation === 'select') assert.equal(f.state.calls.delete, undefined);
});
test('a later failed batch retains earlier confirmed counts without hiding unfinished work', async () => {
  const f = setup({ rows: Array.from({ length: 120 }, (_, i) => row(`key-${i}`)), beforeQuery: (q, s) => { if (q.operation === 'delete' && s.calls.delete === 2) s.errorOn = 'delete'; } });
  const result = await f.cleanup(); assert.equal(result.deleted, 100); assert.equal(result.batches, 1); assert.equal(result.status, 'unverified'); assert.equal(f.state.rows.length, 20);
});
test('lost delete response does not claim confirmation or retry uncertain mutation', async () => {
  const f = setup({ uncertainDelete: true }); const result = await f.cleanup();
  assert.equal(f.state.rows.length, 0); assert.equal(result.deleted, 0); assert.equal(result.status, 'unverified'); assert.equal(f.state.calls.delete, 1);
});
test('real Supabase client sends bounded, filtered DELETE with exact count and expiry recheck', async () => {
  const f = setup(), calls = [];
  const client = createClient('https://fixture.invalid', 'offline-service-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input, init) => {
    const url = new URL(input), method = init.method || 'GET'; calls.push({ url, method });
    assert.equal(url.origin, 'https://fixture.invalid'); assert.equal(url.pathname, '/rest/v1/rate_limits');
    assert.equal(url.searchParams.get('reset_time'), 'lt.2026-10-23T09:59:00.000Z'); assert(init.signal instanceof AbortSignal);
    if (method === 'DELETE') {
      assert.equal(url.searchParams.get('ip'), `in.(${PRIVATE})`); assert(new Headers(init.headers).get('prefer').includes('count=exact'));
      return new Response(null, { status: 204, headers: { 'content-range': '*/1' } });
    }
    assert(['100', '1'].includes(url.searchParams.get('limit')));
    return Response.json(calls.length === 1 ? [{ ip: PRIVATE, reset_time: row(PRIVATE).reset_time }] : []);
  } } });
  const result = await f.loader.load('src/lib/evaluator/rateLimitRetention.ts').pruneExpiredRateLimits(client);
  assert.equal(result.status, 'complete'); assert.equal(result.deleted, 1); assert.equal(calls.filter(c => c.method === 'DELETE').length, 1);
});
test('time budget prevents a new deletion after a slow selection', async () => {
  const f = setup({ beforeQuery: (q, s) => { if (q.operation === 'select') s.clock += 5_001; } });
  const result = await f.cleanup(); assert.equal(result.code, 'deadline_exceeded'); assert.equal(f.state.calls.delete, undefined); assert.equal(f.state.rows.length, 1);
});
test('five-second client deadline stops waiting even if an adapter ignores abort', async () => {
  const f = setup({ stall: 'select' }), started = Date.now(); const result = await f.cleanup();
  assert.equal(result.code, 'deadline_exceeded'); assert(Date.now() - started < 6_500); assert.equal(f.state.queries[0].signal.aborted, true); assert.equal(f.state.calls.delete, undefined);
});
test('intended authenticated cron GET performs cleanup and preserves report/streak/email behavior', async () => {
  const f = setup(); const result = await f.invoke(); assert.equal(result.status, 200); assert.equal(result.body.rateLimitCleanup.status, 'complete');
  assert.equal(f.state.adminChecks, 0); assert.equal(f.state.streaks, 1); assert.equal(f.state.reports, 1); assert.equal(f.state.sends, 1);
});
for (const options of [{ token: null }, { token: 'invalid' }, { token: null, extraHeaders: { 'x-vercel-cron': '1' } }]) test(`unauthenticated cron request cannot trigger maintenance: ${JSON.stringify(options)}`, async () => {
  const f = setup(); const result = await f.invoke(options); assert.equal(result.status, 401); assert.equal(f.state.queries.length, 0); assert.equal(f.state.streaks + f.state.sends, 0);
});
test('missing cron secret does not turn empty credentials into machine authorization', async () => {
  const f = setup({ env: { CRON_SECRET: '' } }); assert.equal((await f.invoke({ token: null })).status, 401); assert.equal(f.state.queries.length, 0);
});
for (const options of [{ token: 'fixture-admin-token' }, { token: 'fixture-admin-token', query: '?format=pdf' }, { query: '?format=pdf' }, { method: 'POST' }]) test(`interactive/PDF/POST cannot invoke cleanup: ${JSON.stringify(options)}`, async () => {
  const f = setup({ adminAllowed: true }); const result = await f.invoke(options); assert.equal(result.status, 200); assert.equal(f.state.queries.length, 0); assert.equal(f.state.streaks, 1);
  if (options.query) { assert.equal(f.state.sends, 0); assert.equal(f.state.adminChecks, 1); assert(result.body.startsWith('%PDF')); }
  else assert.equal(f.state.sends, 1);
});
test('cleanup failure remains explicit while existing reporting continues', async () => {
  const f = setup({ errorOn: 'delete' }); const result = await f.invoke(); assert.equal(result.status, 200); assert.equal(result.body.rateLimitCleanup.status, 'unverified');
  assert.equal(f.state.sends, 1); assert.equal(f.state.streaks, 1); assert.equal(f.state.rows.length, 1); assert(!JSON.stringify(result.body).includes(PRIVATE));
});
test('partial maintenance is reported even if report generation subsequently fails', async () => {
  const f = setup({ deleteCap: 0, reportThrows: true }); const result = await f.invoke(); assert.equal(result.status, 500); assert.equal(result.body.rateLimitCleanup.status, 'partial');
});
for (const email of [false, true]) test(`existing ${email ? 'email' : 'contact'} limiter denial and limits stay unchanged`, async () => {
  const f = setup(); const route = f.loader.load(email ? 'src/app/api/send-email/route.ts' : 'src/app/api/contact/route.ts');
  const response = await route.POST(new NextRequest('https://example.invalid/api', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '192.0.2.1' }, body: JSON.stringify(email ? { senderId: '00000000-0000-4000-8000-000000000001', recipientId: '00000000-0000-4000-8000-000000000002', type: 'team_invite' } : { name: 'Fixture', email: 'fixture@example.invalid', message: 'Fixture message' }) }));
  assert.equal(response.status, 429); assert.equal(f.state.rateArgs.p_limit, email ? 15 : 5); assert.equal(f.state.rateArgs.p_window_interval, '1 hour');
  assert.equal(f.state.sends, 0); assert.equal(f.state.queries.length, 0); assert.equal(f.state.rows[0].request_count, 3);
});
