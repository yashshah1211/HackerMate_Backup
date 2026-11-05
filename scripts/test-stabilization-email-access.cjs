/* eslint-disable @typescript-eslint/no-require-imports -- No real email/auth/database services. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NextRequest } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const ACTOR = '00000000-0000-4000-8000-000000000001';
const TARGET = '00000000-0000-4000-8000-000000000002';

function fixture(options = {}) {
  const state = { sends: [], reads: [], rpc: [], logs: [], auth: [] };
  const auth = transport => ({ async getUser(token) {
    state.auth.push({ transport, token });
    return { data: { user: Object.hasOwn(options, transport + 'User') ? options[transport + 'User'] : options.signedOut ? null : { id: ACTOR, email: 'actor@example.invalid' } },
      error: options[transport + 'Error'] || options.authError || null };
  } });
  const db = {
    auth: auth('cookie'),
    async rpc(name) { state.rpc.push(name); return { data: [{ allowed: true }], error: null }; },
    from(table) {
      let columns = ''; const filters = [];
      return { select(value) { columns = value; return this; }, eq(...args) { filters.push(args); return this; },
        async single() { return this.maybeSingle(); },
        async maybeSingle() {
          state.reads.push({ table, columns });
          if (table === 'profiles') {
            const id = filters.find(([key]) => key === 'id')?.[1];
            if (id === ACTOR && options.profileError) return { data: null, error: options.profileError };
            const row = id === ACTOR ? options.profile === null ? null : { id: ACTOR, full_name: 'Synthetic actor', email: 'actor@example.invalid', role: 'admin', is_banned: false, ...options.profile }
              : { id: TARGET, full_name: 'Synthetic recipient', email: 'target@example.invalid' };
            return { data: row && Object.fromEntries(columns.split(',').map(key => key.trim()).map(key => [key, row[key]])), error: null };
          }
          if (table === 'friend_requests') return { data: { id: 'synthetic-request', message: 'Synthetic' }, error: null };
          throw Error('Unexpected table ' + table);
        },
      };
    },
  };
  const h = harness({ '@supabase/ssr': { createServerClient: () => db }, '@supabase/supabase-js': { createClient: (url, key) => key === 'synthetic-anon' ? { ...db, auth: auth('bearer') } : db },
    '@/lib/admin/emailBudgetGuard': { async recordEmailSendSuccess() { return { status: 'recorded' }; } },
  }, { console: { log() {}, warn() {}, error: (...args) => state.logs.push(args) }, fetch: async (url, config) => {
    assert.equal(url, 'https://api.resend.com/emails'); state.sends.push(JSON.parse(config.body)); return Response.json({ id: 'synthetic-receipt' });
  } });
  Object.assign(h.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
    RESEND_API_KEY: 'synthetic-provider', RESEND_FROM_EMAIL: 'Fixture <sender@example.invalid>' });
  return { state, async call(type = 'connection_request', bearer = false) {
    return h.load('src/app/api/send-email/route.ts').POST(new NextRequest('http://localhost/api/send-email', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: typeof bearer === 'string' ? bearer : 'Bearer synthetic-token' } : {}) },
      body: JSON.stringify({ senderId: ACTOR, recipientId: TARGET, type }),
    }));
  } };
}
for (const type of ['connection_request', 'onboarding_nudge']) {
  for (const [label, options, status] of [
    ['suspended', { profile: { is_banned: true } }, 403],
    ['unknown suspension', { profile: { is_banned: null } }, 403],
    ['missing profile', { profile: null }, 403],
    ['permission failure', { profileError: { code: '42501', message: 'Synthetic denied' } }, 403],
    ['rejected identity carrying user payload', { authError: { status: 401, message: 'Synthetic rejected identity' } }, 401],
    ['signed out', { signedOut: true }, 401],
  ]) test(`Email ${type}: ${label} cannot dispatch`, async () => {
    const f = fixture(options); assert.equal((await f.call(type)).status, status); assert.equal(f.state.sends.length, 0); assert.equal(f.state.rpc.length, 0);
    if (options.profileError) assert(f.state.logs.some(args => args.includes(options.profileError)));
  });
  for (const bearer of [false, true]) test(`Email ${type}: active caller retains ${bearer ? 'bearer' : 'cookie'} workflow`, async () => {
    const f = fixture(bearer ? { cookieUser: null } : {}), response = await f.call(type, bearer);
    assert.equal(response.status, 200); assert.equal(f.state.sends.length, 1);
    const body = await response.json(); assert.equal(body.success, true);
    assert.deepEqual(Object.keys(body).sort(), ['accounting', 'dispatch', 'message', 'success']);
    assert.equal(body.dispatch.providerId, 'synthetic-receipt');
    assert.equal(f.state.auth.at(-1).transport, bearer ? 'bearer' : 'cookie');
  });
}

for (const [label, options, status] of [
  ['different valid bearer', { bearerUser: { id: TARGET, email: 'other@example.invalid' } }, 200],
  ['rejected bearer', { bearerUser: null, bearerError: { status: 401 } }, 200],
  ['suspended cookie cannot be bypassed by bearer', { profile: { is_banned: true }, bearerUser: { id: TARGET, email: 'other@example.invalid' } }, 403],
]) test(`Email dual credentials: existing cookie identity wins over ${label}`, async () => {
  const f = fixture(options), response = await f.call('connection_request', true);
  assert.equal(response.status, status); assert.equal(f.state.sends.length, status === 200 ? 1 : 0);
  assert.deepEqual(f.state.auth.map(entry => entry.transport), ['cookie']);
});

test('Email dual credentials: rejected cookie identity falls back to verified bearer', async () => {
  const f = fixture({ cookieError: { status: 401 }, cookieUser: { id: TARGET, email: 'rejected@example.invalid' } });
  assert.equal((await f.call('connection_request', true)).status, 200);
  assert.deepEqual(f.state.auth.map(entry => entry.transport), ['cookie', 'bearer']);
});

test('Email bearer fallback retains legacy surrounding-token whitespace handling', async () => {
  const f = fixture({ cookieUser: null }); assert.equal((await f.call('connection_request', 'Bearer   synthetic-token  ')).status, 200);
  assert.equal(f.state.auth.at(-1).token, 'synthetic-token');
});
