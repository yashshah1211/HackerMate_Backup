/* eslint-disable @typescript-eslint/no-require-imports -- Offline approval regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const { NextRequest, NextResponse } = require('next/server');
const root = path.resolve(__dirname, '..');
const event = '00000000-0000-4000-8000-000000000101';
const admin = '00000000-0000-4000-8000-000000000001';

function harness(options = {}) {
  const state = { serviceClients: 0, updates: [], eventReads: 0,
    row: { id: event, status: 'pending', ai_feedback: { status: 'pending', submitted_at: 'fixture', preserved: 'review context' } } };
  const user = options.signedOut ? null : { id: admin, email: 'qa@example.invalid' };
  function client(service = false) {
    return {
      auth: { async getUser() { return { data: { user }, error: null }; } },
      from(table) {
        assert(['profiles', 'hackathons'].includes(table));
        let payload = null;
        const filters = [];
        const query = {
          select() { return query; },
          eq(key, value) { filters.push([key, value]); return query; },
          update(value) { assert(service); payload = value; state.updates.push({ payload, filters }); return query; },
          async maybeSingle() { return response(); },
          async single() { return response(); },
        };
        function response() {
          if (table === 'profiles') return { data: { role: options.ordinary ? 'user' : 'admin', is_banned: options.banned ?? false }, error: null };
          assert(service);
          assert.equal(JSON.stringify(filters), JSON.stringify([['id', event]]));
          if (!payload) { state.eventReads++; return { data: options.missing ? null : state.row, error: null }; }
          // Exact production schema: hackathons has no updated_at column.
          if (Object.hasOwn(payload, 'updated_at')) return { data: null, error: { code: 'PGRST204', message: 'Unknown updated_at column' } };
          if (options.updateError) return { data: null, error: { code: '42501', message: 'Fixture write denied' } };
          Object.assign(state.row, payload);
          return { data: state.row, error: null };
        }
        return query;
      },
    };
  }
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const exports = {}; cache.set(relative, exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { exports, Date, console: { error() {} },
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' } },
      fetch() { throw new Error('Production/network access forbidden'); },
      require(name) {
        if (name === 'next/server') return { NextRequest, NextResponse };
        if (name === '@supabase/ssr') return { createServerClient: () => client() };
        if (name === '@supabase/supabase-js') return { createClient(url, key) {
          assert.equal(url, 'http://127.0.0.1:1');
          const service = key === 'fixture-service';
          if (service) state.serviceClients++;
          return client(service);
        } };
        if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
        throw new Error(`Unmocked dependency: ${name}`);
      },
    }, { filename: relative });
    return exports;
  }
  return { state, handler: load('src/app/api/admin/hackathons/route.ts').POST };
}
function request(action = 'approve', id = event) {
  return new NextRequest('http://127.0.0.1/api/admin/hackathons', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hackathonId: id, action }),
  });
}

for (const action of ['approve', 'reject']) test(`${action} persists status and review metadata in one schema-compatible update`, async () => {
  const h = harness();
  const response = await h.handler(request(action));
  assert.equal(response.status, 200);
  const body = await response.json();
  const expected = action === 'approve' ? 'approved' : 'rejected';
  assert.equal(body.success, true);
  assert.equal(body.hackathon.status, expected);
  assert.equal(body.hackathon.ai_feedback.status, expected);
  assert.equal(body.hackathon.ai_feedback.preserved, 'review context');
  assert.equal(body.hackathon.ai_feedback.submitted_at, 'fixture');
  assert.equal(body.hackathon.ai_feedback.reviewed_by, admin);
  assert(Number.isFinite(Date.parse(body.hackathon.ai_feedback.reviewed_at)));
  assert.equal(h.state.updates.length, 1);
  assert.equal(JSON.stringify(Object.keys(h.state.updates[0].payload).sort()), JSON.stringify(['ai_feedback', 'status']));
});

test('database failure returns an error without partial approval or success', async () => {
  const h = harness({ updateError: true });
  const response = await h.handler(request());
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, 'Failed to update hackathon status.');
  assert.equal(h.state.row.status, 'pending');
  assert.equal(h.state.row.ai_feedback.status, 'pending');
  assert.equal(h.state.updates.length, 1);
});
for (const [label, options] of [['signed out', { signedOut: true }], ['ordinary user', { ordinary: true }], ['banned admin', { banned: true }]]) {
  test(`approval denies ${label} before service client or event access`, async () => {
    const h = harness(options);
    assert.equal((await h.handler(request())).status, 403);
    assert.equal(h.state.serviceClients, 0);
    assert.equal(h.state.eventReads, 0);
    assert.equal(h.state.updates.length, 0);
  });
}
test('missing event does not perform an update', async () => {
  const h = harness({ missing: true });
  assert.equal((await h.handler(request())).status, 404);
  assert.equal(h.state.updates.length, 0);
});
test('missing input does not access event data', async () => {
  const h = harness();
  assert.equal((await h.handler(request('approve', null))).status, 400);
  assert.equal(h.state.eventReads, 0);
  assert.equal(h.state.updates.length, 0);
});
