/* eslint-disable @typescript-eslint/no-require-imports -- Actual webhook with atomic synthetic claims and mocked email provider. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NextRequest } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const ID = '00000000-0000-4000-8000-000000000003';
const USER = '00000000-0000-4000-8000-000000000002';
const BODY = { notificationId: ID, recipientId: USER, recipientEmail: 'target@example.invalid', recipientName: 'Fixture', message: 'Synthetic team invitation', link: '/invites' };

function fixture(options = {}) {
  const state = { claims: new Map(), sends: [], logs: [], reads: [] };
  const db = { from(table) {
    let operation = 'read', payload, single = false; const filters = [];
    const query = { select() { return this; }, eq(...args) { filters.push(args); return this; },
      insert(value) { operation = 'insert'; payload = value; return this; }, update(value) { operation = 'update'; payload = value; return this; },
      delete() { operation = 'delete'; return this; }, maybeSingle() { single = true; return this; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          let rows = [];
          if (table === 'app_settings') {
            if (operation === 'insert') {
              if (options.claimError) return { data: null, error: { code: '42501', message: 'Synthetic claim denied' } };
              if (state.claims.has(payload.key)) return { data: null, error: { code: '23505' } };
              state.claims.set(payload.key, { ...payload }); rows = [{ key: payload.key }];
            } else {
              rows = [...state.claims.values()].filter(row => filters.every(([key, value]) => row[key] === value));
              if (operation === 'update') {
                if (options.outcomeError) return { data: null, error: { code: '42501', message: 'Synthetic outcome denied' } };
                rows.forEach(row => Object.assign(row, payload));
              } else if (operation === 'delete') {
                if (options.releaseError) return { data: null, error: { code: '42501', message: 'Synthetic release denied' } };
                rows.forEach(row => state.claims.delete(row.key));
              }
            }
          } else {
            state.reads.push(table);
            if (options.readError === table) return { data: null, error: { code: '42501', message: 'Synthetic lookup denied' } };
            if (table === 'notifications') rows = options.missingNotification ? [] : [{ id: ID, user_id: USER, message: BODY.message, link: BODY.link, ...options.notification }];
            else if (table === 'profiles') rows = options.missingProfile ? [] : [{ id: USER, email: BODY.recipientEmail, full_name: 'Fixture', is_banned: false, ...options.profile }];
            else throw Error('Unexpected table ' + table);
          }
          return { data: single ? rows[0] || null : rows, error: null };
        }).then(resolve, reject);
      },
    }; return query;
  } };
  const h = harness({ '@supabase/supabase-js': { createClient: () => db },
    '@/lib/admin/emailBudgetGuard': { async recordEmailSendSuccess() { return { status: 'recorded' }; } },
  }, { console: { log() {}, warn() {}, error: (...args) => state.logs.push(args) }, fetch: async (url, config) => {
    assert.equal(url, 'https://api.resend.com/emails'); state.sends.push(JSON.parse(config.body));
    if (options.providerWait) await options.providerWait;
    if (options.providerThrows) throw Error('Synthetic lost acknowledgment');
    return options.provider ? options.provider() : Response.json({ id: 'synthetic-provider-receipt' });
  } });
  Object.assign(h.env, { NOTIFICATION_WEBHOOK_SECRET: 'synthetic-hook', NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
    RESEND_API_KEY: 'synthetic-provider', RESEND_FROM_EMAIL: 'Fixture <sender@example.invalid>', NEXT_PUBLIC_SITE_URL: 'https://fixture.invalid', ...options.env });
  return { state, env: h.env, async call(body = BODY, secret = 'synthetic-hook') {
    return h.load('src/app/api/webhooks/notification/route.ts').POST(new NextRequest('http://localhost/api/webhooks/notification', { method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  } };
}

for (const [label, options] of [['accepted', {}], ['ambiguous', { providerThrows: true }], ['rejected', { provider: () => Response.json({ error: 'rejected' }, { status: 429 }) }], ['outcome persistence failed', { outcomeError: true }]]) {
  test(`Notification replay: ${label} result never authorizes a second provider call`, async () => {
    const f = fixture(options); await f.call(); const replay = await f.call();
    assert.equal(replay.status, 409); assert.equal(f.state.sends.length, 1);
  });
}
test('Notification replay: simultaneous requests authorize only one provider call', async () => {
  const f = fixture(); const responses = await Promise.all([f.call(), f.call(), f.call()]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409, 409]); assert.equal(f.state.sends.length, 1);
});
test('Notification replay: permission failure cannot dispatch', async () => {
  const f = fixture({ claimError: true }); assert.equal((await f.call()).status, 503); assert.equal(f.state.sends.length, 0);
  assert(f.state.logs.some(args => args.some(arg => arg?.code === '42501')));
});
test('Notification replay: a never-attempted dispatch can safely retry after configuration recovery', async () => {
  const f = fixture({ env: { RESEND_API_KEY: '' } }); assert.equal((await f.call()).status, 503); assert.equal(f.state.sends.length, 0);
  f.env.RESEND_API_KEY = 'synthetic-provider'; assert.equal((await f.call()).status, 200); assert.equal(f.state.sends.length, 1);
});
test('Notification replay: uncertain claim release remains fail closed', async () => {
  const f = fixture({ releaseError: true, env: { RESEND_API_KEY: '' } }); await f.call(); f.env.RESEND_API_KEY = 'synthetic-provider';
  assert.equal((await f.call()).status, 409); assert.equal(f.state.sends.length, 0);
});
for (const [label, options, body, status] of [
  ['missing ID', {}, { ...BODY, notificationId: undefined }, 400],
  ['unknown notification', { missingNotification: true }, BODY, 403],
  ['wrong recipient identity', {}, { ...BODY, recipientId: ID }, 403],
  ['suspended recipient', { profile: { is_banned: true } }, BODY, 403],
  ['unknown suspension', { profile: { is_banned: null } }, BODY, 403],
  ['notification query failure', { readError: 'notifications' }, BODY, 503],
  ['profile query failure', { readError: 'profiles' }, BODY, 503],
]) test(`Notification integrity: ${label} cannot send email`, async () => {
  const f = fixture(options); assert.equal((await f.call(body)).status, status); assert.equal(f.state.sends.length, 0); assert.equal(f.state.claims.size, 0);
});
test('Notification integrity: recipient/content come from the stored event/profile', async () => {
  const f = fixture(); assert.equal((await f.call({ ...BODY, recipientEmail: 'forged@example.invalid', message: 'forged team content', link: '/messages' })).status, 200);
  assert.equal(f.state.sends[0].to, BODY.recipientEmail); assert(f.state.sends[0].html.includes(BODY.message)); assert(!f.state.sends[0].html.includes('forged team content'));
});
test('Notification integrity: wrong secret does no database/provider work', async () => {
  const f = fixture(); assert.equal((await f.call(BODY, 'wrong')).status, 401); assert.equal(f.state.reads.length + f.state.sends.length, 0);
});
