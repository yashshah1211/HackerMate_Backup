/* eslint-disable @typescript-eslint/no-require-imports -- Offline authorization and real handler regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NextRequest } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const ACTOR = '00000000-0000-4000-8000-000000000001';
const TARGET = '00000000-0000-4000-8000-000000000002';
const FOUNDER = 'yashshah7117@gmail.com';

function setup(options = {}) {
  const state = {
    actor: { id: ACTOR, email: 'operator@example.invalid' }, caller: { role: 'admin', is_banned: false },
    targetAuth: { id: TARGET, email: 'recipient@example.invalid', email_confirmed_at: '2026-01-01' },
    target: { id: TARGET, role: 'user', is_banned: false, email: 'recipient@example.invalid', full_name: 'Fixture recipient', updated_at: '2026-01-01' },
    writes: [], sends: [], recorded: [], errors: [], rate: { allowed: true }, ...options,
  };
  function client(service) {
    return { auth: { getUser: async () => ({ data: { user: state.actor }, error: null }),
      admin: { getUserById: async () => { assert(service); if (state.authThrows) throw Error('private auth failure'); return { data: { user: state.targetAuth }, error: state.authError || null }; } } },
      from(table) {
        assert.equal(table, 'profiles'); let payload, filters = [], columns;
        const query = {
          select(value) { columns = value; return query; },
          eq(key, value) { filters.push([key, value]); return query; },
          is(key, value) { filters.push([key, value]); return query; },
          update(value) { assert(service); payload = value; return query; },
          async single() { return query.maybeSingle(); },
          async maybeSingle() {
            if (!service) return { data: state.caller, error: state.callerError || null };
            if (!payload) {
              const row = columns === 'role' ? state.caller : columns === 'full_name' ? { full_name: 'Operator' } : state.target;
              return { data: structuredClone(row), error: state.readError || null };
            }
            state.writes.push({ payload: JSON.parse(JSON.stringify(payload)), filters });
            if (state.beforeUpdate) state.beforeUpdate(state);
            if (state.writeThrows) throw Error('private transport failure');
            if (state.writeError) return { data: null, error: state.writeError };
            if (state.zeroRows || !state.target || !filters.every(([key, value]) => state.target[key] === value)) return { data: null, error: null };
            Object.assign(state.target, payload);
            return { data: state.badResult ? { id: TARGET, role: 'user', is_banned: !payload.is_banned } : structuredClone(state.target), error: null };
          },
        }; return query;
      },
      async rpc(name, args) { assert(service); assert.equal(name, 'check_rate_limit'); assert.equal(args.p_ip, ACTOR); if (state.rateThrows) throw Error('private rate limiter detail'); return { data: state.rate ? [state.rate] : null, error: state.rateError || null }; },
    };
  }
  const loader = harness({
    '@supabase/supabase-js': { createClient: (_url, key) => client(key === 'fixture-service') },
    '@supabase/ssr': { createServerClient: () => client(false) },
    '@/lib/admin/emailBudgetGuard': { recordEmailSendSuccess: async (...args) => { state.recorded.push(args.slice(1)); } },
  }, { console: { error: (...args) => state.errors.push(args), warn() {}, info() {}, log() {} },
    fetch: async (url, config) => {
      assert.equal(url, 'https://api.resend.com/emails'); state.sends.push(JSON.parse(config.body));
      if (state.providerThrows) throw Error('private provider failure');
      return state.provider || Response.json({ id: 'fixture-provider-receipt' });
    } });
  Object.assign(loader.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', RESEND_API_KEY: 'fixture-provider-key', RESEND_FROM_EMAIL: 'HackerMate <moderation@example.invalid>', NEXT_PUBLIC_SITE_URL: 'https://example.invalid' });
  Object.assign(loader.env, options.env || {});
  async function invoke(warning = false, body) {
    const route = warning ? 'src/app/api/send-email/route.ts' : 'src/app/api/admin/ban-user/route.ts';
    const value = body === undefined ? warning ? { senderId: ACTOR, recipientId: TARGET, type: 'moderation_warning', warningMessage: 'Please review <private> guidelines.' } : { userId: TARGET, is_banned: true } : body;
    const response = await loader.load(route).POST(new NextRequest('https://example.invalid/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }));
    return { status: response.status, body: await response.json() };
  }
  return { state, invoke };
}

for (const warning of [false, true]) {
  const action = warning ? 'warning' : 'ban';
  for (const [label, options] of [
    ['unauthenticated', { actor: null }], ['ordinary user', { caller: { role: 'user', is_banned: false } }],
    ['banned admin', { caller: { role: 'admin', is_banned: true } }], ['unknown ban state', { caller: { role: 'admin', is_banned: null } }],
    ['failed caller lookup', { callerError: { message: 'private lookup failure' } }],
  ]) test(`${action}: ${label} cannot act`, async () => {
    const f = setup(options), result = await f.invoke(warning);
    assert([401, 403].includes(result.status)); assert.equal(f.state.sends.length, 0); assert.equal(f.state.writes.length, 0);
  });
  for (const [label, options] of [
    ['admin', { target: { id: TARGET, role: 'admin', is_banned: false } }],
    ['founder Auth identity', { targetAuth: { id: TARGET, email: FOUNDER } }],
    ['founder profile identity', { target: { id: TARGET, role: 'user', is_banned: false, email: FOUNDER } }],
    ['unknown target role', { target: { id: TARGET, role: null, is_banned: false } }],
    ['unverifiable target identity', { targetAuth: { id: TARGET } }],
    ['mismatched identity', { targetAuth: { id: ACTOR, email: 'mismatch@example.invalid' } }],
  ]) test(`${action}: protected/unverifiable ${label} fails closed`, async () => {
    const f = setup(options); assert.equal((await f.invoke(warning)).status, 403); assert.equal(f.state.writes.length + f.state.sends.length, 0);
  });
  for (const [label, options, status] of [
    ['absent Auth account', { targetAuth: null }, 404], ['absent profile', { target: null }, 404],
    ['Auth read error', { authError: { status: 500, message: 'private identity detail' } }, 500],
    ['profile read error', { readError: { message: 'private database detail' } }, 500],
    ['missing service configuration', { env: { SUPABASE_SERVICE_ROLE_KEY: '' } }, 503],
  ]) test(`${action}: ${label} cannot produce success`, async () => {
    const f = setup(options), result = await f.invoke(warning); assert.equal(result.status, status);
    assert.equal(f.state.writes.length + f.state.sends.length, 0); assert(!JSON.stringify(result.body).includes('private'));
  });
  test(`${action}: self-target and malformed UUID are rejected`, async () => {
    for (const id of [ACTOR, 'invalid', { id: TARGET }]) {
      const f = setup(), body = warning ? { senderId: ACTOR, recipientId: id, type: 'moderation_warning', warningMessage: 'Warning' } : { userId: id, is_banned: true };
      assert.equal((await f.invoke(warning, body)).status, id === ACTOR ? 403 : 400);
      assert.equal(f.state.writes.length + f.state.sends.length, 0);
    }
  });
}

test('ban/unban changes only the requested flag and verifies the affected row', async () => {
  const f = setup(); assert.equal((await f.invoke()).body.changed, true);
  assert.deepEqual(f.state.writes[0].payload, { is_banned: true });
  assert(f.state.writes[0].filters.some(([key, value]) => key === 'role' && value === 'user'));
  assert.equal((await f.invoke(false, { userId: TARGET, is_banned: false })).body.is_banned, false);
});
test('founder actor retains existing authority without granting roles', async () => {
  const f = setup({ actor: { id: ACTOR, email: FOUNDER }, caller: { role: 'user', is_banned: false } });
  assert.equal((await f.invoke()).status, 200); assert.deepEqual(f.state.writes[0].payload, { is_banned: true });
});
test('already-applied ban is idempotent, performs no write and reports changed=false', async () => {
  const f = setup(); await f.invoke(); const result = await f.invoke();
  assert.equal(result.body.changed, false); assert.equal(f.state.writes.length, 1);
});
test('two simultaneous ban requests cannot overwrite each other', async () => {
  const f = setup(); const results = await Promise.all([f.invoke(), f.invoke()]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(f.state.target.is_banned, true);
});
for (const change of ['role', 'is_banned', 'updated_at', 'email']) test(`concurrent ${change} change produces a conflict without overwriting`, async () => {
  const f = setup({ beforeUpdate: state => { state.target[change] = change === 'is_banned' ? true : 'concurrent-value'; } });
  assert.equal((await f.invoke()).status, 409); assert.equal(f.state.target[change], change === 'is_banned' ? true : 'concurrent-value');
});
for (const options of [{ zeroRows: true }, { writeError: { code: '42501' } }, { writeError: { code: 'XX000' } }, { writeThrows: true }, { badResult: true }]) {
  test(`ban write/confirmation failure ${JSON.stringify(options)} never succeeds`, async () => {
    const f = setup(options), result = await f.invoke(); assert([403, 409, 500].includes(result.status)); assert.equal(result.body.success, false);
  });
}
for (const body of [{ userId: TARGET, is_banned: 'true' }, { userId: TARGET, is_banned: true, role: 'admin' }, null, []]) test(`ban rejects malformed/escalating body ${JSON.stringify(body)}`, async () => {
  const f = setup(); assert.equal((await f.invoke(false, body)).status, 400); assert.equal(f.state.writes.length, 0);
});

test('warning uses verified Auth recipient and escaped existing template, returning acceptance only', async () => {
  const f = setup(); const result = await f.invoke(true);
  assert.equal(result.body.status, 'accepted'); assert.equal(f.state.sends[0].to, 'recipient@example.invalid');
  assert.match(f.state.sends[0].html, /&lt;private&gt;/); assert(!JSON.stringify(result.body).includes('recipient@'));
  assert.equal(f.state.writes.length, 0); assert.equal(f.state.recorded.length, 1);
});
for (const env of [{ RESEND_API_KEY: '' }, { RESEND_FROM_EMAIL: '' }, { RESEND_FROM_EMAIL: 'HackerMate <onboarding@resend.dev>' }, { RESEND_FROM_EMAIL: 'bad\r\nInjected: value' }]) test(`warning refuses missing/sandbox configuration ${Object.keys(env)}`, async () => {
  const f = setup({ env }); assert.equal((await f.invoke(true)).status, 503); assert.equal(f.state.sends.length + f.state.recorded.length, 0);
});
for (const options of [{ provider: Response.json({ message: 'private rejection' }, { status: 429 }) }, { provider: Response.json({}) }, { provider: Response.json({ id: 'mock-id', mock: true }) }, { provider: Response.json({ id: 'sandbox-id', sandbox: true }) }, { provider: new Response('not-json') }, { providerThrows: true }]) test('warning rejects failed, incomplete or lost provider acceptance', async () => {
  const f = setup(options), result = await f.invoke(true); assert.equal(result.status, 502); assert.equal(result.body.success, false);
  assert.equal(f.state.recorded.length, 0); assert(!JSON.stringify(result.body).includes('private rejection'));
});
test('warning rejects spoofed actor, excessive content and unconfirmed recipient', async () => {
  const f = setup(); const body = { senderId: TARGET, recipientId: TARGET, type: 'moderation_warning', warningMessage: 'warning' };
  assert.equal((await f.invoke(true, body)).status, 401);
  assert.equal((await f.invoke(true, { ...body, senderId: ACTOR, warningMessage: 'x'.repeat(2001) })).status, 400);
  const unconfirmed = setup({ targetAuth: { id: TARGET, email: 'recipient@example.invalid' } });
  assert.equal((await unconfirmed.invoke(true)).status, 422); assert.equal(unconfirmed.state.sends.length, 0);
});
for (const options of [{ rate: { allowed: false, reset_time: '2030-01-01' } }, { rate: { allowed: 'true' } }, { rate: null }, { rateError: { message: 'offline' } }]) test('warning preserves fail-closed rate limiting', async () => {
  const f = setup(options); assert([429, 503].includes((await f.invoke(true)).status)); assert.equal(f.state.sends.length, 0);
});
test('non-warning onboarding fails closed without provider configuration', async () => {
  const f = setup({ env: { RESEND_API_KEY: '' } });
  const result = await f.invoke(true, { senderId: ACTOR, recipientId: TARGET, type: 'onboarding_nudge' });
  assert.equal(result.status, 503); assert.equal(result.body.success, false); assert.equal(result.body.dispatch.status, "not_dispatched"); assert.equal(f.state.sends.length, 0);
});
test('founder can issue warnings under the existing founder authorization', async () => {
  const f = setup({ actor: { id: ACTOR, email: FOUNDER }, caller: { role: 'user', is_banned: false } });
  assert.equal((await f.invoke(true)).body.status, 'accepted');
});
test('unbounded or blank warning content cannot invoke the provider', async () => {
  for (const warningMessage of ['', '   ', null, { text: 'warning' }, 'x'.repeat(2001)]) {
    const f = setup(); assert.equal((await f.invoke(true, { senderId: ACTOR, recipientId: TARGET, type: 'moderation_warning', warningMessage })).status, 400);
    assert.equal(f.state.sends.length, 0);
  }
});
test('unexpected warning rate-limiter exception never leaks private details', async () => {
  const f = setup({ rateThrows: true }); const result = await f.invoke(true);
  assert.equal(result.status, 500); assert(!JSON.stringify(result.body).includes('private'));
  assert.equal(f.state.sends.length, 0);
});
