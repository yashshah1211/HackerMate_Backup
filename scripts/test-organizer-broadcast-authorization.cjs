/* eslint-disable @typescript-eslint/no-require-imports -- Offline authorization regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');
const { NextRequest, NextResponse } = require('next/server');
const root = path.resolve(__dirname, '..');
const uid = '00000000-0000-4000-8000-000000000001';
const event = '00000000-0000-4000-8000-000000000101';
function harness(options = {}) {
  const state = { service: 0, raw: 0, mutations: 0, rpc: [], filters: [] };
  const user = options.user === null ? null : { id: uid, email: 'fixture@example.invalid', ...options.user };
  const profile = options.profile === null ? null : { role: 'user', is_banned: false, ...options.profile };
  function client(service = false) {
    return {
      auth: { async getUser() { return { data: { user }, error: options.authError || null }; } },
      async rpc(name, args) { state.rpc.push([name, args]); return { data: options.access ?? true, error: options.rpcError || null }; },
      from(table) {
        if (table === 'hackathon_registrations') { assert(service); state.raw++; }
        const result = () => ({ data: table === 'profiles' ? profile : table === 'hackathons' ? (options.noEvent ? null : { id: event, name: 'Fixture', type: options.type || 'native', organizer_id: options.owner || uid }) : table === 'hackathon_stages' ? (options.noStage ? null : { title: 'Fixture stage' }) : table === 'hackathon_announcements' ? { id: 'fixture-announcement' } : table === 'hackathon_registrations' ? [] : null, error: table === 'profiles' ? options.profileError || null : null });
        const builder = {
          select() { return builder; },
          eq(key, value) { state.filters.push([table, key, value]); return builder; },
          insert() { state.mutations++; return builder; },
          update() { state.mutations++; return builder; },
          async maybeSingle() { if (options.profileThrows && table === 'profiles') throw new Error('Fixture lookup error'); return result(); },
          async single() { return result(); },
          then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
        };
        return builder;
      },
    };
  }
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const exports = {}; cache.set(relative, exports);
    const mocks = {
      'next/server': { NextRequest, NextResponse },
      '@supabase/ssr': { createServerClient: () => client() },
      '@supabase/supabase-js': { createClient(url, key) { assert.equal(url, 'http://127.0.0.1:1'); if (key === 'fixture-service') state.service++; return client(key === 'fixture-service'); } },
      '@/lib/admin/emailBudgetGuard': { recordEmailSendSuccess() { throw new Error('No actual email delivery permitted'); } },
    };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      throw new Error(`Unmocked dependency ${name}`);
    }, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' } },
    console: { error() {}, warn() {} }, Date, fetch() { throw new Error('Network/email forbidden'); } }, { filename: relative });
    return exports;
  }
  return { state, handler: load('src/app/api/organizer/broadcast/route.ts').POST };
}
const denied = [
  ['signed out', { user: null }], ['auth lookup error', { authError: { message: 'fixture' } }],
  ['banned native owner', { profile: { is_banned: true } }], ['unknown ban', { profile: { is_banned: null } }],
  ['missing profile', { profile: null }], ['profile lookup error', { profileError: { message: 'fixture' } }],
  ['profile lookup throws', { profileThrows: true }], ['missing verified email', { user: { email: null } }],
  ['wrong event', { access: false }], ['RPC lookup error', { rpcError: { message: 'fixture' } }],
  ['nonboolean access', { access: 'true' }], ['external owner without assignment', { type: 'external', access: false }],
  ['read-only partner assignment', { owner: 'another-user', access: true }],
  ['banned admin', { profile: { role: 'admin', is_banned: true } }],
  ['banned founder', { profile: { is_banned: true }, user: { email: 'yashshah7117@gmail.com' } }],
];
function request(extra = {}) {
  return new NextRequest('http://127.0.0.1/api/organizer/broadcast', { method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify({ hackathonId: event, title: 'Fixture', message: 'Private fixture', ...extra }) });
}
for (const [label, options] of denied) test(`broadcast denies ${label} before elevated reads/mutations`, async () => {
  const h = harness(options); const response = await h.handler(request());
  assert.equal(response.status, 403); assert.equal(h.state.service, 0); assert.equal(h.state.raw, 0); assert.equal(h.state.mutations, 0);
});
for (const [label, options] of [ ['native owner', {}], ['admin', { owner: 'another-user', profile: { role: 'admin' } }], ['verified founder', { owner: 'another-user', user: { email: ' YASHshah7117@GMAIL.COM ' } }] ]) test(`broadcast retains ${label} without email delivery`, async () => {
  const h = harness(options); const response = await h.handler(request());
  assert.equal(response.status, 200); assert.equal(h.state.service, 1); assert.equal(h.state.raw, 1);
  assert.equal(h.state.rpc[0][0], 'can_access_partner_event');
  assert.equal(JSON.stringify(h.state.rpc[0][1]), JSON.stringify({ p_hackathon_id: event }));
  assert(h.state.filters.some(([table, key, value]) => table === 'hackathon_registrations' && key === 'hackathon_id' && value === event));
});
test('broadcast rejects cross-event linked stage before recipient reads', async () => {
  const h = harness({ noStage: true }); const response = await h.handler(request({ linkedStageId: 'wrong-event-stage' }));
  assert.equal(response.status, 400); assert.equal(h.state.raw, 0); assert.equal(h.state.mutations, 0);
  assert(h.state.filters.some(([table, key, value]) => table === 'hackathon_stages' && key === 'hackathon_id' && value === event));
});

function nativePortalHarness({ access = true, error = null, type = 'native', owner = uid } = {}) {
  const effects = [], reads = [], redirects = [], calls = [];
  const client = {
    auth: { async getUser() { return { data: { user: { id: uid } }, error: null }; } },
    async rpc(name, args) { calls.push([name, args]); return { data: access, error }; },
    from(table) {
      reads.push(table);
      const result = () => ({ data: table === 'hackathons' ? { id: event, type, organizer_id: owner } : [], error: null });
      const builder = { select() { return builder; }, eq() { return builder; }, order() { return builder; }, async single() { return result(); }, then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
      return builder;
    },
  };
  const component = () => null;
  const mocks = {
    react: { useState(value) { return [value, () => {}]; }, useEffect(fn) { effects.push(fn); } },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { useParams: () => ({ id: event }), useRouter: () => ({ push(url) { redirects.push(url); } }) },
    'next/link': { default: component },
    'lucide-react': new Proxy({}, { get: () => component }),
    '@/lib/supabase': { supabase: client },
    '@/components/AuthGuard': { default: component },
    '@/context/NotificationContext': { useNotification: () => ({ showToast() {} }) },
    '@/components/system': new Proxy({}, { get: () => component }),
  };
  const exports = {};
  const source = fs.readFileSync(path.join(root, 'src/app/hackathons/[id]/organizer/page.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; throw new Error(`Unmocked portal dependency ${name}`); }, console: { error() {} } });
  exports.default();
  return { reads, redirects, calls, async mount() { effects.forEach(fn => fn()); for (let n = 0; n < 8; n++) await new Promise(resolve => setImmediate(resolve)); } };
}
for (const [label, options] of [ ['banned/revoked identity', { access: false }], ['event predicate lookup error', { error: { message: 'fixture' } }], ['external owner without native authority', { type: 'external' }], ['wrong native owner', { owner: 'other-user' }] ]) test(`existing native portal denies ${label} before private reads`, async () => {
  const h = nativePortalHarness(options); await h.mount();
  assert.deepEqual(h.reads, ['hackathons']); assert.equal(h.redirects.length, 1);
});
test('existing native owner portal retains scoped registration/announcement reads', async () => {
  const h = nativePortalHarness(); await h.mount();
  assert(h.reads.includes('hackathon_registrations')); assert(h.reads.includes('hackathon_announcements')); assert.equal(h.redirects.length, 0);
  assert.equal(h.calls[0][0], 'can_access_partner_event');
  assert.equal(JSON.stringify(h.calls[0][1]), JSON.stringify({ p_hackathon_id: event }));
});
