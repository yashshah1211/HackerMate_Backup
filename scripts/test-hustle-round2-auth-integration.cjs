/* eslint-disable @typescript-eslint/no-require-imports -- Real synthetic Auth/PostgREST/Next/browser tests, disposable loopback stack only. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const cp = require('node:child_process'), crypto = require('node:crypto'), net = require('node:net');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const { createServerClient } = require('@supabase/ssr');
const REPO = path.resolve(__dirname, '..');
const CLI = process.env.HM_SUPABASE_CLI;
const DOCKER = process.env.HM_DOCKER_BIN;
const CSC = process.env.HM_CSC;
const ID = 'hm-hustle-auth-' + crypto.randomBytes(5).toString('hex');
const TEMP = fs.realpathSync(os.tmpdir()), ROOT = path.join(TEMP, ID), APP = path.join(ROOT, 'app');
const EVENT = '0da43cba-90dc-449c-a126-a2fc8be8a379', OTHER = '10000000-0000-4000-8000-000000000099';
const BASE = '/partners/hustle-carnival/phase-2', API = '/api/partners/hustle-carnival/phase-2';
const checks = [], secrets = [], runtime = {};
let next, browser, nextLog = '', started = false, networkCreated = false, cleanupVerified = false, failure;
const env = { ...process.env };
for (const k of Object.keys(env)) if (/SUPABASE|DATABASE_URL|^PG|RESEND|SENTRY|VERCEL|HUSTLE|TOKEN|SECRET|API_KEY|POSTHOG|NEXT_PUBLIC_GA|DOCKER_HOST|DOCKER_CONTEXT/.test(k)) delete env[k];
function run(exe, args, input, timeout = 120000) {
  const r = cp.spawnSync(exe, args, { env, encoding: 'utf8', input, windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw Error('Local ' + path.basename(exe) + ' failed: ' + (r.error?.code || r.status) + ' ' + String(r.stderr || '').slice(-400));
  return (r.stdout || '').trim();
}
const docker = (args, input) => run(DOCKER, ['--host', 'npipe:////./pipe/dockerDesktopLinuxEngine', ...args], input);
const sql = q => docker(['exec', '-i', 'supabase_db_' + ID, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-At', '-v', 'ON_ERROR_STOP=1'], q);
const quote = s => "'" + String(s).replaceAll("'", "''") + "'";
const check = (v, label) => { checks.push({ label, passed: !!v }); assert(v, label); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() { const s = net.createServer(); await new Promise(resolve => s.listen(0, '127.0.0.1', resolve)); const p = s.address().port; await new Promise(resolve => s.close(resolve)); return p; }
async function request(url, options = {}) {
  assert(['127.0.0.1', 'localhost'].includes(new URL(url).hostname), 'Refuse non-loopback HTTP');
  const r = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(45000) });
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, text, headers: r.headers };
}
function setSection(config, section, key, value) {
  const marker = '[' + section + ']'; const start = config.indexOf(marker); assert(start >= 0, 'Missing local config section ' + section);
  let end = config.indexOf('\n[', start + marker.length); if (end < 0) end = config.length;
  const chunk = config.slice(start, end), re = new RegExp('^' + key + ' = .+$', 'm'); assert(re.test(chunk), 'Missing config key ' + key);
  return config.slice(0, start) + chunk.replace(re, key + ' = ' + value) + config.slice(end);
}
async function main() {
  try {
    assert(process.platform === 'win32' && [CLI, DOCKER, CSC].every(p => p && path.isAbsolute(p) && fs.existsSync(p)), 'Explicit existing Windows CLI/Docker/compiler binaries required');
    fs.mkdirSync(ROOT); env.SUPABASE_HOME = path.join(ROOT, 'cli-home'); env.SUPABASE_TELEMETRY_DISABLED = '1'; env.SUPABASE_NO_KEYRING = 'true';
    // Do not read the operator's registry credentials or modify Docker config.
    env.DOCKER_CONFIG = path.join(ROOT, 'docker-client'); fs.mkdirSync(env.DOCKER_CONFIG);
    fs.writeFileSync(path.join(env.DOCKER_CONFIG, 'config.json'), '{"auths":{}}');
    run(CLI, ['init', '--workdir', ROOT]);
    const ports = { api: await freePort(), db: await freePort(), shadow: await freePort(), mail: await freePort(), app: await freePort() };
    let config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8').replace(/^project_id = .*$/m, 'project_id = ' + JSON.stringify(ID));
    for (const [section, key, value] of [['api', 'port', ports.api], ['db', 'port', ports.db], ['db', 'shadow_port', ports.shadow], ['db', 'major_version', 17], ['db.seed', 'enabled', false], ['local_smtp', 'port', ports.mail]]) config = setSection(config, section, key, value);
    for (const section of ['realtime', 'storage', 'studio', 'analytics', 'edge_runtime', 'db.pooler']) if (config.includes('[' + section + ']')) config = setSection(config, section, 'enabled', false);
    fs.writeFileSync(path.join(ROOT, 'supabase/config.toml'), config);
    check(!fs.existsSync(path.join(ROOT, 'supabase/.temp/project-ref')), 'Fresh local project is never remotely linked');
    const shim = path.join(ROOT, 'shim'); fs.mkdirSync(shim);
    const source = fs.readFileSync(path.join(REPO, 'scripts/fixtures/hustle-loopback-docker.cs'), 'utf8').replace('@PROJECT@', ID).replace('@DOCKER@', DOCKER.replaceAll('"', '""'));
    fs.writeFileSync(path.join(shim, 'docker.cs'), source);
    run(CSC, ['/nologo', '/target:exe', '/out:' + path.join(shim, 'docker.exe'), path.join(shim, 'docker.cs')]);
    check(run(path.join(shim, 'docker.exe'), ['--self-test']).startsWith('PASS'), 'Project-local port adapter rejects wildcard bindings');
    env.PATH = shim + path.delimiter + env.PATH; env.DOCKER_HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine';
    docker(['network', 'create', '--driver', 'bridge', '--label', 'hm.rehearsal=' + ID, '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', ID]); networkCreated = true;
    run(CLI, ['start', '--workdir', ROOT, '--network-id', ID, '--exclude', 'realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'], undefined, 240000); started = true;
    const names = docker(['ps', '-a', '--filter', 'network=' + ID, '--format', '{{.Names}}']).split(/\r?\n/).filter(Boolean);
    check(names.length === 5 && names.every(n => n.endsWith('_' + ID)), 'Only five owned stack containers');
    for (const name of names) { const c = JSON.parse(docker(['inspect', name]))[0]; for (const list of Object.values(c.NetworkSettings.Ports || {})) for (const b of list || []) check(b.HostIp === '127.0.0.1', 'Actual published port is loopback: ' + name); }
    runtime.images = names.map(name => ({ name, image: JSON.parse(docker(['inspect', name]))[0].Config.Image })); runtime.postgres = sql('SHOW server_version');
    const authEnv = JSON.parse(docker(['inspect', 'supabase_auth_' + ID]))[0].Config.Env;
    check(authEnv.some(v => /^GOTRUE_SMTP_HOST=.*(mailpit|inbucket)/.test(v)), 'SMTP is local-only test mail sink');
    check(!authEnv.some(v => /^GOTRUE_EXTERNAL_(?!EMAIL_|PHONE_).+_ENABLED=true$/i.test(v)), 'No external OAuth enabled');
    const status = JSON.parse(run(CLI, ['status', '--workdir', ROOT, '-o', 'json'])); const url = status.API_URL, anon = status.ANON_KEY, service = status.SERVICE_ROLE_KEY;
    assert(url === 'http://127.0.0.1:' + ports.api && anon && service); secrets.push(anon, service);
    const accounts = {};
    for (const name of ['admin', 'founder', 'organizer', 'unrelated', 'bannedAdmin', 'bannedOrganizer', 'foreign', 'leader', 'member', 'solo', 'decliner', 'late', 'noProfile']) {
      const email = name === 'founder' ? 'yashshah7117@gmail.com' : name.toLowerCase() + '-' + ID + '@example.invalid';
      const password = crypto.randomBytes(24).toString('base64url'); secrets.push(password);
      const created = await request(url + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) });
      check([200, 201].includes(created.status), 'Create synthetic local Auth identity: ' + name);
      const login = await request(url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      check(login.status === 200 && login.data.access_token, 'Real local Auth session: ' + name); secrets.push(login.data.access_token, login.data.refresh_token);
      accounts[name] = { id: created.data.id, email, password, token: login.data.access_token, refresh: login.data.refresh_token };
    }
    console.log('Local isolation and real Auth sessions passed.');
    sql(fs.readFileSync(path.join(REPO, 'scripts/fixtures/hustle-auth-foundation.sql'), 'utf8'));
    sql(`INSERT INTO hackathons VALUES('${EVENT}','external',NULL),('${OTHER}','external',NULL);
      ${Object.entries(accounts).map(([name,a]) => `INSERT INTO profiles(id,role,is_banned,email,full_name) VALUES('${a.id}','${['admin','bannedAdmin'].includes(name) ? 'admin' : 'user'}',${name.startsWith('banned')},${quote(a.email)},'Synthetic ${name}');`).join('\n')}
      INSERT INTO event_organizers VALUES('${EVENT}','${accounts.organizer.id}'),('${EVENT}','${accounts.bannedOrganizer.id}'),('${OTHER}','${accounts.foreign.id}');`);
    const foundation = fs.readFileSync(path.join(REPO, 'supabase/migrations/202610060002_partner_organizer_access.sql'), 'utf8');
    for (const name of ['has_partner_admin_access', 'can_access_partner_event']) { const start = foundation.indexOf('CREATE FUNCTION public.' + name), end = foundation.indexOf('$$;', start); assert(start >= 0 && end > start); sql(foundation.slice(start, end + 3)); }
    sql('REVOKE ALL ON FUNCTION public.has_partner_admin_access(),public.can_access_partner_event(uuid) FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.has_partner_admin_access(),public.can_access_partner_event(uuid) TO authenticated;');
    const canonical = fs.readFileSync(path.join(REPO, 'supabase/migrations/20261018082156_hustle_phase2_shortlist.sql'), 'utf8').replace(/\r\n/g, '\n');
    check(crypto.createHash('sha256').update(canonical).digest('hex') === '4fc87a833b6e3c4687cba372a05717383cb8f35fdd60f03a7f90e166038f45e7', 'Original canonical migration unchanged'); sql(canonical);
    const rpc = (name, who, args) => { const query = new URLSearchParams(Object.entries(args || {}).map(([k,v]) => [k,String(v)])); return request(url + '/rest/v1/rpc/' + name + (query.size ? '?' + query : ''), { headers: { apikey: anon, ...(who ? { Authorization: 'Bearer ' + accounts[who].token } : {}) } }); };
    const patchProfile = (who, changes) => request(url + '/rest/v1/profiles?id=eq.' + accounts[who].id, { method: 'PATCH', headers: { apikey: anon, Authorization: 'Bearer ' + accounts[who].token, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(changes) });
    check((await patchProfile('bannedAdmin', { is_banned: false })).status === 204 && sql(`SELECT NOT is_banned FROM profiles WHERE id='${accounts.bannedAdmin.id}'`) === 't', 'Baseline valid banned-admin JWT can self-unban through PostgREST');
    sql(`UPDATE profiles SET is_banned=true WHERE id='${accounts.bannedAdmin.id}'`);
    const logout = await request(url + '/auth/v1/logout?scope=local', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + accounts.admin.token } });
    check(logout.status === 204, 'Real GoTrue local logout revokes admin session');
    check((await rpc('hustle_phase2_snapshot', 'admin')).status === 200, 'Baseline revoked-but-unexpired JWT still reads snapshot');
    sql(fs.readFileSync(path.join(REPO, 'supabase/migrations/20261018174144_hustle_round2_auth_guards.sql'), 'utf8')); sql("NOTIFY pgrst,'reload schema';");
    let ready = false; for (let i = 0; i < 30; i++) { const r = await rpc('hustle_phase2_has_active_session', 'founder'); if (r.status === 200 && r.data === true) { ready = true; break; } await pause(200); } check(ready, 'PostgREST reload exposes authenticated-only boolean helper');
    check((await rpc('hustle_phase2_snapshot', 'admin')).status === 403, 'Revoked signed JWT denied by direct snapshot after fix');
    check((await rpc('hustle_phase2_has_active_session', 'admin')).data === false, 'Revoked signed JWT gets false, no session data');
    for (const who of ['founder', 'organizer']) check((await rpc('hustle_phase2_snapshot', who)).status === 200, 'Active ' + who + ' direct RPC allowed');
    for (const who of ['unrelated', 'foreign', 'bannedAdmin', 'bannedOrganizer']) check((await rpc('hustle_phase2_snapshot', who)).status === 403, 'Direct RPC denies ' + who);
    check([401,403].includes((await rpc('hustle_phase2_snapshot', null)).status), 'Anonymous snapshot denied');
    check((await patchProfile('bannedAdmin', { is_banned: false, role: 'admin' })).status === 204 && sql(`SELECT is_banned FROM profiles WHERE id='${accounts.bannedAdmin.id}'`) === 't', 'Existing trigger blocks real PostgREST self-unban after fix');
    check((await rpc('is_admin', 'bannedAdmin', { user_id: accounts.bannedAdmin.id })).data === false, 'Banned JWT loses global admin predicate');
    for (const role of ['anon','authenticated','service_role']) check(sql(`SELECT NOT has_any_column_privilege('${role}','auth.sessions','SELECT')`) === 't', 'No raw Auth session reads for ' + role);
    const newLogin = await request(url + '/auth/v1/token?grant_type=password', { method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email:accounts.admin.email,password:accounts.admin.password}) });
    check(newLogin.status === 200, 'Fresh local admin session'); accounts.admin.token = newLogin.data.access_token; accounts.admin.refresh = newLogin.data.refresh_token; secrets.push(newLogin.data.access_token,newLogin.data.refresh_token);
    // New participant model installed in this disposable stack before any roster.
    sql('ALTER TABLE profiles ADD COLUMN onboarding_completed boolean DEFAULT true;GRANT SELECT(onboarding_completed) ON profiles TO authenticated;GRANT SELECT(email_confirmed_at,is_anonymous) ON auth.users TO postgres;');
    sql(fs.readFileSync(path.join(REPO,'supabase/migrations/20261020055415_hustle_participant_accounts.sql'),'utf8'));sql("NOTIFY pgrst,'reload schema'");
    await pause(500);
    // One synthetic private row tests data access; no activation or invitation.
    sql(`SET ROLE service_role;SELECT hustle_phase2_import('${accounts.admin.id}','${'a'.repeat(64)}','[{"external_team_id":"SYNTH-AUTH-1","team_name":"Synthetic Private Team","leader_name":"Synthetic Leader","leader_email":"synthetic-leader@example.invalid","leader_whatsapp":null,"second_member_name":null}]');`);
    fs.mkdirSync(APP); for (const name of ['src','public']) fs.cpSync(path.join(REPO,name),path.join(APP,name),{recursive:true});
    for (const name of ['package.json','tsconfig.json','next-env.d.ts','next.config.ts','postcss.config.mjs']) if (fs.existsSync(path.join(REPO,name))) fs.copyFileSync(path.join(REPO,name),path.join(APP,name));
    fs.symlinkSync(fs.realpathSync(path.join(REPO,'node_modules')),path.join(APP,'node_modules'),'junction');
    const font = path.join(ROOT,'font.cjs'); fs.writeFileSync(font,"module.exports=new Proxy({},{get:()=> '@font-face{font-family:OfflineFixture;src:local(Arial);font-weight:100 900}'});");
    const appEnv={...env,NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,HUSTLE_PHASE2_ENABLED:'true',HUSTLE_PHASE2_LOCAL_FIXTURE:'true',NEXT_FONT_GOOGLE_MOCKED_RESPONSES:font};
    const origin='http://localhost:'+ports.app;
    next=cp.spawn(process.execPath,[path.join(APP,'node_modules/next/dist/bin/next'),'dev','--webpack','-H','127.0.0.1','-p',String(ports.app)],{cwd:APP,env:appEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});next.stdout.on('data',c=>nextLog+=c);next.stderr.on('data',c=>nextLog+=c);
    let appReady=false;for(let i=0;i<100;i++){if(next.exitCode!==null)throw Error('Next fixture exited');try{if((await request(origin+BASE)).status===401){appReady=true;break;}}catch{}await pause(300);}check(appReady,'Actual Next fixture ready with real local Supabase');
    const api=(who,action,body)=>request(origin+API+'/'+action,{method:body?'POST':'GET',headers:{...(who?{Authorization:'Bearer '+accounts[who].token}:{}),Origin:origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    for(const who of ['admin','founder','organizer']){const r=await api(who,'organizer');check(r.status===200&&r.data.counts.shortlisted===1,'Actual Next shortlist allows '+who);}
    for(const who of ['unrelated','foreign','bannedAdmin','bannedOrganizer'])check((await api(who,'organizer')).status===403,'Actual Next rejects '+who);
    check((await api(null,'organizer')).status===401,'Actual Next requires authenticated session');
    check((await api('organizer','columns',{csv:'team_id,team_name\nSYNTH-AUTH-1,Synthetic'})).status===403,'Organizer cannot use administrator tools');
    check((await api('admin','columns',{csv:'team_id,team_name\nSYNTH-AUTH-1,Synthetic'})).status===200,'Active admin authorized operation preserved');
    // Existing legitimate moderation path remains functional; real local Auth
    // and service client are used, but all identities/data are disposable.
    const cookieHeaders={};
    for(const who of ['admin','bannedAdmin']){
      const jar=new Map();const client=createServerClient(url,anon,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(c=>jar.set(c.name,c.value))}});
      const set=await client.auth.setSession({access_token:accounts[who].token,refresh_token:accounts[who].refresh});assert(!set.error,'Local SSR cookie setup');
      cookieHeaders[who]=[...jar].map(([name,value])=>name+'='+value).join('; ');secrets.push(cookieHeaders[who]);
    }
    const moderate=(who,target,ban)=>request(origin+'/api/admin/ban-user',{method:'POST',headers:{Cookie:cookieHeaders[who],'Content-Type':'application/json',Origin:origin},body:JSON.stringify({userId:accounts[target].id,is_banned:ban})});
    runtime.moderation=[];
    for(const ban of [true,false]){const r=await moderate('admin','unrelated',ban);runtime.moderation.push({status:r.status,success:r.data.success,changed:r.data.changed});check(r.status===200&&r.data.changed===true,'Existing admin moderation '+(ban?'ban':'unban')+' succeeds');}
    check((await moderate('admin','admin',true)).status===403,'Moderation still blocks self');check((await moderate('admin','founder',true)).status===403,'Moderation still protects founder');check((await moderate('bannedAdmin','unrelated',true)).status===403,'Banned admin cannot use moderation');
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
    await require('./hustle-participant-integration-cases.cjs')({sql,request,url,anon,service,accounts,origin,BASE,API,check,browser,secrets,REPO});
    for(const width of [390,1440]){const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',extraHTTPHeaders:{Authorization:'Bearer '+accounts.organizer.token}});let external=0;await ctx.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external++;return route.abort();});const page=await ctx.newPage();await page.goto(origin+BASE+'/organizer');await page.getByRole('heading',{name:'Round 2 shortlist',exact:true}).waitFor();check((await page.content()).includes('Synthetic Private Team'),'Real-session browser shortlist '+width);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Browser layout '+width);check(external===0,'No external browser requests '+width);await ctx.close();}
    const revoke=await request(url+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+accounts.organizer.token}});check(revoke.status===204,'Real organizer session revoked');
    check((await rpc('hustle_phase2_snapshot','organizer')).status===403,'Revoked organizer JWT cannot read direct RPC');const deniedRoute=await api('organizer','organizer');check([401,403].includes(deniedRoute.status)&&!deniedRoute.text.includes('Synthetic Private Team'),'Revoked organizer denied by actual server route');
    const ctx=await browser.newContext({extraHTTPHeaders:{Authorization:'Bearer '+accounts.organizer.token},serviceWorkers:'block'});const page=await ctx.newPage();const deniedPage=await page.goto(origin+BASE+'/organizer');check([401,403].includes(deniedPage.status())&&!(await page.content()).includes('Synthetic Private Team'),'Revoked session browser reload discloses no shortlist');await ctx.close();
    check((await request('http://127.0.0.1:'+ports.mail+'/api/v1/messages')).data.total===0,'Local mail sink empty');
    check(!secrets.some(s=>nextLog.includes(s)),'No synthetic credentials/tokens in Next logs');
  } catch(error) { failure=String(error.message);for(const s of secrets)failure=failure.replaceAll(s,'[redacted]');console.error(failure.slice(0,600));process.exitCode=1; }
  finally {
    if(browser)await browser.close().catch(()=>{});
    if(next&&next.exitCode===null)cp.spawnSync('taskkill',['/pid',String(next.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});
    try {
      if(started||networkCreated)run(CLI,['stop','--workdir',ROOT,'--no-backup']);
      if(networkCreated){check(!docker(['ps','-a','--filter','network='+ID,'--format','{{.Names}}']),'No owned containers remain');docker(['network','rm',ID]);check(!docker(['volume','ls','--filter','label=com.supabase.cli.project='+ID,'--format','{{.Name}}']),'No owned volumes remain');}
      if(fs.existsSync(ROOT)){assert(path.dirname(fs.realpathSync(ROOT))===TEMP&&path.basename(ROOT)===ID&&ID.startsWith('hm-hustle-auth-'));const link=path.join(APP,'node_modules');if(fs.existsSync(link)){assert(fs.lstatSync(link).isSymbolicLink());fs.rmdirSync(link);}fs.rmSync(ROOT,{recursive:true,force:true,maxRetries:4,retryDelay:200});}
      cleanupVerified=true;
    }catch(error){console.error('Owned cleanup incomplete: '+error.message);process.exitCode=1;}
    const evidence={date:new Date().toISOString(),checks,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,failure,cleanupVerified,runtime,realAuth:true,realPostgREST:true,realNext:true,productionRecoveryProven:false,hostedCompatibilityProven:false};
    fs.mkdirSync(path.join(REPO,'test-results'),{recursive:true});fs.writeFileSync(path.join(REPO,'test-results/hustle-auth-real-integration.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({passed:evidence.passed,failed:evidence.failed,failure,cleanupVerified}));
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
