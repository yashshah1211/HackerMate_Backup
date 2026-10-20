/* eslint-disable @typescript-eslint/no-require-imports -- Offline release-gate security regressions. */
// No Supabase connections, migrations or integration-test fixtures. Every SDK
// factory is replaced; the browser server binds loopback and forbids egress.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const BASE = '/partners/hustle-carnival/phase-2';
const API = '/api/partners/hustle-carnival/phase-2';
const EVENT = '0da43cba-90dc-449c-a126-a2fc8be8a379';
const TEAM = '00000000-0000-4000-8000-000000000011';
const ORIGIN = 'https://synthetic.example.invalid';
// Public hostname only; SDK factories are mocked and network access is forbidden.
const production = {
  NODE_ENV: 'production', VERCEL_ENV: 'production',
  HUSTLE_PHASE2_ENABLED: 'true', HUSTLE_PHASE2_RELEASE_APPROVED: 'true',
  NEXT_PUBLIC_SUPABASE_URL: 'https://rhryjrbebfrrfhtyyzbs.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
};
const local = { ...production, NODE_ENV: 'test', VERCEL_ENV: undefined, HUSTLE_PHASE2_LOCAL_FIXTURE: 'true', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9999' };
const mutations = ['columns', 'import', 'activate', 'invite', 'revoke'];
const actions = [...mutations, 'session', 'respond', 'claim', 'clear-context', 'organizer', 'export', 'unknown'];
const compiled = new Map();
function harness(env = {}, identity = 'none') {
  env = { ...env };
  const calls = [], logs = [], cache = new Map(), validHashes = new Set();
  const snapshot = { teams: [], batches: [], counts: { shortlisted: 0, confirmed: 0, declined: 0, pending: 0 } };
  function client(key) {
    calls.push({ kind: 'client', key });
    return {
      auth: { async getUser() {
        calls.push({ kind: 'auth' });
        return { data: { user: identity === 'none' ? null : { id: TEAM, email: 'synthetic@example.invalid', is_anonymous: false, email_confirmed_at: '2026-01-01T00:00:00Z' } }, error: null };
      } },
      from(table) {
        calls.push({ kind: 'query', table });
        const q = { select() { return q; }, eq() { return q; }, async maybeSingle() {
          return { data: table === 'profiles' ? { role: identity === 'admin' ? 'admin' : 'user', is_banned: identity === 'banned', onboarding_completed: true } : { id: EVENT }, error: null };
        } };
        return q;
      },
      async rpc(name, args) {
        calls.push({ kind: 'rpc', name, args, key });
        if (name === 'can_access_partner_event') {
          assert.equal(args.p_hackathon_id, EVENT);
          return { data: ['admin', 'organizer'].includes(identity), error: null };
        }
        if (name === 'has_partner_admin_access') return { data: identity === 'admin', error: null };
        if (name === 'hustle_phase2_has_active_session') return { data: true, error: null };
        if (name === 'hustle_phase2_snapshot') return { data: snapshot, error: null };
        if (name === 'hustle_phase2_participant' || name === 'hustle_phase2_claim') return { data: { team_name: 'Synthetic team', leader_name: 'Synthetic leader', role: 'leader', own_verified: true, fully_onboarded: true, members_verified: 1, members_required: 1, can_respond: true, decision: 'pending', window: 'open' }, error: null };
        if (name === 'hustle_phase2_inspect') return { data: validHashes.has(args.p_hash) ? { team_name: 'Synthetic team', leader_name: 'Synthetic leader', second_member_name: null, decision: 'pending', window: 'open' } : null, error: null };
        if (name === 'hustle_phase2_respond') return { data: validHashes.has(args.p_hash) ? { status: 'ok', decision: args.p_decision } : { status: 'invalid' }, error: null };
        assert(['hustle_phase2_limit', 'hustle_phase2_invite', 'hustle_phase2_revoke', 'hustle_phase2_activate', 'hustle_phase2_import'].includes(name), 'Unexpected RPC');
        return { data: true, error: null };
      },
    };
  }
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const mod = { exports: {} }; cache.set(relative, mod);
    if (!compiled.has(relative)) compiled.set(relative, ts.transpileModule(fs.readFileSync(path.join(ROOT, relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
    vm.runInNewContext(compiled.get(relative), {
      module: mod, exports: mod.exports, process: { env }, Buffer, URL, URLSearchParams, Response, setTimeout, clearTimeout,
      console: { error: (...args) => logs.push(args) },
      fetch() { throw Error('Network forbidden'); },
      require(name) {
        if (name === 'server-only') return {};
        if (name === 'next/server') return { NextRequest, NextResponse };
        if (name === '@supabase/supabase-js') return { createClient: (_url, key) => client(key) };
        if (name === '@supabase/ssr') return { createServerClient: (_url, key) => client(key) };
        if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
        if (name.startsWith('.')) return load(path.posix.join(path.posix.dirname(relative), name) + '.ts');
        if (name === 'node:crypto') return require(name);
        throw Error('Unmocked dependency: ' + name);
      },
    }, { filename: relative });
    return mod.exports;
  }
  return { env, calls, logs, load, validHashes, server: load('src/lib/hustle-phase2/server.ts'), pages: load('src/lib/hustle-phase2/pages.ts') };
}
function request(action, method = 'POST', data = {}, headers = {}) {
  return new NextRequest(ORIGIN + API + '/' + action, {
    method, headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify(data) } : {}),
  });
}
function privateResponse(response) {
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
}
async function allDisabled(h) {
  const before = h.calls.length;
  for (const action of actions) for (const method of ['GET', 'POST']) {
    const r = await h.server.handleApi(request(action, method), action);
    assert.equal(r.status, 503, action + '/' + method); privateResponse(r);
    assert.deepEqual(await r.json(), { error: 'Round 2 registration is not available yet.' });
  }
  for (const suffix of [[], ['invite'], ['organizer'], ['unknown']]) {
    const r = await h.pages.handlePage(new NextRequest(ORIGIN + BASE + '/' + suffix.join('/')), suffix);
    assert.equal(r.status, 200); privateResponse(r);
    const html = await r.text(); assert.match(html, /Registration is not available yet/);
    assert(!html.includes('<script')); assert(!html.includes('synthetic@example.invalid'));
  }
  assert.equal(h.calls.length, before, 'Disabled requests must not create SDK clients or call auth, queries or RPCs');
}

for (const [label, changes] of [
  ['all configuration absent', null],
  ['enablement unset', { HUSTLE_PHASE2_ENABLED: undefined }],
  ['enablement false, approval true', { HUSTLE_PHASE2_ENABLED: 'false' }],
  ['approval unset, enablement true', { HUSTLE_PHASE2_RELEASE_APPROVED: undefined }],
  ['approval false, enablement true', { HUSTLE_PHASE2_RELEASE_APPROVED: 'false' }],
  ['both switches false', { HUSTLE_PHASE2_ENABLED: 'false', HUSTLE_PHASE2_RELEASE_APPROVED: 'false' }],
]) test(label + ': all pages and API actions are private and make zero SDK calls', async () => {
  await allDisabled(harness(changes === null ? {} : { ...production, ...changes }, 'admin'));
});

test('approval/configuration must match exact production requirements', () => {
  assert.equal(harness(production).server.enabled(), false);
  for (const changes of [
    { HUSTLE_PHASE2_ENABLED: 'TRUE' }, { HUSTLE_PHASE2_RELEASE_APPROVED: ' true ' },
    { NODE_ENV: 'test' }, { NODE_ENV: undefined }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }, { VERCEL_ENV: undefined },
    { HUSTLE_PHASE2_LOCAL_FIXTURE: 'true' }, { NEXT_PUBLIC_SUPABASE_URL: undefined },
    { NEXT_PUBLIC_SUPABASE_ANON_KEY: ' ' }, { SUPABASE_SERVICE_ROLE_KEY: '' },
    ...['not a URL', 'http://rhryjrbebfrrfhtyyzbs.supabase.co', 'https://localhost', 'http://127.0.0.1:9999',
      'https://rhryjrbebfrrfhtyyzbs.supabase.co.evil.invalid', 'https://rhryjrbebfrrfhtyyzbs.supabase.co:8443',
      'https://user:password@rhryjrbebfrrfhtyyzbs.supabase.co', 'https://rhryjrbebfrrfhtyyzbs.supabase.co/rest/v1',
      'https://rhryjrbebfrrfhtyyzbs.supabase.co/?token=bad', 'https://rhryjrbebfrrfhtyyzbs.supabase.co/#bad']
      .map(NEXT_PUBLIC_SUPABASE_URL => ({ NEXT_PUBLIC_SUPABASE_URL })),
  ]) assert.equal(harness({ ...production, ...changes }).server.enabled(), false, JSON.stringify(changes));
});

test('another valid Supabase project is disabled before any SDK access', async () => {
  const h = harness({ ...production, NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }, 'admin');
  assert.equal(h.server.enabled(), false);
  await allDisabled(h);
});

test('local bypass requires explicit test/development, loopback and no hosted deployment', () => {
  const local = { NODE_ENV: 'test', HUSTLE_PHASE2_ENABLED: 'true', HUSTLE_PHASE2_LOCAL_FIXTURE: 'true', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9999' };
  for (const NODE_ENV of ['test', 'development']) assert.equal(harness({ ...local, NODE_ENV }).server.enabled(), true);
  for (const changes of [{ NODE_ENV: 'production' }, { NODE_ENV: undefined }, { NODE_ENV: 'staging' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'production' }, { HUSTLE_PHASE2_LOCAL_FIXTURE: 'false' }, { NEXT_PUBLIC_SUPABASE_URL: production.NEXT_PUBLIC_SUPABASE_URL }])
    assert.equal(harness({ ...local, ...changes }).server.enabled(), false);
});

test('hosted Preview cannot opt into enabled mode even with both approvals and fixture flags', async () => {
  await allDisabled(harness({ ...production, VERCEL_ENV: 'preview', HUSTLE_PHASE2_LOCAL_FIXTURE: 'true' }));
});

test('enabled local gate does not authorize anonymous, unrelated, cross-event or banned identities', async () => {
  for (const identity of ['none', 'unrelated', 'foreign-event', 'banned']) {
    const h = harness(local, identity);
    for (const action of ['organizer', 'export', ...mutations]) {
      const r = await h.server.handleApi(request(action, mutations.includes(action) ? 'POST' : 'GET', { actorId: TEAM, isAdmin: true }), action);
      assert.equal(r.status, identity === 'none' ? 401 : 403); privateResponse(r);
      assert(!(await r.text()).includes('leader_email'));
    }
    const r = await h.pages.handlePage(new NextRequest(ORIGIN + BASE + '/organizer'), ['organizer']);
    assert.equal(r.status, identity === 'none' ? 401 : 403); privateResponse(r);
    assert(!h.calls.some(c => c.key === production.SUPABASE_SERVICE_ROLE_KEY));
    assert(!h.calls.some(c => c.name?.startsWith('hustle_phase2_')));
  }
});

test('authorized organizer can view/export but cannot invoke admin mutations', async () => {
  const h = harness(local, 'organizer');
  for (const action of ['organizer', 'export']) {
    const r = await h.server.handleApi(request(action, 'GET'), action); assert.equal(r.status, 200); privateResponse(r);
  }
  assert.equal((await h.pages.handlePage(new NextRequest(ORIGIN + BASE + '/organizer'), ['organizer'])).status, 200);
  for (const action of mutations) assert.equal((await h.server.handleApi(request(action, 'POST'), action)).status, 403);
  assert(!h.calls.some(c => c.key === production.SUPABASE_SERVICE_ROLE_KEY));
});

test('enabled admin operations preserve receipt, CSRF and token secrecy boundaries', async () => {
  const h = harness(local, 'admin');
  for (const action of actions) {
    const before = h.calls.length;
    const r = await h.server.handleApi(request(action, 'POST', {}, { origin: 'https://evil.example.invalid' }), action);
    assert.equal(r.status, 403); privateResponse(r); assert.equal(h.calls.length, before);
  }
  assert.equal((await h.server.handleApi(request('activate', 'POST', { batchId: TEAM, digest: 'a'.repeat(64) }), 'activate')).status, 400);
  assert(!h.calls.some(c => c.name === 'hustle_phase2_activate'));
  const core = h.load('src/lib/hustle-phase2/core.ts');
  const mapping = Object.fromEntries(core.FIELDS.map(field => [field, field]));
  const csv = core.FIELDS.join(',') + '\nSYNTH-1,Synthetic,Synthetic Leader,synthetic@example.invalid,,\n';
  assert.equal((await h.server.handleApi(request('import', 'POST', { mode: 'commit', csv, mapping, receipt: 'forged' }), 'import')).status, 409);
  assert(!h.calls.some(c => c.name === 'hustle_phase2_import'));
  const r = await h.server.handleApi(request('invite', 'POST', { teamId: TEAM }), 'invite');
  assert.equal(r.status, 201); privateResponse(r);
  const url = new URL((await r.json()).url), token = url.hash.slice(1);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/); assert.equal(url.pathname, BASE + '/invite'); assert.equal(url.search, '');
  assert.equal(h.calls.find(c => c.name === 'hustle_phase2_invite').args.p_hash, core.tokenHash(token));
  assert(!JSON.stringify([h.calls, h.logs]).includes(token));
});

test('guest exchange stages only signed context and does not authorize participant reads or responses', async () => {
  const h = harness(local), core = h.load('src/lib/hustle-phase2/core.ts');
  const token = core.newToken().token; h.validHashes.add(core.tokenHash(token));
  const noToken = await h.pages.handlePage(new NextRequest(ORIGIN + BASE));
  assert.equal(noToken.status, 401); assert(!((await noToken.text()).includes('Synthetic team')));
  const invalid = await h.server.handleApi(new NextRequest(ORIGIN + API + '/session', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' }, body: 'token=invalid' }), 'session');
  assert.equal(invalid.status, 404); privateResponse(invalid);
  const session = await h.server.handleApi(new NextRequest(ORIGIN + API + '/session', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }), 'session');
  assert.equal(session.status, 200); privateResponse(session);
  const cookie = session.headers.get('set-cookie');
  for (const expected of ['HttpOnly', 'Secure', 'SameSite=lax', 'Path=/']) assert(cookie.includes(expected));
  assert.equal(session.headers.get('location'), null);
  const r = await h.server.handleApi(request('respond', 'POST', { decision: 'confirmed' }, { cookie: 'hm_hustle_p2=' + token }), 'respond');
  assert.equal(r.status, 401); privateResponse(r);
  assert(!cookie.includes(token)); assert(!h.calls.some(c=>c.name==='hustle_phase2_respond'));
  assert(!JSON.stringify([h.calls, h.logs]).includes(token));
});

for (const flag of ['HUSTLE_PHASE2_ENABLED'])
  test('emergency removal of ' + flag + ' is observed by the same loaded handlers', async () => {
    const h = harness(local, 'admin');
    assert.equal((await h.server.handleApi(request('organizer', 'GET'), 'organizer')).status, 200);
    h.env[flag] = 'false'; await allDisabled(h);
    // Old cookies or already-rendered forms cannot bypass a subsequent request gate.
    const before = h.calls.length;
    assert.equal((await h.server.handleApi(request('respond', 'POST', { decision: 'confirmed' }, { cookie: 'hm_hustle_p2=' + 'a'.repeat(43) }), 'respond')).status, 503);
    assert.equal(h.calls.length, before);
  });

test('public participation guard stays OFF with every Round 2 switch ON', () => {
  const h = harness(local);
  assert.equal(h.load('src/lib/partners/hustleCarnival.ts').hustlePublicParticipationEnabled(), false);
});

test('synthetic browser: open invitation and response form fail closed after emergency shutdown', async () => {
  const h = harness(local, 'admin'), core = h.load('src/lib/hustle-phase2/core.ts');
  const token = core.newToken().token; h.validHashes.add(core.tokenHash(token));
  const errors = [], requests = [];
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const origin = 'http://127.0.0.1:' + server.address().port;
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
      const req = new NextRequest(origin + incoming.url, { method: incoming.method, headers: incoming.headers, ...(incoming.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
      requests.push(new URL(req.url).pathname);
      const r = incoming.url.startsWith(API + '/') ? await h.server.handleApi(req, incoming.url.slice(API.length + 1)) : await h.pages.handlePage(req, incoming.url.slice(BASE.length).split('/').filter(Boolean));
      outgoing.writeHead(r.status, Object.fromEntries(r.headers)); outgoing.end(Buffer.from(await r.arrayBuffer()));
    } catch { outgoing.writeHead(500); outgoing.end('Synthetic harness failure'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true });
    const origin = 'http://127.0.0.1:' + server.address().port;
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block' });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      h.env.HUSTLE_PHASE2_ENABLED = 'true';
      await page.goto(origin + BASE + '/invite#' + token);
      const button = page.getByRole('button', { name: 'Continue securely' });
      await button.waitFor(); await page.waitForFunction(() => !document.querySelector('button').disabled);
      assert.equal(new URL(page.url()).hash, '');
      h.env.HUSTLE_PHASE2_ENABLED = 'false'; let before = h.calls.length;
      await button.click(); await page.getByRole('status').filter({ hasText: 'Round 2 registration is not available yet.' }).waitFor();
      assert.equal(h.calls.length, before);
      h.env.HUSTLE_PHASE2_ENABLED = 'true';
      await context.addCookies([{ name: 'hm_hustle_p2_account', value: core.stageInvitation('synthetic-service',core.tokenHash(token)), url: origin, httpOnly: true, sameSite: 'Strict' }]);
      await page.goto(origin + BASE);
      await page.getByRole('checkbox').check();
      page.on('dialog', dialog => dialog.accept());
      h.env.HUSTLE_PHASE2_ENABLED = 'false'; before = h.calls.length;
      await page.getByRole('button', { name: 'Confirm attendance', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Round 2 registration is not available yet.' }).waitFor();
      assert.equal(h.calls.length, before);
      await page.reload(); await page.getByRole('heading', { name: 'Registration is not available yet' }).waitFor();
      assert.equal(await page.locator('button,input,form').count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(await page.evaluate(() => ({ ...localStorage, ...sessionStorage })), {});
      await context.close();
    }
    assert.equal(errors.length, 0); assert(!JSON.stringify([h.calls, h.logs, requests]).includes(token));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
