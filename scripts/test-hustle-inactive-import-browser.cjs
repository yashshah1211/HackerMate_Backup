/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic browser/Next/real disposable SQL; Auth/PostgREST transport is a local substitute, not hosted acceptance. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const { createFixture, ROOT, IDS, quote, freePort } = require('./hustle-phase2-local-db.cjs');
const BASE = '/partners/hustle-carnival/phase-2', API = '/api' + BASE;
const revoked = '00000000-0000-4000-8000-000000000006';
const actors = { ...IDS, revoked };
const sid = id => '82000000' + id.slice(8);
const token = id => {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', session_id: sid(id), exp: 2000000000 })).toString('base64url');
  return head + '.' + body + '.' + crypto.createHmac('sha256', 'synthetic-local-auth-only').update(head + '.' + body).digest('base64url');
};
const signatures = { hustle_phase2_limit: ['p_key', 'p_max'], hustle_phase2_import: ['p_actor', 'p_digest', 'p_rows'], hustle_phase2_snapshot: [], hustle_phase2_has_active_session: [], can_access_partner_event: ['p_hackathon_id'], has_partner_admin_access: [] };
const mapping = { 'Judge code': 'team_id', 'Team label': 'team_name', Leader: 'leader_name', Email: 'leader_email', Phone: 'leader_whatsapp', Member: 'optional_second_member_name', 'Member email': 'optional_second_member_email' };
const csv = Object.keys(mapping).join(',') + '\r\n' + Array.from({ length: 42 }, (_, i) => `SYNTH-IM42-${String(i + 1).padStart(3, '0')},Synthetic Solo ${i + 1},Synthetic Leader ${i + 1},leader${i + 1}@example.invalid,,,`).join('\r\n') + '\r\n';

async function main() {
  const db = await createFixture(); let adapter, next, browser, nextLog = ''; const results = [], rpcCalls = [], external = [];
  const out = path.join(ROOT, 'test-results/hustle-inactive-import'); fs.mkdirSync(out, { recursive: true });
  const check = (value, label) => { assert(value, label); results.push({ label, pass: true }); };
  let cleanup = false;
  try {
    // Synthetic prerequisites only; the four reviewed migrations are unchanged.
    db.sql(`CREATE ROLE postgres NOLOGIN NOSUPERUSER BYPASSRLS; CREATE ROLE supabase_auth_admin NOLOGIN;
      ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz DEFAULT now(), ADD COLUMN is_anonymous boolean DEFAULT false;
      ALTER TABLE auth.users OWNER TO supabase_auth_admin;
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
      ALTER TABLE auth.sessions OWNER TO supabase_auth_admin;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      ALTER TABLE profiles ADD COLUMN onboarding_completed boolean DEFAULT true;
      CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=user_id AND role='admin') $$;
      REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC,anon,service_role; GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
      GRANT USAGE ON SCHEMA auth TO postgres,supabase_auth_admin; GRANT USAGE,CREATE ON SCHEMA public TO postgres;
      GRANT SELECT(id,email,email_confirmed_at,is_anonymous),REFERENCES(id) ON auth.users TO postgres;
      GRANT SELECT(id,user_id,not_after) ON auth.sessions TO postgres;
      INSERT INTO auth.users(id,email) VALUES('${revoked}','revoked@example.invalid'); INSERT INTO profiles(id,role,is_banned) VALUES('${revoked}','admin',false);
      ${Object.values(IDS).map(id => `INSERT INTO auth.sessions VALUES('${sid(id)}','${id}',NULL);`).join('\n')}`);
    for (const table of db.sql("SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'").split(/\r?\n/)) db.sql(`ALTER TABLE public.${table} OWNER TO postgres`);
    for (const fn of db.sql("SELECT oid::regprocedure::text FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f'").split(/\r?\n/)) db.sql(`ALTER FUNCTION public.${fn} OWNER TO postgres`);
    for (const migration of ['20261018174144_hustle_round2_auth_guards.sql', '20261020055415_hustle_participant_accounts.sql', '20261020201500_hustle_google_sessions.sql']) db.sql('SET ROLE postgres;' + fs.readFileSync(path.join(ROOT, 'supabase/migrations', migration), 'utf8'));
    check(db.sql("SELECT NOT has_column_privilege('service_role','auth.users','email','SELECT')") === 't', 'production-equivalent service role cannot read Auth email');
    // NextURL canonicalizes loopback IPs to localhost; keep the real CSRF check.
    const apiPort = await freePort(), appPort = await freePort(), origin = 'http://localhost:' + appPort, dbOrigin = 'http://127.0.0.1:' + apiPort;
    adapter = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, dbOrigin); res.setHeader('Content-Type', 'application/json');
        const bearer = req.headers.authorization?.replace(/^Bearer /, ''), identity = Object.values(actors).find(id => token(id) === bearer), service = bearer === 'synthetic-service';
        if (url.pathname === '/auth/v1/user') {
          if (!identity) { res.statusCode = 401; res.end('{"message":"Synthetic unauthorized"}'); return; }
          res.end(JSON.stringify({ id: identity, email: 'synthetic@example.invalid', is_anonymous: false, email_confirmed_at: '2026-01-01', role: 'authenticated', aud: 'authenticated', app_metadata: {}, user_metadata: {} })); return;
        }
        if (url.pathname === '/rest/v1/profiles') {
          if (!identity || url.searchParams.get('id') !== 'eq.' + identity) { res.statusCode = 403; res.end('{}'); return; }
          const p = JSON.parse(db.sql(`SELECT row_to_json(p) FROM (SELECT role,is_banned FROM profiles WHERE id=${quote(identity)}) p`));
          res.end(JSON.stringify(req.headers.accept?.includes('vnd.pgrst.object') ? p : [p])); return;
        }
        if (url.pathname.startsWith('/rest/v1/rpc/')) {
          const name = url.pathname.split('/').at(-1); rpcCalls.push(name);
          if (!(name in signatures)) { res.statusCode = 403; res.end('{}'); return; }
          let raw = ''; for await (const chunk of req) raw += chunk; const body = JSON.parse(raw || '{}');
          const args = signatures[name].map(key => typeof body[key] === 'number' ? String(body[key]) : quote(typeof body[key] === 'object' ? JSON.stringify(body[key]) : body[key] ?? null));
          const claims = JSON.stringify({ sub: identity || '', role: identity ? 'authenticated' : service ? 'service_role' : 'anon', session_id: identity ? sid(identity) : null });
          try {
            const result = await db.asyncSql(`SET ROLE ${service ? 'service_role' : identity ? 'authenticated' : 'anon'}; SET request.jwt.claim.sub=${quote(identity || '')}; SET request.jwt.claims=${quote(claims)}; SELECT coalesce(to_jsonb(public.${name}(${args.join(',')})),'null'::jsonb)::text;`);
            res.end(result.split(/\r?\n/).at(-1));
          } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ code: /permission denied|Access denied/.test(error.message) ? '42501' : /duplicate key/.test(error.message) ? '23505' : 'P0001', message: 'Synthetic SQL operation rejected' })); }
          return;
        }
        external.push(req.method + ' ' + url.pathname); res.statusCode = 403; res.end('{}');
      } catch { res.statusCode = 500; res.end('{"message":"Synthetic adapter error"}'); }
    });
    await new Promise(resolve => adapter.listen(apiPort, '127.0.0.1', resolve));
    const fontMock = path.join(out, 'font-mock.cjs'); fs.writeFileSync(fontMock, "module.exports=new Proxy({},{get:()=> '@font-face{font-family:OfflineFixture;src:local(Arial);font-weight:100 900}'});");
    const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    Object.assign(env, { NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: dbOrigin, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', HUSTLE_PHASE2_ENABLED: 'false', HUSTLE_PHASE2_RELEASE_APPROVED: 'false', HUSTLE_PHASE2_IMPORT_ENABLED: 'true', HUSTLE_PHASE2_IMPORT_RELEASE_APPROVED: 'true', HUSTLE_PHASE2_LOCAL_FIXTURE: 'true', NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontMock });
    assert(!fs.existsSync(path.join(ROOT, '.env')) && !fs.existsSync(path.join(ROOT, '.env.local')), 'No real env files');
    next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-H', '127.0.0.1', '-p', String(appPort)], { cwd: ROOT, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    next.stdout.on('data', v => nextLog += v); next.stderr.on('data', v => nextLog += v);
    let ready = false;
    for (let i = 0; i < 150; i++) { if (next.exitCode !== null) throw Error('Next stopped'); try { if ((await fetch(origin + BASE)).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
    check(ready, 'real Next routes ready with participant switches OFF');
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/chromium') });
    async function context(who, width = 1440) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', extraHTTPHeaders: who ? { Authorization: 'Bearer ' + token(actors[who]) } : {} });
      await ctx.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); external.push('browser outbound'); return route.abort(); });
      return ctx;
    }
    for (const who of [null, 'organizer', 'unrelated', 'foreign', 'banned', 'revoked']) {
      const ctx = await context(who), response = await ctx.request.get(origin + API + '/organizer');
      check([401, 403].includes(response.status()), (who || 'anonymous') + ' private readback denied');
      const post = await ctx.request.post(origin + API + '/columns', { headers: { Origin: origin }, data: { csv } }); check([401, 403].includes(post.status()), (who || 'anonymous') + ' import denied');
      await ctx.close();
    }
    const admin = await context('admin'), page = await admin.newPage(); page.on('dialog', dialog => dialog.accept());
    const response = await page.goto(origin + BASE + '/organizer'); check(response.status() === 200, 'authorized admin sees supported import UI');
    check(await page.getByText(/Import-only preparation/).isVisible(), 'import-only mode is explicit');
    check(await page.locator('[data-action],[data-activate],a[href$="/export"]').count() === 0, 'no invitation/activation/export controls');
    check(response.headers()['cache-control'].includes('no-store') && response.headers()['referrer-policy'] === 'no-referrer', 'private cache/referrer protections');
    await page.locator('#csv').setInputFiles({ name: 'synthetic-42-solo.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.locator('#mapping select').first().waitFor();
    for (const [header, field] of Object.entries(mapping)) await page.locator('#mapping select[data-header=' + JSON.stringify(header) + ']').selectOption(field);
    const dryResponse = page.waitForResponse(r => r.url() === origin + API + '/import' && r.request().postDataJSON().mode === 'preview');
    await page.getByRole('button', { name: 'Validate dry run' }).click(); const dry = await (await dryResponse).json();
    await page.getByText(/42 rows reviewed; 0 validation issues/).waitFor();
    check(dry.total === 42 && dry.rows.length === 42 && dry.issues.length === 0 && !!dry.receipt, '42-row dry run returns reviewed receipt');
    check(dry.rows.every(r => r.second_member_name === null && r.second_member_email === null), 'all 42 mapped rows are solo');
    check(db.sql('SELECT count(*) FROM hustle_phase2_teams') === '0' && db.sql('SELECT count(*) FROM hustle_phase2_batches') === '0', 'dry run inserts no teams or batches');
    for (const [label, body, expected] of [
      ['missing receipt', { mode: 'commit', csv, mapping }, 409],
      ['changed file', { mode: 'commit', csv: csv.replace('Synthetic Solo 1,', 'Changed Solo 1,'), mapping, receipt: dry.receipt }, 409],
      ['changed mapping', { mode: 'commit', csv, mapping: { ...mapping, 'Team label': 'leader_name', Leader: 'team_name' }, receipt: dry.receipt }, 409],
      ['forged actor field', { mode: 'commit', csv, mapping, receipt: dry.receipt, actorId: revoked }, 400],
      ['activation field', { mode: 'commit', csv, mapping, receipt: dry.receipt, active: true }, 400],
    ]) check((await admin.request.post(origin + API + '/import', { headers: { Origin: origin }, data: body })).status() === expected, label + ' rejected');
    check((await admin.request.post(origin + API + '/import', { headers: { Origin: 'https://evil.invalid' }, data: { mode: 'commit', csv, mapping, receipt: dry.receipt } })).status() === 403, 'CSRF rejects valid receipt');
    check(db.sql('SELECT count(*) FROM hustle_phase2_teams') === '0', 'negative cases leave shortlist empty');
    const committedResponse = page.waitForResponse(r => r.url() === origin + API + '/import' && r.request().postDataJSON().mode === 'commit');
    await page.getByRole('button', { name: 'Import reviewed shortlist' }).click(); const committed = await committedResponse;
    // The UI reloads immediately. Verify persistence through an independent
    // readback rather than racing Chrome for the navigated-away response body.
    check(committed.status() === 201, 'actual UI import returns created');
    await page.getByText('Imported, not activated', { exact: true }).waitFor();
    check(db.sql('SELECT count(*) FROM hustle_phase2_teams') === '42', 'real SQL team count 42');
    check(db.sql("SELECT count(*) FROM hustle_phase2_participants WHERE role='leader' AND user_id IS NULL AND verified_at IS NULL") === '42', '42 unbound leader slots, no fabricated onboarding');
    check(db.sql('SELECT count(*) FROM hustle_phase2_batches WHERE activated_at IS NULL AND row_count=42 AND source_digest=' + quote(dry.digest)) === '1', 'stored digest and inactive batch match dry run');
    check(db.sql('SELECT count(*) FROM hustle_phase2_teams WHERE decision=\'pending\'') === '42', 'all decisions remain pending');
    const read = await (await admin.request.get(origin + API + '/organizer')).json();
    check(read.isAdmin === true && read.counts.shortlisted === 42 && read.counts.pending === 42 && read.counts.confirmed === 0 && read.counts.declined === 0 && read.batches[0].activated_at === null, 'supported private readback reconciles 42 inactive teams');
    check((await admin.request.post(origin + API + '/import', { headers: { Origin: origin }, data: { mode: 'commit', csv, mapping, receipt: dry.receipt } })).status() === 409, 'receipt replay cannot duplicate committed shortlist');
    const beforeBlocked = rpcCalls.length;
    for (const action of ['activate', 'invite', 'revoke', 'claim', 'respond', 'session', 'clear-context']) check((await admin.request.post(origin + API + '/' + action, { headers: { Origin: origin }, data: {} })).status() === 503, action + ' remains disabled');
    check((await admin.request.get(origin + API + '/export')).status() === 503, 'CSV export remains disabled');
    for (const route of [BASE, BASE + '/invite']) { const r = await admin.request.get(origin + route); check(r.status() === 200 && (await r.text()).includes('Registration is not available yet'), 'participant page remains unavailable ' + route); }
    check(rpcCalls.length === beforeBlocked, 'blocked operations perform zero adapter RPC calls');
    check(db.sql('SELECT count(*) FROM hustle_phase2_invites') === '0' && db.sql('SELECT count(*) FROM hustle_phase2_google_sessions') === '0', 'no invitations or Google proofs issued');
    const team = db.sql('SELECT id FROM hustle_phase2_teams ORDER BY external_team_id LIMIT 1');
    assert.throws(() => db.sql(`SET ROLE service_role; SELECT hustle_phase2_invite('${IDS.admin}','${team}','${'a'.repeat(64)}')`), /Team not eligible/); check(true, 'database independently refuses invitation for inactive batch');
    await page.setViewportSize({ width: 390, height: 900 }); check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile import dashboard has no page overflow');
    check(!rpcCalls.some(name => /attest_google|activate|invite|respond/.test(name)), 'supported workflow invokes no release/response/proof RPC');
    check(external.length === 0, 'no unexpected adapter requests or external browser requests');
    console.log('Inactive import browser/Next/SQL: ' + results.length + ' passed, 0 failed. Auth/PostgREST are local substitutes; no hosted acceptance claimed.');
  } finally {
    if (browser) await browser.close();
    if (next && next.exitCode === null) { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(next.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }); else next.kill(); }
    if (adapter) { adapter.closeAllConnections(); await new Promise(resolve => adapter.close(resolve)); }
    await db.close(); cleanup = true;
    fs.writeFileSync(path.join(out, 'next-runtime.log'), nextLog);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, cleanup, fixture: 'synthetic local PostgreSQL', hostedAuthTested: false, productionWrites: 0 }, null, 2));
    console.log('Disposable database/browser/server cleanup complete.');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
