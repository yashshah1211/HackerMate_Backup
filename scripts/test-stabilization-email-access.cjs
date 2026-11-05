/* eslint-disable @typescript-eslint/no-require-imports -- No real email/auth/database services. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NextRequest } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const ACTOR = '00000000-0000-4000-8000-000000000001';
const TARGET = '00000000-0000-4000-8000-000000000002';

function fixture(options = {}) {
  const state = { sends: [], reads: [], rpc: [], logs: [] };
  const db = {
    auth: { async getUser() { return { data: { user: options.signedOut ? null : { id: ACTOR, email: 'actor@example.invalid' } }, error: options.authError || null }; } },
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
  const h = harness({ '@supabase/ssr': { createServerClient: () => db }, '@supabase/supabase-js': { createClient: () => db },
    '@/lib/admin/emailBudgetGuard': { async recordEmailSendSuccess() { return { status: 'recorded' }; } },
  }, { console: { log() {}, warn() {}, error: (...args) => state.logs.push(args) }, fetch: async (url, config) => {
    assert.equal(url, 'https://api.resend.com/emails'); state.sends.push(JSON.parse(config.body)); return Response.json({ id: 'synthetic-receipt' });
  } });
  Object.assign(h.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
    RESEND_API_KEY: 'synthetic-provider', RESEND_FROM_EMAIL: 'Fixture <sender@example.invalid>' });
  return { state, async call(type = 'connection_request', bearer = false) {
    return h.load('src/app/api/send-email/route.ts').POST(new NextRequest('http://localhost/api/send-email', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer synthetic-token' } : {}) },
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
    const f = fixture(), response = await f.call(type, bearer); assert.equal(response.status, 200); assert.equal(f.state.sends.length, 1); assert.equal((await response.json()).success, true);
  });
}
