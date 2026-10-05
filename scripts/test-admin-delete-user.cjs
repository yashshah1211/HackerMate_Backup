/* eslint-disable @typescript-eslint/no-require-imports -- Offline regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');

// Execute the real route and centralized authorization helper. Never import
// real credentials or contact a database; the PostgreSQL fixture is separate.
const ROOT = path.resolve(__dirname, '..');
const CALLER = '00000000-0000-4000-8000-000000000001';
const TARGET = '00000000-0000-4000-8000-000000000002';
const FOUNDER = 'yashshah7117@gmail.com';

function harness(options = {}) {
  const state = {
    user: { id: CALLER, email: 'operator@example.invalid', ...options.user },
    profile: { role: 'admin', is_banned: false, ...options.profile },
    targetUser: { id: TARGET, email: 'target@example.invalid' },
    targetProfile: { id: TARGET, role: 'user' },
    authError: null, lookupError: null, targetAuthError: null,
    targetProfileError: null, rpcError: null, events: [], errors: [],
    ...options,
  };
  state.user = options.user === null ? null : { id: CALLER, email: 'operator@example.invalid', ...options.user };
  state.profile = options.profile === null ? null : { role: 'admin', is_banned: false, ...options.profile };
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fake-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service',
    OUTREACH_ADMIN_EMAIL: 'outreach@example.invalid',
    ...options.env,
  };
  function client(key, cookie = false) {
    return {
      auth: {
        async getUser(token) {
          state.events.push(['authenticate']);
          return { data: { user: token === 'fixture-token' || cookie ? state.user : null }, error: state.authError };
        },
        admin: {
          async getUserById(id) {
            assert.equal(key, 'fake-service');
            state.events.push(['target-auth', id]);
            if (state.targetAuthThrows) throw new Error('private target exception');
            return { data: { user: state.targetUser }, error: state.targetAuthError };
          },
          async deleteUser() { throw new Error('Auth API deletion must not bypass the transaction'); },
        },
      },
      from(table) {
        assert.equal(table, 'profiles');
        const result = () => key === 'fake-service'
          ? { data: state.targetProfile, error: state.targetProfileError }
          : { data: state.profile, error: state.lookupError };
        const query = {
          select(columns) {
            assert.equal(columns, key === 'fake-service' ? 'id, role' : 'role, is_banned');
            return query;
          },
          eq(column, id) {
            assert.equal(column, 'id');
            assert.equal(id, key === 'fake-service' ? state.targetUser?.id || TARGET : CALLER);
            state.events.push([key === 'fake-service' ? 'target-profile' : 'caller-profile']);
            return query;
          },
          async maybeSingle() { return result(); },
          update() { throw new Error('No route-level ownership mutations'); },
          delete() { throw new Error('No route-level deletion'); },
        };
        return query;
      },
      async rpc(name, args) {
        assert.equal(key, 'fake-anon', 'Use the verified caller, not service-role RPC');
        assert.equal(name, 'delete_user_completely');
        assert.deepEqual(JSON.parse(JSON.stringify(args)), { p_target_user_id: TARGET });
        state.events.push(['transaction']);
        if (state.rpcThrows) throw new Error('private transport exception');
        return { data: null, error: state.rpcError };
      },
    };
  }
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const exports = {};
    cache.set(relative, exports);
    const mocks = {
      'next/server': { NextRequest, NextResponse },
      '@supabase/supabase-js': { createClient(url, key) {
        assert.equal(url, env.NEXT_PUBLIC_SUPABASE_URL);
        if (key === 'fake-service') state.events.push(['service-client']);
        return client(key);
      } },
      '@supabase/ssr': { createServerClient(url, key, config) {
        return client(key, config.cookies.getAll().some(c => c.name === 'fixture' && c.value === 'valid'));
      } },
    };
    const filename = path.join(ROOT, relative);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports, process: { env },
      require(name) {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
        throw new Error(`Unmocked dependency: ${name}`);
      },
      console: { error(...args) { state.errors.push(args); }, info(...args) { state.events.push(['log', ...args]); } },
      fetch() { throw new Error('Network forbidden'); },
    }, { filename });
    return exports;
  }
  async function run(body = { userId: TARGET }, requestOptions = {}) {
    const req = new NextRequest('http://127.0.0.1/api/admin/delete-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(requestOptions.cookie ? { Cookie: 'fixture=valid' } : { Authorization: 'Bearer fixture-token' }),
      },
      body: requestOptions.raw ?? JSON.stringify(body),
    });
    const response = await load('src/app/api/admin/delete-user/route.ts').POST(req);
    return { status: response.status, body: await response.json(), state };
  }
  return { run, state };
}

for (const [name, options] of [
  ['unauthenticated', { user: null }],
  ['ordinary user', { profile: { role: 'user' } }],
  ['lowercase admin substring', { user: { email: 'notadmin@example.invalid' }, profile: { role: 'user' } }],
  ['mixed-case admin substring', { user: { email: 'notAdMiN@example.invalid' }, profile: { role: 'user' } }],
  ['admin domain', { user: { email: 'user@admin.example.invalid' }, profile: { role: 'user' } }],
  ['outreach-only', { user: { email: 'outreach@example.invalid' }, profile: { role: 'user' } }],
  ['banned admin', { profile: { is_banned: true } }],
  ['banned founder', { user: { email: FOUNDER }, profile: { role: 'user', is_banned: true } }],
  ['role lookup failure', { lookupError: { message: 'private lookup failure' } }],
  ['missing caller profile', { profile: null }],
  ['near-match founder', { user: { email: 'yashshah7117+admin@gmail.com' }, profile: { role: 'user' } }],
  ['invalid auth despite payload', { authError: { message: 'bad session' } }],
]) {
  test(`deny ${name} before privileged work`, async () => {
    const { status, state } = await harness(options).run();
    assert.equal(status, 403);
    assert(!state.events.some(([event]) => ['service-client', 'target-auth', 'target-profile', 'transaction'].includes(event)));
  });
}

for (const [name, body, raw] of [
  ['missing ID', {}], ['null body', null], ['array body', []],
  ['numeric ID', { userId: 42 }], ['object ID', { userId: {} }],
  ['malformed UUID', { userId: 'not-a-uuid' }],
  ['UUID suffix', { userId: `${TARGET}junk` }],
  ['invalid JSON', {}, '{'],
]) {
  test(`reject ${name}`, async () => {
    const { status, state } = await harness().run(body, { raw });
    assert.equal(status, 400);
    assert(!state.events.some(([event]) => ['target-auth', 'transaction'].includes(event)));
  });
}

test('self-deletion rejected before target reads', async () => {
  const { status, state } = await harness().run({ userId: CALLER.toUpperCase() });
  assert.equal(status, 403);
  assert(!state.events.some(([event]) => ['target-auth', 'transaction'].includes(event)));
});

for (const [name, options, status] of [
  ['missing service key', { env: { SUPABASE_SERVICE_ROLE_KEY: '' } }, 503],
  ['missing auth account', { targetUser: null }, 404],
  ['auth not found', { targetAuthError: { status: 404, message: 'private auth data' } }, 404],
  ['auth lookup failure', { targetAuthError: { status: 500, message: 'private auth data' } }, 500],
  ['auth lookup exception', { targetAuthThrows: true }, 500],
  ['missing target profile', { targetProfile: null }, 404],
  ['profile lookup failure', { targetProfileError: { message: 'private database data' } }, 500],
  ['protected admin', { targetProfile: { id: TARGET, role: 'admin' } }, 403],
  ['protected founder', { targetUser: { id: TARGET, email: FOUNDER } }, 403],
  ['normalized founder', { targetUser: { id: TARGET, email: ` ${FOUNDER.toUpperCase()} ` } }, 403],
]) {
  test(name, async () => {
    const result = await harness(options).run();
    assert.equal(result.status, status);
    assert(!result.state.events.some(([event]) => event === 'transaction'));
    assert(!JSON.stringify(result.body).includes('private'));
  });
}

for (const [name, options, requestOptions] of [
  ['authoritative admin', {}, {}],
  ['cookie admin matches UI', {}, { cookie: true }],
  ['exact founder exception', { user: { email: FOUNDER }, profile: { role: 'user' } }, {}],
  ['near-founder target is ordinary', { targetUser: { id: TARGET, email: 'yashshah7117+other@gmail.com' } }, {}],
]) {
  test(name, async () => {
    const result = await harness(options).run(undefined, requestOptions);
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.state.events.filter(([event]) => event === 'transaction').length, 1);
  });
}

for (const [code, status] of [['42501', 403], ['P0002', 404], ['23503', 409], ['P0001', 409], ['42703', 500], ['XX000', 500]]) {
  test(`transaction failure ${code} is safe`, async () => {
    const result = await harness({ rpcError: { code, message: 'private database detail' } }).run();
    assert.equal(result.status, status);
    assert.equal(result.body.success, false);
    assert(!JSON.stringify(result.body).includes('private'));
    assert(result.state.errors.length > 0);
    assert.equal(result.state.events.filter(([event]) => event === 'transaction').length, 1);
  });
}

test('transport failure does not retry an ambiguous deletion', async () => {
  const result = await harness({ rpcThrows: true }).run();
  assert.equal(result.status, 500);
  assert.match(result.body.error, /confirm|refresh/i);
  assert.equal(result.state.events.filter(([event]) => event === 'transaction').length, 1);
});
