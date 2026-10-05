/* eslint-disable @typescript-eslint/no-require-imports -- Standalone security regression tests. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { test } = require('node:test');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');

// Execute the actual helpers/handlers. All identity, database, PDF and email
// dependencies are local mocks; real environment variables are never imported.
const ROOT = path.resolve(__dirname, '..');
const USER_ID = '00000000-0000-4000-8000-000000000001';
const FOUNDER = 'yashshah7117@gmail.com';
const REPORT = 'src/app/api/cron/database-activity-report/route.ts';
const CHALLENGES = 'src/app/api/admin/challenges/route.ts';
const CHALLENGE = 'src/app/api/admin/challenges/[id]/route.ts';
const CONTEXT = { params: Promise.resolve({ id: 'throwaway-challenge' }) };

function harness(options = {}) {
  const state = {
    user: { id: USER_ID, email: 'ordinary@example.com', ...options.user },
    profile: { role: 'user', is_banned: false, ...options.profile },
    authError: null,
    lookupError: null,
    lookupThrows: false,
    events: [],
    errors: [],
    ...options,
  };
  // Preserve merged defaults when callers override only some identity fields.
  state.user = options.user === null ? null : { id: USER_ID, email: 'ordinary@example.com', ...options.user };
  state.profile = options.profile === null ? null : { role: 'user', is_banned: false, ...options.profile };
  const env = {
    NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fake-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service',
    CRON_SECRET: 'fixture-cron-secret',
    ...options.env,
  };
  function query(table) {
    const result = () => ({ data: table === 'profiles' ? state.profile : [], error: table === 'profiles' ? state.lookupError : null });
    const builder = {
      select(columns) { state.events.push(['select', table, columns]); return builder; },
      eq(column, value) { if (table === 'profiles') assert.deepEqual([column, value], ['id', USER_ID]); return builder; },
      order() { return builder; },
      limit() { return builder; },
      insert() { state.events.push(['mutation', table]); return builder; },
      update() { state.events.push(['mutation', table]); return builder; },
      delete() { state.events.push(['mutation', table]); return builder; },
      async maybeSingle() { if (state.lookupThrows) throw new Error('fixture lookup exception'); return result(); },
      async single() { return { data: { id: 'throwaway-challenge' }, error: null }; },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return builder;
  }
  function client(cookieSession = false) {
    return {
      auth: { async getUser(token) {
        state.events.push(['authenticate']);
        return { data: { user: token === 'fixture-session' || cookieSession ? state.user : null }, error: state.authError };
      } },
      from(table) { state.events.push(['table', table]); return query(table); },
      async rpc(name) { state.events.push(['maintenance', name]); return { data: null, error: null }; },
    };
  }
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const filename = path.join(ROOT, relative);
    const exports = {};
    cache.set(relative, exports);
    const mocks = {
      'next/server': { NextRequest, NextResponse },
      'next/headers': { cookies: async () => ({ getAll: () => [{ name: 'fixture-session', value: 'valid' }], set() {} }) },
      '@supabase/supabase-js': { createClient(url, key) {
        assert.equal(url, env.NEXT_PUBLIC_SUPABASE_URL);
        assert(['fake-anon', 'fake-service'].includes(key));
        if (key === 'fake-service') state.events.push(['service-client']);
        return client();
      } },
      '@supabase/ssr': { createServerClient(url, key, config) {
        assert.equal(url, env.NEXT_PUBLIC_SUPABASE_URL);
        assert.equal(key, 'fake-anon');
        return client(config.cookies.getAll().some(cookie => cookie.name === 'fixture-session' && cookie.value === 'valid'));
      } },
      '@/lib/admin/databaseActivityReport': {
        async fetchDatabaseActivity() {
          state.events.push(['report-read']);
          return {
            summary: { totalNewItems: 0, newBuilders: 0, newTeams: 0, newMembers: 0, newInvites: 0, newRequests: 0 },
            timeWindow: { until: 'fixture-time' }, team_hackathons: [], messages_count_24h: 0,
          };
        },
        generateDatabaseActivityPdf() { state.events.push(['pdf']); return Buffer.from('%PDF-FAKE fake-private-email@example.invalid'); },
      },
    };
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports,
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name === 'node:crypto' || name === 'crypto') return require(name);
        if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
        throw new Error(`Unmocked dependency: ${name}`);
      },
      process: { env }, URL, Date, Buffer, Uint8Array,
      fetch() { throw new Error('Network access is forbidden in security tests'); },
      console: { log() {}, info() {}, warn() {}, error(...args) { state.errors.push(args); } },
    }, { filename });
    return exports;
  }
  return { state, env, load };
}

function request(route, { method = 'GET', token = 'fixture-session', cookie = false, query = '', body } = {}) {
  return new NextRequest(`http://127.0.0.1/${route}${query}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: 'fixture-session=valid' } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function assertNoPrivilegedWork(state) {
  assert(!state.events.some(([event]) => ['service-client', 'maintenance', 'report-read', 'pdf', 'mutation'].includes(event)), JSON.stringify(state.events));
}

const denied = [
  ['ordinary user', {}],
  ['lowercase substring', { user: { email: 'normaladminuser@example.com' } }],
  ['mixed-case substring', { user: { email: 'normalAdMiNuser@example.com' } }],
  ['uppercase substring', { user: { email: 'ADMINuser@example.com' } }],
  ['domain substring', { user: { email: 'person@admin-example.com' } }],
  ['unauthenticated', { user: null }],
  ['banned database admin', { profile: { role: 'admin', is_banned: true } }],
  ['role lookup error', { profile: { role: 'admin' }, lookupError: { message: 'fixture database failure' } }],
  ['role lookup exception', { lookupThrows: true }],
  ['missing profile', { profile: null }],
  ['near-match founder suffix', { user: { email: `${FOUNDER}.attacker.example` } }],
  ['near-match founder prefix', { user: { email: `not${FOUNDER}` } }],
  ['founder plus alias', { user: { email: 'yashshah7117+alias@gmail.com' } }],
  ['banned founder', { user: { email: FOUNDER }, profile: { is_banned: true } }],
  ['founder lookup failure', { user: { email: FOUNDER }, lookupError: { message: 'fixture failure' } }],
  ['untrusted metadata admin', { user: { user_metadata: { role: 'admin' }, app_metadata: { role: 'admin' } } }],
  ['authentication error with user payload', { profile: { role: 'admin' }, authError: { message: 'invalid session' } }],
];

for (const [name, options] of denied) {
  test(`central helper denies ${name} before service-role access`, async () => {
    const h = harness(options);
    const result = await h.load('src/lib/admin/requireAdmin.ts').requireAdmin(request('api/admin'));
    assert(result instanceof NextResponse);
    assert.equal(result.status, 403);
    assertNoPrivilegedWork(h.state);
    if (options.lookupError || options.lookupThrows) assert(h.state.errors.length > 0, 'lookup errors must be logged');
  });
}

for (const [name, options] of [
  ['database admin', { profile: { role: 'admin' } }],
  ['exact authenticated founder', { user: { email: FOUNDER } }],
  ['case-normalized exact founder', { user: { email: FOUNDER.toUpperCase() } }],
]) {
  for (const cookie of [false, true]) {
    test(`central helper allows ${name} using ${cookie ? 'cookies' : 'bearer'}`, async () => {
      const h = harness(options);
      const result = await h.load('src/lib/admin/requireAdmin.ts').requireAdmin(request('api/admin', { cookie, token: cookie ? null : 'fixture-session' }));
      assert(!(result instanceof NextResponse));
      assert.equal(result.user.id, USER_ID);
      const lookup = h.state.events.findIndex(([event, table]) => event === 'select' && table === 'profiles');
      const privileged = h.state.events.findIndex(([event]) => event === 'service-client');
      assert(lookup >= 0 && privileged > lookup, 'authorize before creating a privileged client');
    });
  }
}

for (const method of ['GET', 'POST']) {
  for (const [name, options] of denied) {
    test(`report ${method} denies interactive PDF for ${name}`, async () => {
      const h = harness(options);
      const result = await h.load(REPORT)[method](request('api/cron/database-activity-report', { method, query: '?format=pdf' }));
      assert([401, 403].includes(result.status));
      assert(!(await result.text()).includes('fake-private-email'));
      assertNoPrivilegedWork(h.state);
    });
  }
  test(`report ${method} allows human database admin PDF`, async () => {
    const h = harness({ profile: { role: 'admin' } });
    const result = await h.load(REPORT)[method](request('api/cron/database-activity-report', { method, query: '?format=pdf' }));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('content-type'), 'application/pdf');
    assert((await result.text()).includes('%PDF-FAKE'));
    const lookup = h.state.events.findIndex(([event, table]) => event === 'select' && table === 'profiles');
    const maintenance = h.state.events.findIndex(([event]) => event === 'maintenance');
    assert(maintenance > lookup);
  });
}

test('valid header permits scheduled reporting without a human session', async () => {
  const h = harness({ user: null });
  const result = await h.load(REPORT).GET(request('api/cron/database-activity-report', { token: 'fixture-cron-secret' }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).mode, 'mock_logged');
  assert(h.state.events.some(([event]) => event === 'report-read'));
  assert(!h.state.events.some(([event]) => event === 'authenticate'));
});

for (const [name, req, options] of [
  ['missing header', { token: null }, {}],
  ['wrong same-length header', { token: 'fixture-cron-secreX' }, {}],
  ['wrong longer header', { token: 'fixture-cron-secret-extra' }, {}],
  ['query secret', { token: null, query: '?secret=fixture-cron-secret' }, {}],
  ['missing configured secret', { token: 'fixture-cron-secret' }, { env: { CRON_SECRET: undefined } }],
  ['empty configured secret', { token: null }, { env: { CRON_SECRET: '' } }],
  ['development without credentials', { token: null }, { env: { NODE_ENV: 'development' } }],
  ['cron credential used for PDF', { token: 'fixture-cron-secret', query: '?format=pdf' }, {}],
]) {
  test(`report rejects ${name} before privileged work`, async () => {
    const h = harness({ ...options, user: null });
    const result = await h.load(REPORT).GET(request('api/cron/database-activity-report', req));
    assert([401, 403].includes(result.status));
    assertNoPrivilegedWork(h.state);
  });
}

test('cron secret does not grant general admin or challenge access', async () => {
  const h = harness({ user: null });
  const result = await h.load(CHALLENGES).GET(request('api/admin/challenges', { token: 'fixture-cron-secret' }));
  assert.equal(result.status, 403);
  assertNoPrivilegedWork(h.state);
});

for (const [file, method] of [[CHALLENGES, 'GET'], [CHALLENGES, 'POST'], [CHALLENGE, 'PATCH'], [CHALLENGE, 'DELETE']]) {
  for (const [name, options] of denied) {
    test(`challenge ${method} inherits denial for ${name}`, async () => {
      const h = harness(options);
      const result = await h.load(file)[method](request('api/admin/challenges', { method, body: method === 'GET' ? undefined : {} }), CONTEXT);
      assert.equal(result.status, 403);
      assertNoPrivilegedWork(h.state);
    });
  }
  test(`challenge ${method} permits authoritative admin`, async () => {
    const h = harness({ profile: { role: 'admin' } });
    const result = await h.load(file)[method](request('api/admin/challenges', { method, body: method === 'POST' ? { title: 'Throwaway challenge', problem_statement: 'Local fixture', challenge_number: 1 } : method === 'PATCH' ? { title: 'Local fixture' } : undefined }), CONTEXT);
    assert.equal(result.status, 200);
  });
}

test('local HTTP runtime blocks unauthorized PDF and permits approved admin PDF', async () => {
  const h = harness();
  const handler = h.load(REPORT).GET;
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const result = await handler(new NextRequest(`http://127.0.0.1${incoming.url}`, { headers: incoming.headers }));
      outgoing.writeHead(result.status, Object.fromEntries(result.headers));
      outgoing.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) { outgoing.writeHead(500); outgoing.end(String(error)); }
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/cron/database-activity-report?format=pdf`;
    const deniedResponse = await fetch(url, { headers: { Authorization: 'Bearer fixture-session' } });
    assert([401, 403].includes(deniedResponse.status));
    assertNoPrivilegedWork(h.state);
    h.state.profile.role = 'admin';
    const allowedResponse = await fetch(url, { headers: { Authorization: 'Bearer fixture-session' } });
    assert.equal(allowedResponse.status, 200);
    assert.equal(allowedResponse.headers.get('content-type'), 'application/pdf');
    assert((await allowedResponse.text()).includes('%PDF-FAKE'));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
