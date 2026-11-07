/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic VM route and database fixtures. */
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const { memoryClaims } = require('./analytics-digest-harness.cjs');

const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = Date.parse('2026-11-07T12:00:00Z');
const deadline = '2026-11-07T20:00:00.123456Z';
const reminderRow = (ids = {}, end = deadline) => ({
  saved_id: ids.saved || uuid(91), user_id: ids.user || uuid(92), hackathon_id: ids.event || uuid(93),
  user_email: 'builder@example.invalid', user_name: 'Synthetic builder', hackathon_name: 'Synthetic event', registration_end: end,
});

function memoryReminderDb(options = {}) {
  const rows = options.rows || [reminderRow()];
  const claims = memoryClaims({ failure: options.claimFault });
  const state = { claims: claims.rows, rows, operations: [], completed: new Map(), registrations: new Set(), accounted: 0 };
  function from(table) {
    if (table === 'app_settings') return claims.from(table);
    const filters = {};
    let patch, single = false, columns;
    const query = {
      select(value) { columns = value; return query; },
      eq(key, value) { filters[key] = value; return query; },
      is(key, value) { filters[key] = value; return query; },
      update(value) { patch = value; return query; },
      abortSignal(signal) { assert(signal instanceof AbortSignal); return query; },
      maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          state.operations.push({ table, filters, patch, columns });
          if (options.dbError === table) return { data: null, error: { code: '42501', message: 'PRIVATE_SQL_DETAIL' } };
          let data;
          if (table === 'profiles') {
            const row = rows.find(r => r.user_id === filters.id);
            data = row ? { id: row.user_id, email: row.user_email, full_name: row.user_name, is_banned: false, ...options.profile } : null;
          } else if (table === 'hackathons') {
            const row = rows.find(r => r.hackathon_id === filters.id);
            data = row ? { id: row.hackathon_id, name: row.hackathon_name, status: 'approved', archived: false,
              registration_end: row.registration_end, registration_start: null, registration_status: 'open', ...options.event } : null;
          } else if (table === 'saved_hackathons') {
            const row = rows.find(r => r.saved_id === filters.id && r.user_id === filters.user_id && r.hackathon_id === filters.hackathon_id);
            assert.equal(filters.reminder_sent_at, null);
            data = [];
            if (row && !state.completed.has(row.saved_id) && !options.zeroCompletion) {
              state.completed.set(row.saved_id, patch.reminder_sent_at);
              data.push({ id: row.saved_id, reminder_sent_at: patch.reminder_sent_at });
            }
          } else {
            assert.equal(table, 'daily_email_stats');
            if (patch) state.accounted = patch.notifications_sent;
            const stats = { total_sent: state.accounted, outreach_sent: 0, nudges_sent: 0, notifications_sent: state.accounted, date: filters.date };
            data = single ? stats : [stats];
          }
          return { data, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  }
  function rpc(name) {
    assert.equal(name, 'get_pending_deadline_reminders');
    let id, cursor, pageSize;
    const query = {
      eq(key, value) { assert.equal(key, 'saved_id'); id = value; return query; },
      gt(key, value) { assert.equal(key, 'saved_id'); cursor = value; return query; },
      order(key, opts) { assert.equal(key, 'saved_id'); assert.equal(opts.ascending, true); return query; },
      limit(value) { assert.equal(value, id ? 2 : 100); pageSize = value; return query; },
      abortSignal(signal) { assert(signal instanceof AbortSignal); return query; },
      then(resolve, reject) {
        return Promise.resolve().then(async () => {
          state.operations.push({ rpc: name, id, cursor });
          await options.beforeRead?.(id, state);
          if (options.rpcError === (id ? 'final' : 'discovery')) return { data: null, error: { code: '42501', message: 'PRIVATE_SQL_DETAIL' } };
          const visible = rows.filter(r => (!id || r.saved_id === id) && (!cursor || r.saved_id > cursor) &&
            !state.completed.has(r.saved_id) && !state.registrations.has(r.user_id + r.hackathon_id));
          visible.sort((a, b) => a.saved_id.localeCompare(b.saved_id));
          return { data: visible.slice(0, Math.min(pageSize, options.rowCap ?? pageSize)), error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  }
  return { from, rpc, state };
}

function setupReminder(options = {}) {
  const db = options.db || memoryReminderDb(options);
  const state = options.state || { requests: [], clients: 0, logs: [] };
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [FixtureDate.now()])); }
    static now() { return options.now?.() ?? now; }
  }
  const h = harness({
    'next/server': { NextRequest, NextResponse },
    '@supabase/supabase-js': { createClient: () => {
      state.clients++;
      return db;
    } },
  }, {
    Date: FixtureDate,
    console: { log() {}, warn() {}, error: (...args) => state.logs.push(args) },
    fetch: async (url, request) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.Authorization, 'Bearer synthetic-provider');
      assert.equal(request.redirect, 'error');
      assert(request.signal instanceof AbortSignal);
      state.requests.push({ payload: JSON.parse(request.body), key: request.headers['Idempotency-Key'] });
      return options.provider ? options.provider(request) : Response.json({ id: 'synthetic-receipt' }, { status: 201 });
    },
  });
  Object.assign(h.env, { CRON_SECRET: 'synthetic-cron', RESEND_API_KEY: 'synthetic-provider',
    RESEND_FROM_EMAIL: 'Sender <sender@example.invalid>', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', ...options.env });
  const route = h.load('src/app/api/cron/reminders/route.ts');
  const call = (headers = {}) => route.POST(new NextRequest('http://127.0.0.1:1/api/cron/reminders', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic-cron', ...headers },
  }));
  return { db, state, h, call };
}

module.exports = { uuid, now, deadline, reminderRow, memoryReminderDb, setupReminder };
