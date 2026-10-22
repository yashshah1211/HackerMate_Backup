/* eslint-disable @typescript-eslint/no-require-imports -- Offline synthetic route/security regression. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const BASE = '/partners/hustle-carnival/phase-2';
const API = '/api' + BASE;
const ORIGIN = 'http://localhost:4000';
const ACTOR = '00000000-0000-4000-8000-000000000001';
const local = { NODE_ENV: 'test', HUSTLE_PHASE2_ENABLED: 'false', HUSTLE_PHASE2_RELEASE_APPROVED: 'false', HUSTLE_PHASE2_IMPORT_ENABLED: 'true', HUSTLE_PHASE2_IMPORT_RELEASE_APPROVED: 'true', HUSTLE_PHASE2_LOCAL_FIXTURE: 'true', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9999', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-secret' };
const production = { ...local, NODE_ENV: 'production', VERCEL_ENV: 'production', HUSTLE_PHASE2_LOCAL_FIXTURE: 'false', NEXT_PUBLIC_SUPABASE_URL: 'https://rhryjrbebfrrfhtyyzbs.supabase.co' };
const mapping = { 'Judge code': 'team_id', 'Team label': 'team_name', Leader: 'leader_name', Email: 'leader_email', Phone: 'leader_whatsapp', Member: 'optional_second_member_name', 'Member email': 'optional_second_member_email' };
const csv = 'Judge code,Team label,Leader,Email,Phone,Member,Member email\r\n' + Array.from({ length: 42 }, (_, i) => `SYNTH-IM42-${String(i + 1).padStart(3, '0')},Synthetic Solo ${i + 1},Synthetic Leader ${i + 1},leader${i + 1}@example.invalid,,,`).join('\r\n') + '\r\n';

function load(file, env, overrides = {}) {
  const cache = new Map();
  function read(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const loadedModule = { exports: {} }; cache.set(relative, loadedModule);
    const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: name => name in overrides ? overrides[name] : name === 'server-only' ? {} : name.startsWith('@/') ? read('src/' + name.slice(2) + '.ts') : name.startsWith('.') ? read(path.posix.join(path.posix.dirname(relative), name) + '.ts') : require(name), Buffer, URL, URLSearchParams, Response, console, process: { env }, setTimeout, clearTimeout }, { filename: relative });
    return loadedModule.exports;
  }
  return read(file);
}
const core = load('src/lib/hustle-phase2/core.ts', {});
function fixture(identity = 'admin', patch = {}, env = local) {
  const calls = []; const state = { teams: [], batches: [], counts: { shortlisted: 0, pending: 0, confirmed: 0, declined: 0 } };
  function client(key) {
    calls.push({ kind: 'client', key });
    return {
      auth: { getUser: async () => ({ data: { user: identity === 'anonymous' ? null : { id: ACTOR, email: 'synthetic-admin@example.invalid', email_confirmed_at: '2026-01-01', is_anonymous: false } }, error: null }) },
      from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role: ['admin', 'banned', 'revoked'].includes(identity) ? 'admin' : 'user', is_banned: identity === 'banned' }, error: null }) }; },
      async rpc(name, args) {
        calls.push({ kind: 'rpc', key, name, args });
        if (name === 'hustle_phase2_has_active_session') return { data: identity !== 'revoked', error: patch.sessionError || null };
        if (name === 'hustle_phase2_limit') return { data: !patch.rateLimited, error: null };
        if (name === 'hustle_phase2_snapshot') return { data: state, error: null };
        if (name === 'hustle_phase2_import') {
          state.teams = args.p_rows.map((row, i) => ({ ...row, id: String(i), batch_id: 'synthetic-batch', decision: 'pending', invite_status: 'not_created', members: [{ role: 'leader', name: row.leader_name, email: row.leader_email, verified: false }] }));
          state.batches = [{ id: 'synthetic-batch', source_digest: args.p_digest, row_count: args.p_rows.length, activated_at: null }];
          state.counts.shortlisted = state.counts.pending = args.p_rows.length;
          return { data: { batchId: 'synthetic-batch', imported: args.p_rows.length, active: false }, error: null };
        }
        throw Error('Unexpected RPC: ' + name);
      },
    };
  }
  const overrides = { '@supabase/supabase-js': { createClient: (_, key) => client(key) }, '@supabase/ssr': { createServerClient: (_, key) => client(key) } };
  return { server: load('src/lib/hustle-phase2/server.ts', env, overrides), pages: load('src/lib/hustle-phase2/pages.ts', env, overrides), state, calls };
}
function request(action, body, headers = {}, method = 'POST') {
  return new NextRequest(ORIGIN + API + '/' + action, { method, headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}
const mutations = f => f.calls.filter(c => c.name === 'hustle_phase2_import');

test('production import approval is scoped to the canonical host/project and cannot enable participants', () => {
  const server = fixture('admin', {}, production).server;
  assert.equal(server.inactiveImportEnabled('https://www.hackermate.in'), true);
  assert.equal(server.enabled(), false);
  for (const origin of ['https://hackermate.in', 'https://preview.vercel.app', 'https://www.hackermate.in.evil.invalid', 'http://www.hackermate.in', ORIGIN]) assert.equal(server.inactiveImportEnabled(origin), false);
});
test('each import approval defaults OFF; Preview/local-fixture/foreign project and malformed targets deny', () => {
  for (const patch of [
    { HUSTLE_PHASE2_IMPORT_ENABLED: undefined }, { HUSTLE_PHASE2_IMPORT_RELEASE_APPROVED: undefined },
    { HUSTLE_PHASE2_IMPORT_ENABLED: 'false' }, { HUSTLE_PHASE2_IMPORT_RELEASE_APPROVED: 'false' },
    { HUSTLE_PHASE2_ENABLED: 'true' }, { HUSTLE_PHASE2_RELEASE_APPROVED: 'true' },
    { VERCEL_ENV: 'preview' }, { VERCEL_ENV: undefined }, { HUSTLE_PHASE2_LOCAL_FIXTURE: 'true' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://qusshzpkvwzfhdcmsosp.supabase.co' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://rhryjrbebfrrfhtyyzbs.supabase.co.evil.invalid' },
    ...['http://rhryjrbebfrrfhtyyzbs.supabase.co', 'https://x@rhryjrbebfrrfhtyyzbs.supabase.co', 'https://rhryjrbebfrrfhtyyzbs.supabase.co:444', 'https://rhryjrbebfrrfhtyyzbs.supabase.co/path', 'https://rhryjrbebfrrfhtyyzbs.supabase.co?x=1', 'https://rhryjrbebfrrfhtyyzbs.supabase.co#x', 'invalid'].map(NEXT_PUBLIC_SUPABASE_URL => ({ NEXT_PUBLIC_SUPABASE_URL })),
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }, { SUPABASE_SERVICE_ROLE_KEY: ' ' },
  ]) {
    const server = fixture('admin', {}, { ...production, ...patch }).server;
    assert.equal(server.inactiveImportEnabled('https://www.hackermate.in'), false, JSON.stringify(patch));
    assert.equal(server.enabled(), false);
  }
});
test('local import fixture cannot reach a remote database or run in hosted Preview', () => {
  assert.equal(fixture().server.inactiveImportEnabled(ORIGIN), true);
  for (const patch of [{ VERCEL_ENV: 'preview' }, { HUSTLE_PHASE2_LOCAL_FIXTURE: 'false' }, { NEXT_PUBLIC_SUPABASE_URL: production.NEXT_PUBLIC_SUPABASE_URL }]) assert.equal(fixture('admin', {}, { ...local, ...patch }).server.inactiveImportEnabled(ORIGIN), false);
});
test('import-only allowlist denies every other operation before creating any database client', async () => {
  for (const action of ['activate', 'invite', 'revoke', 'session', 'clear-context', 'claim', 'respond', 'unknown']) {
    const f = fixture(); const r = await f.server.handleApi(request(action, {}), action);
    assert.equal(r.status, 503, action); assert.equal(f.calls.length, 0);
  }
  for (const action of ['export', 'import', 'columns']) {
    const f = fixture(); assert.equal((await f.server.handleApi(request(action, undefined, {}, 'GET'), action)).status, 503); assert.equal(f.calls.length, 0);
  }
});
for (const identity of ['anonymous', 'organizer', 'unrelated', 'banned', 'revoked']) test(identity + ' cannot import or read back the shortlist', async () => {
  for (const action of ['columns', 'import', 'organizer']) {
    const f = fixture(identity); const r = await f.server.handleApi(request(action, { csv, mode: 'preview', mapping }, {}, action === 'organizer' ? 'GET' : 'POST'), action);
    assert([401, 403].includes(r.status)); assert(!f.calls.some(c => ['hustle_phase2_import', 'hustle_phase2_snapshot'].includes(c.name)));
  }
});
test('CSRF and cross-site requests fail before authentication, rate limits or body processing', async () => {
  for (const headers of [{ origin: 'https://evil.invalid' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) {
    const f = fixture(); assert.equal((await f.server.handleApi(request('import', { mode: 'commit', csv, mapping }, headers), 'import')).status, 403); assert.equal(f.calls.length, 0);
  }
});
test('42 solo teams follow mapping → dry run → actor-bound receipt → inactive import → readback', async () => {
  const f = fixture(); const columns = await f.server.handleApi(request('columns', { csv }), 'columns');
  assert.equal(columns.status, 200); assert.deepEqual((await columns.json()).headers, Object.keys(mapping));
  const dry = await f.server.handleApi(request('import', { mode: 'preview', csv, mapping }), 'import');
  assert.equal(dry.status, 200); const preview = await dry.json();
  assert.equal(preview.total, 42); assert.equal(preview.issues.length, 0); assert.equal(preview.rows.length, 42); assert(preview.rows.every(r => r.second_member_name === null && r.second_member_email === null));
  assert.equal(preview.digest, core.previewCsv(csv, mapping).digest); assert.equal(mutations(f).length, 0);
  const commit = await f.server.handleApi(request('import', { mode: 'commit', csv, mapping, receipt: preview.receipt }), 'import');
  assert.equal(commit.status, 201); assert.deepEqual(await commit.json(), { batchId: 'synthetic-batch', imported: 42, active: false });
  assert.equal(mutations(f).length, 1); assert.equal(mutations(f)[0].args.p_actor, ACTOR); assert.equal(mutations(f)[0].args.p_digest, preview.digest);
  const read = await f.server.handleApi(request('organizer', undefined, {}, 'GET'), 'organizer'); assert.equal(read.status, 200);
  const state = await read.json(); assert.equal(state.isAdmin, true); assert.equal(state.batches[0].activated_at, null); assert.equal(state.counts.pending, 42); assert.equal(state.counts.confirmed, 0); assert.equal(state.counts.declined, 0);
  assert(!f.calls.some(c => /activate|invite|attest_google|respond/.test(c.name || '')));
});
test('modified file/mapping, expired receipt, wrong actor, missing receipt and client activation fields cannot commit', async () => {
  for (const variant of ['file', 'mapping', 'expired', 'actor', 'missing', 'tampered', 'activate']) {
    const f = fixture(); const p = await (await f.server.handleApi(request('import', { mode: 'preview', csv, mapping }), 'import')).json();
    const body = { mode: 'commit', csv, mapping, receipt: p.receipt };
    if (variant === 'file') body.csv = csv.replace('Synthetic Solo 1,', 'Different Solo 1,');
    if (variant === 'mapping') body.mapping = { ...mapping, 'Team label': 'leader_name', Leader: 'team_name' };
    if (variant === 'expired') body.receipt = core.receipt('synthetic-secret', ACTOR, p.digest, Date.now() - 1);
    if (variant === 'actor') body.receipt = core.receipt('synthetic-secret', 'other-actor', p.digest, Date.now() + 60000);
    if (variant === 'missing') delete body.receipt;
    if (variant === 'tampered') body.receipt += 'x';
    if (variant === 'activate') body.activated_at = '2026-10-23T04:30:00Z';
    assert.equal((await f.server.handleApi(request('import', body), 'import')).status, variant === 'activate' ? 400 : 409, variant); assert.equal(mutations(f).length, 0);
  }
});
test('malformed, duplicate and formula-injection CSVs never yield approval', async () => {
  for (const bad of ['a,b\n"broken', csv.replace('SYNTH-IM42-002', 'SYNTH-IM42-001'), csv.replace('Synthetic Solo 1,', '=WEBSERVICE(1),')]) {
    const f = fixture(); const r = await f.server.handleApi(request('import', { mode: 'preview', csv: bad, mapping }), 'import');
    if (r.status === 200) { const p = await r.json(); assert(p.issues.length); assert.equal(p.receipt, null); } else assert.equal(r.status, 400);
    assert.equal(mutations(f).length, 0);
  }
});
test('admin import page has upload/readback but no activation, invitation, export or tracking controls', async () => {
  const f = fixture(); f.state.batches.push({ id: 'synthetic-batch', source_digest: 'a'.repeat(64), row_count: 42, activated_at: null });
  const response = await f.pages.handlePage(new NextRequest(ORIGIN + BASE + '/organizer'), ['organizer']); assert.equal(response.status, 200);
  const doc = new JSDOM(await response.text()).window.document;
  assert(doc.querySelector('#csv')); assert(doc.querySelector('#preview')); assert(doc.querySelector('#commit'));
  assert.match(doc.body.textContent, /Import-only preparation/); assert.match(doc.body.textContent, /Imported, not activated/);
  assert.equal(doc.querySelectorAll('[data-activate],[data-action],a[href$="/export"],script[src]').length, 0);
  assert.match(response.headers.get('cache-control'), /no-store/); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  for (const identity of ['anonymous', 'organizer', 'banned', 'revoked']) assert([401, 403].includes((await fixture(identity).pages.handlePage(new NextRequest(ORIGIN + BASE + '/organizer'), ['organizer'])).status));
});
test('all participant pages stay unavailable with no database client or Google proof calls', async () => {
  for (const route of [[], ['invite'], ['anything']]) {
    const f = fixture(); const r = await f.pages.handlePage(new NextRequest(ORIGIN + BASE + (route.length ? '/' + route.join('/') : '')), route);
    assert.equal(r.status, 200); assert.match(await r.text(), /Registration is not available yet/); assert.equal(f.calls.length, 0);
  }
});
test('turning off either import flag restores complete HARD-OFF without database access', async () => {
  for (const flag of ['HUSTLE_PHASE2_IMPORT_ENABLED', 'HUSTLE_PHASE2_IMPORT_RELEASE_APPROVED']) {
    const f = fixture('admin', {}, { ...local, [flag]: 'false' }); assert.equal((await f.server.handleApi(request('columns', { csv }), 'columns')).status, 503);
    assert.match(await (await f.pages.handlePage(new NextRequest(ORIGIN + BASE + '/organizer'), ['organizer'])).text(), /Registration is not available yet/); assert.equal(f.calls.length, 0);
  }
});
