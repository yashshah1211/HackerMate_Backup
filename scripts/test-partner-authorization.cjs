/* eslint-disable @typescript-eslint/no-require-imports -- Offline authorization harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');

// Real TypeScript helpers, fake credentials and mocked database responses only.
// The actual PostgreSQL membership/RLS predicates have a separate local fixture.
const ROOT = path.resolve(__dirname, '..');
const USER = '00000000-0000-4000-8000-000000000001';
const EVENT = '00000000-0000-4000-8000-000000000002';
const OTHER_EVENT = '00000000-0000-4000-8000-000000000003';
const PARTNER = '00000000-0000-4000-8000-000000000004';
const FOUNDER = 'yashshah7117@gmail.com';

function harness(options = {}) {
  const state = {
    user: { id: USER, email: 'organizer@example.invalid' },
    profile: { role: 'user', is_banned: false },
    partner: { id: PARTNER, hackathon_id: EVENT },
    event: { id: EVENT },
    allowed: true,
    errors: {}, throws: {}, queries: [], rpcs: [], clients: [], authCalls: [],
    ...options,
  };
  state.user = options.user === null ? null : { id: USER, email: 'organizer@example.invalid', ...options.user };
  state.profile = options.profile === null ? null : { role: 'user', is_banned: false, ...options.profile };
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fake-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'fake-service-never-used',
  };
  function client(authenticated) {
    return {
      auth: { async getUser(token) {
        state.authCalls.push(token || 'cookie');
        if (state.throws.auth) throw new Error('private authentication failure');
        return { data: { user: authenticated ? state.user : null }, error: state.errors.auth || null };
      } },
      from(table) {
        const record = { table, columns: null, filters: [] };
        state.queries.push(record);
        const builder = {
          select(columns) { record.columns = columns; return builder; },
          eq(column, value) { record.filters.push([column, value]); return builder; },
          async maybeSingle() {
            if (state.throws[table]) throw new Error(`private ${table} failure`);
            const data = { profiles: state.profile, partner_configs: state.partner, hackathons: state.event }[table];
            return { data, error: state.errors[table] || null };
          },
        };
        return builder;
      },
      async rpc(name, args) {
        state.rpcs.push({ name, args });
        if (state.throws.rpc) throw new Error('private organizer lookup failure');
        return { data: state.allowed, error: state.errors.rpc || null };
      },
    };
  }
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const filename = path.join(ROOT, relative);
    const exports = {};
    cache.set(relative, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports, process: { env },
      console: { error() {} },
      fetch() { throw new Error('Network forbidden in authorization tests'); },
      require(name) {
        if (name === 'next/server') return { NextRequest, NextResponse };
        if (name === '@supabase/supabase-js') return { createClient(url, key, config) {
          assert.equal(url, env.NEXT_PUBLIC_SUPABASE_URL);
          state.clients.push(key);
          const token = config?.global?.headers?.Authorization;
          return client(token === 'Bearer fixture-token');
        } };
        if (name === '@supabase/ssr') return { createServerClient(url, key, config) {
          assert.equal(url, env.NEXT_PUBLIC_SUPABASE_URL);
          state.clients.push(key);
          return client(config.cookies.getAll().some(c => c.name === 'fixture-session' && c.value === 'valid'));
        } };
        if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
        throw new Error(`Unmocked dependency: ${name}`);
      },
    }, { filename });
    return exports;
  }
  return { state, load };
}

function request({ cookie = false, token = 'fixture-token', body } = {}) {
  return new NextRequest('http://127.0.0.1/foundation-test', {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: 'fixture-session=valid' } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function authorize(h, target = { partnerSlug: 'fixture-event' }, req = request()) {
  const result = await h.load('src/lib/partners/requirePartnerAccess.ts').requirePartnerAccess(req, target);
  assert(h.state.clients.every(key => key === 'fake-anon'), 'partner authorization must never create a service-role client');
  for (const query of h.state.queries.filter(q => q.table === 'profiles')) {
    assert.equal(query.columns, 'role, is_banned');
    assert.deepEqual(query.filters, [['id', USER]]);
  }
  return result;
}

for (const [name, options] of [
  ['explicit event organizer', {}],
  ['protected database admin', { profile: { role: 'admin' } }],
  ['exact authenticated founder', { user: { email: FOUNDER } }],
  ['normalized exact founder', { user: { email: ` ${FOUNDER.toUpperCase()} ` } }],
  ['supported native organizer', {}],
]) {
  for (const cookie of [false, true]) {
    test(`allows SQL-authorized ${name} using ${cookie ? 'cookies' : 'bearer'}`, async () => {
      const h = harness(options);
      const result = await authorize(h, { partnerSlug: 'fixture-event' }, request({ cookie, token: cookie ? null : 'fixture-token' }));
      assert(!(result instanceof NextResponse));
      assert.deepEqual(Object.keys(result).sort(), ['hackathonId', 'partnerId', 'supabaseUserClient', 'userId']);
      assert.equal(result.userId, USER);
      assert.equal(result.hackathonId, EVENT);
      assert.equal(result.partnerId, PARTNER);
      assert.equal(h.state.rpcs.length, 1);
      assert.equal(h.state.rpcs[0].name, 'can_access_partner_event');
      assert.equal(h.state.rpcs[0].args.p_hackathon_id, EVENT);
      assert.deepEqual(Object.keys(h.state.rpcs[0].args), ['p_hackathon_id']);
    });
  }
}

const denied = [
  ['unauthenticated', { user: null }, undefined],
  ['normal user', { allowed: false }, undefined],
  ['wrong event organizer', { event: { id: OTHER_EVENT }, allowed: false }, { hackathonId: OTHER_EVENT }],
  ['revoked organizer', { allowed: false }, undefined],
  ['banned organizer', { profile: { is_banned: true } }, undefined],
  ['banned admin', { profile: { role: 'admin', is_banned: true } }, undefined],
  ['banned founder', { user: { email: FOUNDER }, profile: { is_banned: true } }, undefined],
  ['missing profile', { profile: null }, undefined],
  ['unknown ban state', { profile: { is_banned: null } }, undefined],
  ['omitted ban state', { profile: { is_banned: undefined } }, undefined],
  ['profile error with admin payload', { profile: { role: 'admin' }, errors: { profiles: { message: 'private detail' } } }, undefined],
  ['profile lookup exception', { throws: { profiles: true } }, undefined],
  ['failed organizer lookup', { errors: { rpc: { message: 'private detail' } } }, undefined],
  ['organizer lookup exception', { throws: { rpc: true } }, undefined],
  ['missing predicate migration', { errors: { rpc: { code: 'PGRST202' } } }, undefined],
  ['unknown predicate result', { allowed: null }, undefined],
  ['nonboolean predicate result', { allowed: 'true' }, undefined],
  ['authentication error with user payload', { errors: { auth: { message: 'invalid token' } } }, undefined],
  ['missing authenticated email', { user: { email: null } }, undefined],
  ['nonexistent event', { event: null }, undefined],
  ['event lookup error', { errors: { hackathons: { message: 'private detail' } } }, undefined],
  ['event lookup exception', { throws: { hackathons: true } }, undefined],
  ['missing partner', { partner: null }, undefined],
  ['partner lookup error', { errors: { partner_configs: { message: 'private detail' } } }, undefined],
  ['malformed resolved event', { partner: { id: PARTNER, hackathon_id: 'invalid' } }, undefined],
  ['malformed event input', {}, { hackathonId: 'invalid' }],
  ['malformed slug', {}, { partnerSlug: 'event,or.admin.true' }],
  ['oversized slug', {}, { partnerSlug: 'a'.repeat(101) }],
  ['ambiguous event values', {}, { partnerSlug: 'fixture-event', hackathonId: OTHER_EVENT }],
  ['spoofed user ID', {}, { hackathonId: EVENT, userId: 'attacker' }],
  ['spoofed admin flag', {}, { hackathonId: EVENT, isAdmin: true }],
  ['spoofed metadata admin', { user: { user_metadata: { role: 'admin' } }, allowed: false }, undefined],
  ['founder substring', { user: { email: `not${FOUNDER}` }, allowed: false }, undefined],
  ['founder alias', { user: { email: 'yashshah7117+alias@gmail.com' }, allowed: false }, undefined],
  ['college/domain match', { user: { email: 'organizer@event.invalid' }, allowed: false }, undefined],
];

for (const [name, options, target] of denied) {
  test(`denies ${name} without sensitive error detail`, async () => {
    const h = harness(options);
    const result = await authorize(h, target);
    assert(result instanceof NextResponse);
    assert.equal(result.status, 403);
    assert.equal((await result.json()).error, 'Forbidden: Unable to verify event access.');
    if (options.profile === null || options.profile?.is_banned !== undefined || options.errors?.profiles || options.throws?.profiles || options.user === null) {
      assert.equal(h.state.rpcs.length, 0, 'identity/profile failures must precede event RPCs');
    }
  });
}

test('direct native event input still resolves existence and uses the caller RPC', async () => {
  const h = harness();
  const result = await authorize(h, { hackathonId: EVENT });
  assert(!(result instanceof NextResponse));
  assert.equal(result.partnerId, null);
  assert(!h.state.queries.some(q => q.table === 'partner_configs'));
  assert.deepEqual(h.state.queries.find(q => q.table === 'hackathons').filters, [['id', EVENT]]);
});

test('request body cannot replace the verified user or resolved event', async () => {
  const h = harness();
  const result = await authorize(h, { partnerSlug: 'fixture-event' }, request({ body: { userId: 'attacker', hackathonId: OTHER_EVENT, admin: true } }));
  assert(!(result instanceof NextResponse));
  assert.equal(result.userId, USER);
  assert.equal(result.hackathonId, EVENT);
});

test('admin identity alone does not bypass a denied SQL predicate', async () => {
  const h = harness({ profile: { role: 'admin' }, allowed: false });
  assert((await authorize(h)) instanceof NextResponse);
});

test('access is rechecked after revocation rather than cached', async () => {
  const h = harness();
  assert(!((await authorize(h)) instanceof NextResponse));
  h.state.allowed = false;
  assert((await authorize(h)) instanceof NextResponse);
  assert.equal(h.state.rpcs.length, 2);
});

test('profile state changed after HTTP lookup is still denied by SQL', async () => {
  const h = harness({ allowed: false });
  assert((await authorize(h)) instanceof NextResponse);
  assert.equal(h.state.rpcs.length, 1);
});
