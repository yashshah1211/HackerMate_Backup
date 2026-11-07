/* eslint-disable @typescript-eslint/no-require-imports -- Actual analytics route and claim helper, only in-process synthetic network/database fixtures. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Readable } = require('node:stream');
const { NodeNextRequest } = require('next/dist/server/base-http/node');
const { NextRequestAdapter } = require('next/dist/server/web/spec-extension/adapters/next-request');
const { memoryClaims, setupAnalytics } = require('./analytics-digest-harness.cjs');
const KEY = 'cron:analytics-summary:v1:2026-11-07';
const entry = db => JSON.parse(db.rows.get(KEY));

test('24 independent GET/POST handlers admit one daily provider call and retain acceptance', async () => {
  const db = memoryClaims(), state = { calls: [], reads: 0, clients: 0, logs: [] };
  const handlers = Array.from({ length: 3 }, () => setupAnalytics({ db, state }));
  const results = await Promise.all(Array.from({ length: 24 }, (_, i) => handlers[i % 3].call({ method: i % 2 ? 'GET' : 'POST' })));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 23);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].headers['Idempotency-Key'], 'hm-analytics-summary/v1/2026-11-07');
  assert.equal(entry(db).status, 'accepted'); assert.equal(entry(db).providerId, 'synthetic-provider-receipt');
  const before = db.rows.get(KEY);
  assert.equal((await handlers[0].call()).status, 409); assert.equal(state.calls.length, 1);
  assert.equal(db.rows.get(KEY), before, 'duplicate cannot alter outcome');
  assert(!JSON.stringify([...db.rows]).includes('@')); assert(!JSON.stringify([...db.rows]).includes('synthetic-cron-token'));
});
test('PDF-only paths never claim/send, before or after a digest', async () => {
  const h = setupAnalytics();
  for (const method of ['GET', 'POST']) assert.equal((await h.call({ method, query: '?format=pdf' })).headers.get('content-type'), 'application/pdf');
  assert.equal(h.db.rows.size, 0); assert.equal(h.state.calls.length, 0);
  assert.equal((await h.call()).status, 200);
  assert.equal((await h.call({ method: 'GET', query: '?format=pdf' })).status, 200);
  assert.equal(h.state.calls.length, 1); assert.equal(h.db.rows.size, 1);
});
for (const token of [null, '', 'wrong-token']) test(`unauthorized ${JSON.stringify(token)} cannot read, claim or send`, async () => {
  const h = setupAnalytics(); assert.equal((await h.call({ token })).status, 401);
  assert.equal(h.state.reads, 0); assert.equal(h.state.clients, 0); assert.equal(h.state.calls.length, 0);
});
test('missing production secret fails closed even with Bearer undefined', async () => {
  const h = setupAnalytics({ env: { CRON_SECRET: '' } }); assert.equal((await h.call({ token: 'undefined' })).status, 401);
  assert.equal(h.state.reads, 0); assert.equal(h.db.rows.size, 0);
});
for (const query of ['?date=2026-11-08', '?format=email', '?format=', '?format=pdf&format=pdf', '?format=pdf&all=true']) {
  test(`invalid query ${query} never sends/reserves`, async () => {
    const h = setupAnalytics(); assert.equal((await h.call({ query })).status, 400); assert.equal(h.state.reads, 0); assert.equal(h.db.rows.size, 0);
  });
}
for (const method of ['PUT', 'DELETE', 'PATCH', 'HEAD']) test(`${method} cannot dispatch`, async () => {
  const h = setupAnalytics(); assert.equal((await h.call({ method })).status, 405); assert.equal(h.state.calls.length, 0); assert.equal(h.state.reads, 0);
});
test('body-bearing requests are refused rather than interpreting caller identity/date', async () => {
  const h = setupAnalytics(); assert.equal((await h.call({ body: '{' })).status, 400); assert.equal(h.state.reads, 0);
});
test('the Next.js Node adapter admits the workflow bodyless POST with or without Content-Length: 0', async () => {
  for (const framing of [{}, { 'content-length': '0' }]) {
    const h = setupAnalytics();
    const incoming = Object.assign(Readable.from([]), {
      method: 'POST', url: '/api/cron/analytics-summary',
      headers: { authorization: 'Bearer synthetic-cron-token', 'content-type': 'application/json', ...framing },
    });
    const request = NextRequestAdapter.fromNodeNextRequest(new NodeNextRequest(incoming), new AbortController().signal);
    assert.notEqual(request.body, null);
    assert.equal((await h.route.POST(request)).status, 200);
    assert.equal(h.state.calls.length, 1);
  }
});
test('local development keeps PDF access but cannot send or claim without authorization', async () => {
  const h = setupAnalytics({ env: { NODE_ENV: 'development', CRON_SECRET: '' } });
  assert.equal((await h.call({ token: null })).status, 401);
  assert.equal((await h.call({ token: null, method: 'GET', query: '?format=pdf' })).status, 200);
  assert.equal(h.db.operations.length, 0);
  assert.equal(h.state.calls.length, 0);
});
for (const credential of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) test(`missing ${credential} prevents provider contact`, async () => {
  const h = setupAnalytics({ env: { [credential]: '' } }); assert.equal((await h.call()).status, 503); assert.equal(h.state.calls.length, 0);
});
test('client initialization failure is private and fail closed', async () => {
  const h = setupAnalytics({ clientFailure: true }), r = await h.call(); assert.equal(r.status, 503);
  assert.equal(h.state.calls.length, 0); assert(!JSON.stringify(await r.json()).includes('PRIVATE_FAILURE')); assert(!JSON.stringify(h.state.logs).includes('PRIVATE_FAILURE'));
});
for (const failure of ['error', 'throw', 'empty', 'lost']) test(`claim insert ${failure} cannot authorize provider contact`, async () => {
  const db = memoryClaims({ failure: operation => operation === 'insert' && failure });
  const h = setupAnalytics({ db }); assert.equal((await h.call()).status, 503); assert.equal(h.state.calls.length, 0);
});
for (const failure of ['error', 'throw', 'empty', 'lost']) test(`dispatching transition ${failure} leaves a permanent hold`, async () => {
  const db = memoryClaims({ failure: (operation, status) => operation === 'update' && status === 'dispatching' && failure });
  const h = setupAnalytics({ db }); assert.equal((await h.call()).status, 503); assert.equal(h.state.calls.length, 0);
  assert(db.rows.has(KEY)); assert.equal((await h.call()).status, 409); assert.equal(h.state.calls.length, 0);
});
for (const failure of ['error', 'throw', 'empty', 'lost']) test(`accepted outcome ${failure} does not reclassify acceptance or allow resend`, async () => {
  const db = memoryClaims({ failure: (operation, status) => operation === 'update' && status === 'accepted' && failure });
  const h = setupAnalytics({ db }), r = await h.call(), body = await r.json();
  assert.equal(r.status, 200); assert.equal(body.success, true); assert.equal(body.dispatch.status, 'accepted');
  assert.equal(body.bookkeeping, 'failed'); assert.equal(body.retrySafe, false);
  assert.equal((await h.call()).status, 409); assert.equal(h.state.calls.length, 1);
});
for (const status of [400, 401, 408, 409, 429, 500, 503]) test(`provider HTTP ${status} retains evidence without retry`, async () => {
  const h = setupAnalytics({ provider: () => Response.json({ id: 'not-accepted', error: 'synthetic' }, { status }) });
  const r = await h.call(), body = await r.json(); assert.equal(r.status, 502); assert.equal(body.success, false);
  const ambiguous = [408, 409, 429, 500, 503].includes(status);
  assert.equal(body.dispatch.status, ambiguous ? 'unknown' : 'failed'); assert.equal(entry(h.db).status, ambiguous ? 'unknown' : 'rejected');
  assert.equal((await h.call()).status, 409); assert.equal(h.state.calls.length, 1);
});
for (const receipt of [null, [], {}, { id: '' }, { id: '  ' }, { id: 42 }, { id: 'synthetic', error: null }, { id: 'synthetic', mock: true }]) {
  test(`malformed acknowledgement ${JSON.stringify(receipt)} remains unknown`, async () => {
    const h = setupAnalytics({ provider: () => Response.json(receipt) });
    assert.equal((await h.call()).status, 502); assert.equal(entry(h.db).status, 'unknown');
    assert.equal((await h.call()).status, 409); assert.equal(h.state.calls.length, 1);
  });
}
for (const provider of [() => new Response('invalid JSON'), () => new Response(null, { status: 204 }), () => { throw Error('Synthetic timeout after acceptance'); }]) {
  test('response loss cannot enable another provider attempt', async () => {
    const h = setupAnalytics({ provider }); assert.equal((await h.call()).status, 502); assert.equal(entry(h.db).status, 'unknown');
    assert.equal((await h.call()).status, 409); assert.equal(h.state.calls.length, 1);
  });
}
test('IST rollover, not UTC midnight, changes identity; legacy namespaces untouched', async () => {
  let at = '2026-11-07T18:29:59Z'; const h = setupAnalytics({ generatedAt: () => at });
  const old = ['cron:database-activity-report:2026-11-07', 'cron:organizer-outreach:v1:recipient:synthetic', 'organizer:pitch:v1:intent:synthetic'];
  old.forEach(key => h.db.rows.set(key, 'preserve'));
  assert.equal((await h.call()).status, 200);
  at = '2026-11-07T18:30:00Z'; assert.equal((await h.call()).status, 200);
  assert(h.db.rows.has('cron:analytics-summary:v1:2026-11-08'));
  at = '2026-11-08T00:00:00Z'; assert.equal((await h.call()).status, 409);
  assert.equal(h.state.calls.length, 2); old.forEach(key => assert.equal(h.db.rows.get(key), 'preserve'));
});
