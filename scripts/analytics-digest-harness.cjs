/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic claim database and isolated route runtime; no .env or live clients. */
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');

function memoryClaims(options = {}) {
  const rows = new Map(), operations = [];
  return { rows, operations, from(table) {
    assert.equal(table, 'app_settings');
    let operation, row; const filters = [];
    const query = {
      insert(value) { operation = 'insert'; row = value; return query; },
      update(value) { operation = 'update'; row = value; return query; },
      eq(column, value) { filters.push([column, value]); return query; },
      select(columns) { assert.equal(columns, 'key,value'); return query; },
      abortSignal(signal) { assert(signal instanceof AbortSignal); return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          const status = JSON.parse(row.value).status;
          operations.push({ operation, row, filters });
          const failure = options.failure?.(operation, status);
          if (failure === 'throw') throw Error('PRIVATE_FAILURE');
          if (failure === 'error') return { data: null, error: { code: '42501', message: 'PRIVATE_FAILURE' } };
          if (failure === 'empty') return { data: [], error: null };
          if (operation === 'insert') {
            if (rows.has(row.key)) return { data: null, error: { code: '23505' } };
            rows.set(row.key, row.value);
          } else {
            assert.deepEqual(filters.map(([key]) => key), ['key', 'value']);
            const key = filters[0][1], expected = filters[1][1];
            if (rows.get(key) !== expected) return { data: [], error: null };
            rows.set(key, row.value); row = { key, ...row };
          }
          if (failure === 'lost') return { data: null, error: { code: 'PGRST000', message: 'PRIVATE_FAILURE' } };
          return { data: [{ ...row }], error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  } };
}

function setupAnalytics(options = {}) {
  const db = options.db || memoryClaims();
  const state = options.state || { calls: [], reads: 0, clients: 0, logs: [] };
  const h = harness({
    'next/server': { NextRequest, NextResponse },
    '@supabase/supabase-js': { createClient: () => { state.clients++; if (options.clientFailure) throw Error('PRIVATE_FAILURE'); return db; } },
    '@/lib/admin/analyticsSummary': {
      fetchPlatformAnalytics: async () => { state.reads++; return { generatedAt: options.generatedAt?.() || '2026-11-07T18:29:59Z', databaseStatus: 'partial', counts: {} }; },
      generateAnalyticsPdfBuffer: () => Buffer.from('Synthetic PDF; not a real report'),
      generateEmailHtml: () => '<p>Synthetic analytics</p>',
    },
  }, {
    console: { log() {}, warn() {}, error: (...args) => state.logs.push(args) },
    fetch: async (url, init) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.Authorization, 'Bearer synthetic-provider-key');
      state.calls.push({ headers: init.headers, payload: JSON.parse(init.body) });
      return options.provider ? options.provider(url, init) : Response.json({ id: 'synthetic-provider-receipt' }, { status: 201 });
    },
  });
  Object.assign(h.env, { NODE_ENV: 'production', CRON_SECRET: 'synthetic-cron-token', RESEND_API_KEY: 'synthetic-provider-key',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
    RESEND_FROM_EMAIL: 'sender@example.invalid', ADMIN_CONTACT_EMAIL: 'recipient@example.invalid', ...options.env });
  const route = h.load('src/app/api/cron/analytics-summary/route.ts');
  const call = ({ method = 'POST', query = '', token = 'synthetic-cron-token', body } = {}) => route[method === 'GET' ? 'GET' : 'POST'](
    new NextRequest('http://localhost/api/cron/analytics-summary' + query, { method,
      headers: { ...(token == null ? {} : { Authorization: `Bearer ${token}` }),
        ...(body === undefined ? {} : { 'Content-Length': String(Buffer.byteLength(body)) }) }, body }));
  return { ...h, db, state, route, call };
}
module.exports = { memoryClaims, setupAnalytics };
