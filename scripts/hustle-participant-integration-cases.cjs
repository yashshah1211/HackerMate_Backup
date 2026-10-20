/* eslint-disable @typescript-eslint/no-require-imports -- Called only by the isolated real Supabase test runner. */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
module.exports=async function participants({sql,request,url,anon,service,accounts,origin,BASE,API,check,browser,secrets,REPO}){
 assert(['127.0.0.1','localhost'].includes(new URL(url).hostname));
 const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
 const rpc=(who,name,args={})=>request(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:anon,...(who?{Authorization:'Bearer '+accounts[who].token}:{}),'Content-Type':'application/json'},body:JSON.stringify(args)});
 const api=(who,action,body={},cookie)=>request(origin+API+'/'+action,{method:'POST',headers:{...(who?{Authorization:'Bearer '+accounts[who].token}:{}),Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 const row=(id,leader,member)=>({external_team_id:id,team_name:'Synthetic '+id,leader_name:'Synthetic '+leader,leader_email:accounts[leader].email,leader_whatsapp:null,second_member_name:member?'Synthetic '+member:null,second_member_email:member?accounts[member].email:null});
 const rows=[row('SYNTH-ACCOUNT-PAIR','leader','member'),row('SYNTH-ACCOUNT-SOLO','solo'),row('SYNTH-ACCOUNT-DECLINE','decliner','late')];
 const imported=sql(`SET ROLE service_role;SELECT hustle_phase2_import('${accounts.admin.id}','${'e'.repeat(64)}',${quote(JSON.stringify(rows))});`);check(JSON.parse(imported.split(/\r?\n/).at(-1)).imported===3,'Real RPC contract creates five distinct official identity slots');
 sql("CREATE TABLE public.account_fixture_clock(value timestamptz);INSERT INTO account_fixture_clock VALUES('2026-10-23T04:30:00Z');CREATE FUNCTION public.account_fixture_now() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$SELECT value FROM public.account_fixture_clock$$;");
 // Explicit disposable-only clock, never present in the candidate migration.
 const responseDefinition=sql("SELECT pg_get_functiondef('public.hustle_phase2_respond(text,text)'::regprocedure)");sql(responseDefinition.replaceAll('clock_timestamp()','public.account_fixture_now()'));
 const batch=JSON.parse(imported.split(/\r?\n/).at(-1)).batchId;
 check((await rpc('leader','hustle_phase2_claim')).status===403,'Real Auth cannot claim inactive official batch');
 sql(`SET ROLE service_role;SELECT hustle_phase2_activate('${accounts.admin.id}','${batch}','${'e'.repeat(64)}')`);
 const tokens={},hashes={},cookies={};
 for(const [who,id]of [['leader','SYNTH-ACCOUNT-PAIR'],['solo','SYNTH-ACCOUNT-SOLO'],['decliner','SYNTH-ACCOUNT-DECLINE']]){
  tokens[who]=crypto.randomBytes(32).toString('base64url');secrets.push(tokens[who]);hashes[who]=crypto.createHash('sha256').update(tokens[who]).digest('hex');
  sql(`SET ROLE service_role;SELECT hustle_phase2_invite('${accounts.admin.id}',(SELECT id FROM hustle_phase2_teams WHERE external_team_id='${id}'),'${hashes[who]}')`);
  const staged=await request(origin+API+'/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:tokens[who]})});
  check(staged.status===200,'Guest stages pending context only: '+who);cookies[who]=staged.headers.get('set-cookie').split(';')[0];secrets.push(cookies[who]);check(!cookies[who].includes(tokens[who])&&/SameSite=lax/i.test(staged.headers.get('set-cookie')),'Signed hash handoff, no raw bearer, OAuth-compatible cookie');
 }
 check((await request(origin+BASE,{headers:{Cookie:cookies.leader}})).status===401,'Real server private read still requires account after staging');
 check((await api(null,'respond',{decision:'confirmed'},cookies.leader)).status===401,'Guest cannot respond with valid context');
 check((await api('unrelated','claim',{},cookies.leader)).status===403,'Unrelated real account cannot claim stolen invitation');
 check((await api('leader','claim',{actorId:accounts.member.id},cookies.leader)).status===400,'Forged client identity is rejected');
 const leader=await api('leader','claim',{},cookies.leader);check(leader.status===200&&leader.data.role==='leader'&&!leader.data.fully_onboarded,'Verified leader claims exact slot while member absent');
 check((await api('leader','respond',{decision:'confirmed'},cookies.leader)).data.status==='ok','Actual server confirms with member absent');
 check((await api('leader','respond',{decision:'confirmed'},cookies.leader)).data.status==='ok','Actual server response idempotency');
 check((await api('leader','respond',{decision:'declined'},cookies.leader)).status===409,'Actual server conflicting response denied');
 const member=await api('member','claim');check(member.status===200&&member.data.role==='member'&&member.data.fully_onboarded&&member.data.decision==='confirmed','Later member verification completes onboarding without changing attendance');
 check((await rpc('member','hustle_phase2_respond',{p_hash:hashes.leader,p_decision:'declined'})).status===403,'Direct PostgREST member cannot respond');
 check((await api('member','respond',{decision:'declined'},cookies.leader)).status===403,'Actual route member cannot respond using leader context');
 check((await api('solo','claim',{},cookies.solo)).data.fully_onboarded===true,'Real solo account completes onboarding');
 check((await api('decliner','claim',{},cookies.decliner)).status===200,'Real second leader verified');
 check((await api('decliner','respond',{decision:'declined'},cookies.decliner)).data.decision==='declined','Leader may decline before teammate signup');
 sql("UPDATE account_fixture_clock SET value='2026-10-24T04:30:00Z'");
  check(sql('SELECT hustle_phase2_window(account_fixture_now())')==='closed','Disposable attendance clock is after cutoff');
 check((await api('late','claim')).data.decision==='declined','Late second-member signup has no invented cutoff and preserves decline');
 const closed=await api('solo','respond',{decision:'confirmed'},cookies.solo);
 check([404,409].includes(closed.status),'Attendance deadline/expired invitation after onboarding: HTTP '+closed.status);
 sql("UPDATE account_fixture_clock SET value='2026-10-23T04:30:00Z'");
 for(const [column,value,reset]of [['email_confirmed_at','NULL','now()'],['is_anonymous','true','false']]){sql(`UPDATE auth.users SET ${column}=${value} WHERE id='${accounts.leader.id}'`);check((await rpc('leader','hustle_phase2_participant')).status===403,'Real Auth row rejects '+column);check((await api('leader','claim',{},cookies.leader)).status===403,'Server rejects '+column);sql(`UPDATE auth.users SET ${column}=${reset} WHERE id='${accounts.leader.id}'`);}
 for(const [column,value,reset]of [['is_banned','true','false'],['is_banned','NULL','false'],['onboarding_completed','false','true']]){sql(`UPDATE profiles SET ${column}=${value} WHERE id='${accounts.leader.id}'`);check((await rpc('leader','hustle_phase2_participant')).status===403,'Database profile gate '+column+' '+value);const r=await api('leader','claim',{},cookies.leader);check([403,428].includes(r.status),'Server profile gate '+column+' '+value);sql(`UPDATE profiles SET ${column}=${reset} WHERE id='${accounts.leader.id}'`);}
 sql(`DELETE FROM profiles WHERE id='${accounts.noProfile.id}'`);check((await api('noProfile','claim')).status===403,'Real missing profile denies before binding');
 for(const who of [null,'unrelated']){const denied=await rpc(who,'hustle_phase2_inspect',{p_hash:hashes.leader});check([401,403].includes(denied.status)||(who===null&&denied.status===404&&denied.data.code==='PGRST202'),'Anonymous/unrelated cannot inspect direct RPC');}
 const legacy=await request(url+'/rest/v1/rpc/hustle_phase2_respond',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({p_hash:hashes.leader,p_decision:'confirmed'})});check(legacy.status===403,'Legacy service-role token-only RPC denied');
 check((await rpc('leader','hustle_phase2_claim',{p_hash:hashes.solo})).status===403,'Wrong-team invitation fails closed');
 for(const who of ['leader','member']){const own=await rpc(who,'hustle_phase2_participant');check(own.status===200&&!own.text.includes('@')&&!own.text.includes(accounts[who==='leader'?'member':'leader'].id),'Minimal authorized projection for '+who);}
 fs.mkdirSync(path.join(REPO,'test-results/participant-accounts'),{recursive:true});
 for(const width of [390,1440]){
  const ctx=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',extraHTTPHeaders:{Authorization:'Bearer '+accounts.leader.token}});let external=0;const consoleText=[];
  await ctx.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external++;return route.abort();});
  await ctx.addCookies([{name:'hm_hustle_p2_account',value:cookies.leader.split('=')[1],url:origin,httpOnly:true,sameSite:'Lax'}]);
  const page=await ctx.newPage();page.on('console',m=>consoleText.push(m.text()));await page.goto(origin+BASE);await page.getByRole('heading',{name:'Round 2 team account and attendance',exact:true}).waitFor();
  check((await page.content()).includes('Fully verified')&&(await page.content()).includes('confirmed'),'Real participant browser independent states '+width);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Participant mobile/desktop layout '+width);
  check(!page.url().includes(tokens.leader)&&!page.url().includes(hashes.leader),'Browser URL contains no invitation secret '+width);
  check(!JSON.stringify(await page.evaluate(()=>({...localStorage,...sessionStorage}))).includes(tokens.leader),'No raw invitation in browser storage '+width);
  check(!consoleText.join('\n').includes(tokens.leader)&&external===0,'No external requests or raw bearer console '+width);
  await page.screenshot({path:path.join(REPO,'test-results/participant-accounts/leader-'+width+'.png'),fullPage:true});await ctx.close();
 }
 // Generic member entry and expired handoff recovery never need a token-bearing URL.
 const guest=await browser.newContext({serviceWorkers:'block'});await guest.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await guest.newPage();await page.goto(origin+BASE+'/invite#'+tokens.leader);await page.getByRole('button',{name:'Continue securely'}).click();await page.waitForURL(origin+BASE);check(!page.url().includes(tokens.leader),'Real guest exchange clears fragment and reaches login prompt');const href=await page.getByRole('link',{name:'Sign up / Sign in with HackerMate'}).getAttribute('href');check(href==='/login?next='+encodeURIComponent(BASE),'Fixed secret-free signup/login return URL');await guest.close();
 const lost=await request(origin+BASE,{headers:{Authorization:'Bearer '+accounts.leader.token,Cookie:'hm_hustle_p2_account=invalid'}});check(lost.status===410&&!lost.text.includes('Synthetic SYNTH-ACCOUNT'),'Lost context fails closed without private team details');
 sql(`UPDATE hustle_phase2_invites SET revoked_at=now() WHERE token_hash='${hashes.leader}'`);check((await api('leader','respond',{decision:'confirmed'},cookies.leader)).status===404,'Revoked invite rejected with existing generic invalid-invitation contract');check((await rpc('leader','hustle_phase2_inspect',{p_hash:hashes.leader})).status===403,'Revoked invite cannot inspect');
 sql(`UPDATE hustle_phase2_invites SET revoked_at=NULL,expires_at=now()-interval '1 second' WHERE token_hash='${hashes.leader}'`);check((await rpc('leader','hustle_phase2_inspect',{p_hash:hashes.leader})).status===403,'Expired invite cannot inspect');
 const logout=await request(url+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+accounts.member.token}});check(logout.status===204,'Real GoTrue member logout');check((await rpc('member','hustle_phase2_participant')).status===403,'Revoked unexpired member JWT denied by direct PostgREST');check([401,403].includes((await api('member','claim')).status),'Revoked member denied by server');
};
