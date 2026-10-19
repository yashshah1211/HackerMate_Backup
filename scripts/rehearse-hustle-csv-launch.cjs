/* eslint-disable @typescript-eslint/no-require-imports -- 75-team operations rehearsal; reuses the existing browser fixture adapter, never live Supabase. */
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const {spawn}=require('node:child_process');const {chromium}=require('@playwright/test');
const {createFixture,installClock,ROOT,EVENT,IDS,quote,freePort}=require('./hustle-phase2-local-db.cjs');
const BASE='/partners/hustle-carnival/phase-2',API='/api/partners/hustle-carnival/phase-2';
const signatures={hustle_phase2_limit:['p_key','p_max'],hustle_phase2_import:['p_actor','p_digest','p_rows'],hustle_phase2_activate:['p_actor','p_batch','p_digest'],hustle_phase2_invite:['p_actor','p_team','p_hash'],hustle_phase2_revoke:['p_actor','p_team'],hustle_phase2_inspect:['p_hash'],hustle_phase2_respond:['p_hash','p_decision'],hustle_phase2_snapshot:[],has_partner_admin_access:[],can_access_partner_event:['p_hackathon_id']};
const tokenFor=id=>Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:2000000000,email:'fixture@example.invalid'})).toString('base64url')+'.synthetic-signature';
async function main(){assert(!process.env.VERCEL_ENV&&!process.env.VERCEL,'Local-only rehearsal');assert(!fs.existsSync(path.join(ROOT,'.env'))&&!fs.existsSync(path.join(ROOT,'.env.local')),'Use a clean isolated checkout');const db=await createFixture();let stub,next,browser;let nextLog='';const errors=[],unexpected=[],requests=[],rawTokens=[],seenUrls=[],browserLogs=[];let checks=0,missingSchema=false,refreshCount=0,ratePauses=0;const started=Date.now();
 const check=(value,label)=>{assert(value,label);checks++;};
 const redact=value=>{let safe=String(value);for(const token of rawTokens)safe=safe.replaceAll(token,'[bearer redacted]');return safe.replace(/https?:\/\/[^\s"'<>]+/g,'[URL redacted]').replace(/[A-Za-z0-9_-]{43}/g,'[opaque value redacted]')};
 const out=path.join(ROOT,'test-results/hustle-csv-rehearsal');fs.mkdirSync(out,{recursive:true});
 try{
  installClock(db,'2026-10-22T16:30:00Z');const apiPort=await freePort(),appPort=await freePort(),origin=`http://localhost:${appPort}`,dbOrigin=`http://127.0.0.1:${apiPort}`;
  stub=http.createServer(async(req,res)=>{try{
   const url=new URL(req.url,dbOrigin);res.setHeader('Content-Type','application/json');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info');if(req.method==='OPTIONS'){res.end();return;}
   const bearer=req.headers.authorization?.replace('Bearer ','');const identity=Object.values(IDS).find(id=>tokenFor(id)===bearer);const service=bearer==='fixture-service-secret';
   if(url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='refresh_token'){let raw='';for await(const chunk of req)raw+=chunk;const data=JSON.parse(raw);if(data.refresh_token!=='fixture-initial-organizer'||refreshCount){res.statusCode=400;res.end(JSON.stringify({error:'invalid_grant',message:'Synthetic refresh token already rotated'}));return;}refreshCount++;res.end(JSON.stringify({access_token:tokenFor(IDS.organizer),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'fixture-rotated-organizer',user:{id:IDS.organizer,email:'organizer@example.invalid',role:'authenticated',aud:'authenticated',app_metadata:{},user_metadata:{}}}));return;}
   if(url.pathname==='/auth/v1/user'){if(!identity){res.statusCode=401;res.end(JSON.stringify({message:'Synthetic unauthorized'}));return}res.end(JSON.stringify({id:identity,email:'fixture@example.invalid',role:'authenticated',aud:'authenticated',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}}));return;}
   if(url.pathname.startsWith('/rest/v1/rpc/')){
    const name=url.pathname.split('/').at(-1);requests.push(name);if(!(name in signatures)){res.statusCode=403;res.end('{}');return;}
    if(missingSchema&&name.startsWith('hustle_phase2_')){res.statusCode=404;res.end(JSON.stringify({code:'42P01',message:'Synthetic missing migration'}));return;}
    let raw='';for await(const chunk of req)raw+=chunk;const data=JSON.parse(raw||'{}');const args=signatures[name].map(key=>typeof data[key]==='number'?String(data[key]):quote(typeof data[key]==='object'?JSON.stringify(data[key]):data[key]??null));
    try{const result=await db.asyncSql(`SET ROLE ${service?'service_role':identity?'authenticated':'anon'}; SET request.jwt.claim.sub=${quote(identity||'')}; SELECT coalesce(to_jsonb(public.${name}(${args.join(',')})),'null'::jsonb)::text;`);res.end(result.split('\n').at(-1));}
    catch(error){res.statusCode=400;res.end(JSON.stringify({code:/permission denied|Access denied/.test(error.message)?'42501':/duplicate key/.test(error.message)?'23505':'P0001',message:'Synthetic database rejected operation'}));}return;
   }
   if(url.pathname==='/rest/v1/profiles'){
    const wanted=url.searchParams.get('id')?.replace('eq.','');const rows=Object.entries(IDS).filter(([,id])=>!wanted||id===wanted).map(([name,id])=>({id,role:name==='admin'?'admin':'user',is_banned:name==='banned',full_name:'Synthetic '+name,college:'Fixture College',skills:[],avatar_url:null,gender:null}));res.setHeader('Content-Range',`0-${Math.max(0,rows.length-1)}/${rows.length}`);if(req.method==='HEAD'){res.end();return}res.end(JSON.stringify(req.headers.accept?.includes('vnd.pgrst.object')?rows[0]??null:rows));return;
   }
   if(url.pathname==='/rest/v1/hackathons'){const rows=[{id:EVENT,status:'approved',archived:false,type:'external',name:'Synthetic Hustle fixture',mode:'online',start_date:'2026-10-12',end_date:'2026-10-22',location:'Synthetic venue',max_team_size:4}];res.end(JSON.stringify(req.headers.accept?.includes('vnd.pgrst.object')?rows[0]:rows));return;}
   if(url.pathname==='/rest/v1/team_members'){check(url.searchParams.get('team_id')==='eq.00000000-0000-4000-8000-000000000099','smoke uses synthetic team');res.end(JSON.stringify([{id:'00000000-0000-4000-8000-000000000098',role:'leader',profiles:{id:IDS.admin,full_name:'Synthetic admin',skills:[]}}]));return;}
   if(['/rest/v1/user_badges','/rest/v1/team_ppt_evaluations'].includes(url.pathname)){res.end('[]');return;}
   unexpected.push(req.method+' '+url.pathname);res.statusCode=403;res.end('{}');
  }catch(error){errors.push(error.message);res.statusCode=500;res.end('{}');}});
  await new Promise(resolve=>stub.listen(apiPort,'127.0.0.1',resolve));
  const fontMock=path.join(out,'font-mock.cjs');fs.writeFileSync(fontMock,"module.exports=new Proxy({},{get:()=> '@font-face{font-family:OfflineFixture;src:local(Arial);font-weight:100 900}'});");
  const env={...process.env};for(const key of Object.keys(env))if(/SUPABASE|SENTRY|RESEND|DATABASE_URL|NEXT_PUBLIC_GA|VERCEL|HUSTLE|TOKEN|SECRET|API_KEY|POSTHOG/.test(key))delete env[key];
  Object.assign(env,{NODE_ENV:'development',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:dbOrigin,NEXT_PUBLIC_SUPABASE_ANON_KEY:'hustle-offline-fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-secret',HUSTLE_PHASE2_ENABLED:'true',HUSTLE_PHASE2_RELEASE_APPROVED:'false',HUSTLE_PHASE2_LOCAL_FIXTURE:'true',HM_SMOKE_SYNTHETIC:'true',NEXT_FONT_GOOGLE_MOCKED_RESPONSES:fontMock});
  next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','-H','127.0.0.1','-p',String(appPort)],{cwd:ROOT,env,windowsHide:true,stdio:['ignore','pipe','pipe']});next.stdout.on('data',v=>nextLog+=v);next.stderr.on('data',v=>nextLog+=v);
  console.log('Fixture ready; starting Next route checks.');let ready=false;for(let n=0;n<180;n++){if(next.exitCode!==null)throw new Error('Next exited: '+nextLog);try{const r=await fetch(origin+BASE);if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,500));}check(ready,'Next route ready');console.log('Next ready; rehearsing CSV, 75 recipient checks and leader responses.');
  const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:fs.existsSync(edge)?{executablePath:edge}:{})});
  async function context(width,who){const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',extraHTTPHeaders:who?{Authorization:'Bearer '+tokenFor(IDS[who])}:{}});await ctx.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();unexpected.push('external browser request');return route.abort();});ctx.on('page',page=>{page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>seenUrls.push(request.url()));page.on('console',msg=>browserLogs.push(msg.text()));});return ctx;}
  const { core, preflight } = require('./hustle-csv-preflight.cjs');
  const { spawnSync: git } = require('node:child_process');
  const bytes = fs.readFileSync(path.join(ROOT, 'docs/hustle-launch-rehearsal/synthetic-75.import.csv'));
  const csv = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const mapping = Object.fromEntries(core.FIELDS.map(field => [field, field]));
  const offline = preflight(bytes, { expectedTeams: 75 });
  check(offline.result === 'SYNTAX_AND_COUNT_PASS_ONLY', '75-team offline preflight');
  check(offline.participants === 112, '75 synthetic teams represent 112 people');
  const waitMinute = async () => {
    ratePauses++;
    console.log('Observed explicit 429; waiting for the real local minute boundary, without changing the limiter.');
    const until = Date.now() + 60_000 - Date.now() % 60_000 + 150;
    while (Date.now() < until) await new Promise(resolve => setTimeout(resolve, Math.min(20_000, until - Date.now())));
  };
  const post = async (ctx, action, data, retry429 = true) => {
    for (;;) {
      const response = await ctx.request.post(origin + API + '/' + action, { data, headers: { origin, 'sec-fetch-site': 'same-origin' } });
      if (retry429 && response.status() === 429) { await waitMinute(); continue; }
      return response;
    }
  };
  const json = async response => response.json();
  const snapshot = async ctx => json(await ctx.request.get(origin + API + '/organizer'));
  const setClock = value => db.sql('UPDATE public.fixture_clock SET value=' + quote(value));
  const admin = await context(1440, 'admin'), ap = await admin.newPage();
  const organizer = await context(390, 'organizer'), op = await organizer.newPage();
  ap.on('dialog', dialog => dialog.accept());
  const checkpoints = [];
  const counts = () => ({ batches: Number(db.sql('SELECT count(*) FROM hustle_phase2_batches')), teams: Number(db.sql('SELECT count(*) FROM hustle_phase2_teams')) });
  await ap.goto(origin + BASE + '/organizer');
  await ap.getByRole('heading', { name: 'Round 2 shortlist', exact: true }).waitFor();
  check(counts().teams === 0, 'fresh disposable roster');

  const invalidCases = [
    ['duplicate headers', csv.replace('team_name,', 'team_id,'), mapping, 400],
    ['unknown headers', csv.replace('team_id,', 'Sno,'), mapping, 400],
    ['missing team ID', csv.replace('SYNTH-001,', ','), mapping, 200],
    ['missing leader', csv.replace('Synthetic Leader 001', ''), mapping, 200],
    ['duplicate normalized ID', csv.replace('SYNTH-002', 'synth-001'), mapping, 200],
    ['duplicate email', csv.replace('leader002@example.invalid', 'LEADER001@example.invalid'), mapping, 200],
    ['ambiguous original participant headers', 'Sno,Name,Phone number,Gmail,College name\n1,Synthetic Person,,person@example.invalid,Synthetic College', mapping, 400],
  ];
  for (const [name, source, map, status] of invalidCases) {
    const response = await post(admin, 'import', { mode: 'preview', csv: source, mapping: map });
    check(response.status() === status, name + ' preview status');
    if (status === 200) { const body = await json(response); check(body.issues.length > 0 && body.receipt === null, name + ' has no import receipt'); }
    check(counts().teams === 0, name + ' dry run writes no teams');
  }
  // A name shared between teams is syntactically possible; it is an operational HOLD, not proof of identity.
  const ambiguous = Buffer.from(csv.replace('Synthetic Member 002', 'Synthetic Leader 001'));
  check(preflight(ambiguous, { expectedTeams: 75 }).result === 'HOLD_FOR_REVIEW', 'ambiguous cross-team name requires organizer verification');

  const initial = await json(await post(admin, 'import', { mode: 'preview', csv, mapping }));
  check(initial.issues.length === 0 && initial.rows.length === 75, 'clean exact 75-row preview');
  check(initial.digest === offline.previewDigest, 'offline and real Next preview digests match');
  const expired = core.receipt('fixture-service-secret', IDS.admin, initial.digest, Date.now() - 1);
  check((await post(admin, 'import', { mode: 'commit', csv, mapping, receipt: expired })).status() === 409, 'expired receipt rejected');
  check((await post(admin, 'import', { mode: 'commit', csv: csv + '\r\n', mapping, receipt: initial.receipt })).status() === 409, 'changed file invalidates receipt');
  check(counts().teams === 0, 'failed commit attempts leave no partial batch');

  // Exercise the actual file picker, automatic canonical mapping, preview and explicit commit UI.
  await ap.locator('#csv').setInputFiles({ name: 'synthetic-75.csv', mimeType: 'text/csv', buffer: bytes });
  await ap.locator('#mapping select').last().waitFor();
  for (const field of core.FIELDS) check(await ap.locator('#mapping select[data-header="' + field + '"]').inputValue() === field, 'explicit canonical mapping ' + field);
  for (;;) {
    const pending = ap.waitForResponse(r => new URL(r.url()).pathname === API + '/import');
    await ap.getByRole('button', { name: 'Validate dry run', exact: true }).click();
    if ((await pending).status() === 429) { await waitMinute(); continue; }
    break;
  }
  await ap.getByText(/75 rows reviewed; 0 validation issues/).waitFor();
  check(counts().teams === 0, 'UI dry run is not an import');
  await ap.getByRole('button', { name: 'Import reviewed shortlist', exact: true }).click();
  await ap.getByText('Imported, not activated', { exact: true }).waitFor();
  check(counts().teams === 75 && counts().batches === 1, 'one inactive 75-team batch imported');
  const imported = await snapshot(admin), batch = imported.batches[0];
  check(batch.source_digest === initial.digest && batch.activated_at === null, 'inactive batch digest readback');
  check((await post(admin, 'invite', { teamId: imported.teams[0].id })).status() === 409, 'inactive batch cannot issue invitations');
  const repeated = await json(await post(admin, 'import', { mode: 'preview', csv, mapping }));
  check(repeated.issues.length === 75 && repeated.receipt === null, 'accidental reimport dry run flags every existing team');
  check((await post(admin, 'import', { mode: 'commit', csv, mapping, receipt: initial.receipt })).status() === 409, 'original receipt cannot reimport existing roster');
  check(counts().teams === 75 && counts().batches === 1, 'no overwrite or duplicate batch');
  check((await post(admin, 'activate', { batchId: batch.id, digest: '0'.repeat(64), confirm: 'ACTIVATE' })).status() === 409, 'wrong activation digest rejected');
  check((await post(organizer, 'activate', { batchId: batch.id, digest: batch.source_digest, confirm: 'ACTIVATE' })).status() === 403, 'read-only organizer cannot activate');
  await ap.getByRole('button', { name: 'Activate this official shortlist', exact: true }).click();
  await ap.getByText('Activated', { exact: true }).waitFor();
  check((await snapshot(admin)).counts.pending === 75, 'activation is not a team response');
  checkpoints.push({ stage: 'activated-before-opening', ...counts(), pending: 75 });

  const issuanceStarted = Date.now(), links = [], ledger = [];
  for (let i = 1; i <= 75; i++) {
    const id = String(i).padStart(3, '0'), externalId = 'SYNTH-' + id;
    await ap.locator('#search').fill(externalId);
    const row = ap.locator('tbody tr:visible');
    check(await row.count() === 1, 'search selects exactly one team ' + id);
    for (;;) {
      const pending = ap.waitForResponse(r => new URL(r.url()).pathname === API + '/invite');
      await row.getByRole('button', { name: 'Create private link', exact: true }).click();
      const response = await pending;
      if (response.status() === 429) { await waitMinute(); continue; }
      check(response.status() === 201, 'private link generated ' + id); break;
    }
    await ap.locator('#created-link').waitFor({ state: 'visible' });
    const recipient = await ap.locator('#link-recipient dd').allTextContents();
    check(JSON.stringify(recipient) === JSON.stringify([externalId, 'Synthetic Team ' + id, 'Synthetic Leader ' + id, 'leader' + id + '@example.invalid', 'Not provided']), 'five recipient fields match approved synthetic master ' + id);
    const link = await ap.locator('#link-value').inputValue(), token = new URL(link).hash.slice(1);
    rawTokens.push(token); links.push(link);
    check(core.tokenHash(token) !== null, 'fragment capability shape ' + id);
    check(db.sql(`SELECT t.external_team_id FROM hustle_phase2_teams t JOIN hustle_phase2_invites i ON i.team_id=t.id WHERE i.token_hash=${quote(core.tokenHash(token))}`) === externalId, 'generated bearer belongs to the verified recipient ' + id);
    ledger.push({ team_id: externalId, link_state: 'generated', manual_contact_state: i === 62 ? 'SIMULATED_UNKNOWN' : 'SIMULATED_HANDOFF_VERIFIED', real_messages_sent: 0 });
    await ap.getByRole('button', { name: 'Close and refresh', exact: true }).click();
    await ap.getByRole('heading', { name: 'Round 2 shortlist', exact: true }).waitFor();
    if (i % 15 === 0) console.log('Recipient-verified local invitations: ' + i + '/75; no real messages sent.');
  }
  const issuanceSeconds = Number(((Date.now() - issuanceStarted) / 1000).toFixed(1));
  check(Number(db.sql('SELECT count(*) FROM hustle_phase2_invites')) === 75, '75 hashed invitations, no raw-token column');
  check((await snapshot(organizer)).counts.pending === 75, 'generation/simulated contact does not confirm attendance');
  await op.goto(origin + BASE + '/organizer');
  check(await op.getByRole('button', { name: 'Create private link' }).count() === 0, 'organizer dashboard remains read only');
  await op.locator('#search').fill('SYNTH-075');
  check(await op.locator('tbody tr:visible').count() === 1, 'mobile organizer team search');
  check(await op.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile organizer has no document overflow');

  // Before opening, a valid bearer can identify the team, but cannot submit a response.
  const firstCtx = await context(390), firstPage = await firstCtx.newPage();
  await firstPage.goto(links[0]);
  await firstPage.getByRole('button', { name: 'Continue securely' }).click();
  await firstPage.getByRole('heading', { name: 'Synthetic Team 001', exact: true }).waitFor();
  check(await firstPage.getByText('Registration has not opened yet.', { exact: true }).isVisible(), 'October 22 private landing is before opening');
  setClock('2026-10-23T04:29:59.999Z');
  check((await post(firstCtx, 'respond', { decision: 'confirmed' })).status() === 409, '09:59:59.999 IST response rejected');
  setClock('2026-10-23T04:30:00Z');
  const responseContexts = [];
  for (let i = 0; i < 75; i++) {
    const ctx = i === 0 ? firstCtx : await context(i % 2 ? 1440 : 390), page = i === 0 ? firstPage : await ctx.newPage();
    responseContexts.push(ctx);
    if (i === 0) await page.reload();
    else {
      await page.goto(links[i]);
      await page.waitForFunction(() => location.hash === '' && !document.querySelector('#exchange button').disabled);
      check(!page.url().includes('#'), 'leader fragment removed ' + i);
      await page.getByRole('button', { name: 'Continue securely' }).click();
    }
    await page.getByRole('heading', { name: 'Synthetic Team ' + String(i + 1).padStart(3, '0'), exact: true }).waitFor();
    if (i < 60) {
      page.on('dialog', dialog => dialog.accept());
      await page.locator('#leader').check();
      const decision = i < 45 ? 'confirmed' : 'declined';
      await page.getByRole('button', { name: decision === 'confirmed' ? 'Confirm attendance' : 'Decline invitation', exact: true }).click();
      await page.getByText('Your team’s response: ' + decision + '.', { exact: true }).waitFor();
      check(true, 'leader response recorded through actual UI ' + i);
    } else check(await page.getByRole('button', { name: 'Confirm attendance', exact: true }).isVisible(), 'pending leader remains able to choose');
    if ((i + 1) % 15 === 0) console.log('Leader journeys exercised: ' + (i + 1) + '/75.');
  }
  const initialCounts = (await snapshot(organizer)).counts;
  check(JSON.stringify([initialCounts.shortlisted, initialCounts.confirmed, initialCounts.declined, initialCounts.pending]) === JSON.stringify([75, 45, 15, 15]), 'dashboard counts reconcile 75 = 45 + 15 + 15');
  checkpoints.push({ stage: 'responses', ...initialCounts });
  check((await post(firstCtx, 'respond', { decision: 'confirmed' })).status() === 200, 'same decision retry is idempotent');
  check((await post(firstCtx, 'respond', { decision: 'declined' })).status() === 409, 'conflicting second decision rejected');
  check(Number(db.sql("SELECT count(*) FROM hustle_phase2_audit WHERE action='confirmed'")) === 45, 'retry did not create a second confirmation');
  const pendingTeam = imported.teams.find(team => team.external_team_id === 'SYNTH-061');
  check((await post(admin, 'invite', { teamId: pendingTeam.id })).status() === 409, 'ready link cannot be blindly regenerated');
  check((await post(admin, 'revoke', { teamId: pendingTeam.id })).status() === 200, 'pending misdelivery/lost-link revoke');
  check((await post(responseContexts[60], 'respond', { decision: 'confirmed' })).status() === 404, 'old bearer cookie fails after revocation');
  const replacement = await json(await post(admin, 'invite', { teamId: pendingTeam.id }));
  const replacementToken = new URL(replacement.url).hash.slice(1); rawTokens.push(replacementToken);
  check(replacementToken !== rawTokens[60], 'explicit reissue uses a different capability');

  setClock('2026-10-23T17:29:59.999Z');
  check((await post(responseContexts[62], 'respond', { decision: 'confirmed' })).status() === 200, '22:59:59.999 IST decision accepted');
  setClock('2026-10-23T17:30:00Z');
  check((await post(responseContexts[63], 'respond', { decision: 'declined' })).status() === 404, '23:00:00 exact expired capability cannot respond');
  check((await post(admin, 'invite', { teamId: imported.teams.find(team => team.external_team_id === 'SYNTH-065').id })).status() === 409, 'no issuance at exact cutoff');
  const final = (await snapshot(organizer)).counts;
  check(JSON.stringify([final.shortlisted, final.confirmed, final.declined, final.pending]) === JSON.stringify([75, 46, 15, 14]), 'final authoritative counts reconcile');
  checkpoints.push({ stage: 'cutoff', ...final });
  check(counts().batches === 1 && counts().teams === 75, 'no accidental reimport or roster overwrite');
  check(rawTokens.every(token => !nextLog.includes(token) && seenUrls.every(url => !url.includes(token)) && browserLogs.every(line => !line.includes(token))), 'no raw bearer in HTTP URLs, retained logs or browser console');
  check(errors.length === 0 && unexpected.length === 0, 'no runtime errors, external browser calls or unexpected adapter requests');
  const evidence = { baseCommit: git('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(), parserSha256: offline.parserSha256,
    mode: 'Actual Next routes and browser UI; existing synthetic Auth/PostgREST adapter; real disposable PostgreSQL; local-only SQL clock fixture',
    teamCount: 75, participantCount: 112, checks, checkpoints, generatedInitially: 75, explicitRecoveryReissues: 1,
    realMessagesSent: 0, simulatedHandoffs: 74, simulatedUnknownOutcomes: 1, ratePauses, issuanceSeconds,
    totalSeconds: Number(((Date.now() - started) / 1000).toFixed(1)), productionChanges: false, persistedBearerValues: false,
    limits: ['No real Supabase Auth/PostgREST or production-readiness claim', 'No real provider delivery/receipt or sender-capacity test', 'Human identity and official grouping require organizer approval'] };
  fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('PASS: ' + checks + ' checks, 75 synthetic teams, actual UI/SQL journey; zero real messages.');
 } catch (error) {
  fs.writeFileSync(path.join(out, 'sanitized-failure.txt'), redact(error.stack || error.message));
  throw new Error('Local rehearsal failed; sanitized details retained under test-results/hustle-csv-rehearsal.');
 } finally {
  if (browser) await browser.close();
  if (next) { next.kill(); await new Promise(resolve => { if (next.exitCode !== null) return resolve(); next.once('exit', resolve); setTimeout(resolve, 5000); }); }
  if (stub) await new Promise(resolve => stub.close(resolve));
  await db.close();
 }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
