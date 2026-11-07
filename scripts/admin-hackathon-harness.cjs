/* eslint-disable @typescript-eslint/no-require-imports -- Actual auth/route modules with synthetic local adapters. */
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const EVENT = '00000000-0000-4000-8000-000000000101';
const ADMIN = '00000000-0000-4000-8000-000000000001';

function setup(options = {}) {
  const state = { clients: 0, queries: [], mutations: [], rpcs: [], logs: [], row: {
    id: EVENT, name: 'Synthetic event', status: 'pending', ai_feedback: { status: 'pending', submitted_at: 'fixture', preserved: { context: 'retained' } },
  } };
  const user = options.signedOut ? null : { id: ADMIN, email: 'admin@example.invalid' };
  function client(service = false) {
    return {
      auth: { getUser: async () => ({ data: { user }, error: null }) },
      from(table) {
        if (service && options.database) return options.database.from(table);
        let payload, operation = 'read'; const filters = [];
        const q = {
          select() { return q; }, eq(key, value) { filters.push([key, value]); return q; },
          update(value) { operation = 'update'; payload = value; state.mutations.push({ table, payload }); return q; },
          delete() { operation = 'delete'; state.mutations.push({ table, operation }); return q; },
          maybeSingle: async () => result(), single: async () => result(),
          then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); },
        };
        function result() {
          if (table === 'profiles') return { data: { role: options.ordinary ? 'user' : 'admin', is_banned: options.banned ?? false }, error: null };
          assert(service, 'Event work requires verified admin/service boundary');
          state.queries.push({ table, operation, filters });
          if (options.queryError) return { data: null, error: { code: '42501', message: 'PRIVATE_RECORD_DETAIL' } };
          if (options.missing || (operation === 'update' && options.zeroUpdate)) return { data: null, error: null };
          if (payload) {
            assert(!Object.hasOwn(payload, 'updated_at'), 'Live hackathons schema has no updated_at');
            Object.assign(state.row, payload);
          }
          return { data: state.row, error: null };
        }
        return q;
      },
      async rpc(name, args) {
        assert(service); state.rpcs.push({ name, args });
        if (options.database) return options.database.rpc(name, args);
        if (options.rpcThrows) throw Error('PRIVATE_RECORD_DETAIL');
        if (options.rpcError) return { data: null, error: options.rpcError };
        return { data: Object.hasOwn(options, 'rpcData') ? options.rpcData : true, error: null };
      },
    };
  }
  const h = harness({
    'next/server': { NextRequest, NextResponse },
    '@supabase/ssr': { createServerClient: () => client() },
    '@supabase/supabase-js': { createClient(url, key) {
      assert.equal(url, 'http://127.0.0.1:1'); const service = key === 'synthetic-service';
      if (service) state.clients++; return client(service);
    } },
  }, { console: { error: (...args) => state.logs.push(args), warn: (...args) => state.logs.push(args) } });
  Object.assign(h.env, { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service' });
  const call = (body = { hackathonId: EVENT, action: 'delete' }, raw) => h.load('src/app/api/admin/hackathons/route.ts').POST(new NextRequest('http://localhost/api/admin/hackathons', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic-session', 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body),
  }));
  return { ...h, state, call };
}
module.exports = { setup, EVENT, ADMIN };
