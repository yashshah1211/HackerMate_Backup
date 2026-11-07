/* eslint-disable @typescript-eslint/no-require-imports -- Real SQL and handlers in a newly allocated empty loopback cluster. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {createFixture}=require('./admin-hackathon-local-db.cjs');
const {setup,ID,OTHER}=require('./organizer-restore-harness.cjs');
const {harness}=require('./ppt-vision-harness.cjs');
const {NextRequest,NextResponse}=require('next/server');
const MIGRATION='20261107100402_scoped_organizer_lead_restore.sql';
const quote=v=>v===null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
const column=k=>{assert.match(k,/^[a-z_]+$/);return k;};

test('single-lead restore, real privileges, history, pagination and outreach in disposable PostgreSQL',async t=>{
  const db=await createFixture();
  try {
    db.sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;`);
    for(const file of ['202607210001_organizer_leads.sql','202607240001_add_open_tracking_to_organizer_leads.sql','202607240002_add_last_sent_to_organizer_leads.sql'])
      db.sql(fs.readFileSync(path.join(db.root,'supabase/migrations',file),'utf8'));
    db.sql(`GRANT USAGE ON SCHEMA public TO service_role;
      GRANT SELECT,UPDATE ON public.organizer_leads TO service_role;
      CREATE TABLE public.app_settings(key text PRIMARY KEY,value jsonb);
      INSERT INTO public.app_settings VALUES ('synthetic-recipient-claim','{"claimed":true}'),('synthetic-outreach-quota','{"used":5}');`);
    const migration=fs.readFileSync(path.join(db.root,'supabase/migrations',MIGRATION),'utf8');
    await t.test('migration failure rolls back function creation and ACL changes',()=>{
      assert.throws(()=>db.sql(migration.replace('TO service_role;','TO nonexistent_hm05_role;')),/does not exist/);
      assert.equal(db.sql("SELECT to_regprocedure('public.restore_organizer_lead(uuid)') IS NULL;"),'t');
    });
    db.sql(migration);
    db.sql(fs.readFileSync(path.join(db.root,'supabase/migrations/20261107075734_signed_organizer_email_open.sql'),'utf8'));
    const seed=(status='removed',sent=true,recipient=true)=>db.sql(`DELETE FROM public.organizer_leads;
      INSERT INTO public.organizer_leads(id,title,unstop_url,organizer_email,status,pitch_sent_at,last_sent_to,opened_at,open_count,notes,created_at,updated_at)
      VALUES ('${ID}','Synthetic selected','https://unstop.com/competitions/hm05-selected','selected@example.invalid',${quote(status)},${sent?"'2000-01-01Z'":'NULL'},${recipient?"'selected@example.invalid'":'NULL'},'2001-01-01Z',7,'[HACKERMATE_OUTREACH_APPROVED_V1]','1999-01-01Z','2002-01-01Z'),
      ('${OTHER}','Synthetic untouched','https://unstop.com/competitions/hm05-other','other@example.invalid','removed',NULL,NULL,NULL,0,'preserve notes','1999-01-01Z','2002-01-01Z');`);
    const snapshot=()=>JSON.parse(db.sql("SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.organizer_leads l;"));
    const claims=()=>db.sql("SELECT jsonb_agg(to_jsonb(s) ORDER BY key) FROM public.app_settings s;");
    const rpc=async id=>JSON.parse(await db.asyncSql(`SET ROLE service_role; SELECT public.restore_organizer_lead(${quote(id)}::uuid);`));
    const database={
      from(table){
        assert.equal(table,'organizer_leads','Restore and ineligible workers must never touch claims, quotas or another table');
        const filters=[];let limit,offset=0,single=false,selected='*';
        const q={
          select(value){selected=value||'*';return q;}, order(){return q;},
          eq(k,v){filters.push(`${column(k)}=${quote(v)}`);return q;},
          gt(k,v){filters.push(`${column(k)}>${quote(v)}`);return q;},
          is(k,v){assert.equal(v,null);filters.push(`${column(k)} IS NULL`);return q;},
          not(k,op,v){assert.equal(op,'is');assert.equal(v,null);filters.push(`${column(k)} IS NOT NULL`);return q;},
          or(value){assert.equal(value,'pitch_sent_at.not.is.null,last_sent_to.not.is.null,status.eq.email_outcome_unknown,status.eq.restored_review');filters.push("(pitch_sent_at IS NOT NULL OR last_sent_to IS NOT NULL OR status IN ('email_outcome_unknown','restored_review'))");return q;},
          limit(n){assert(Number.isInteger(n)&&n<=100);limit=n;return q;},
          range(a,b){offset=a;limit=b-a+1;assert(limit<=100);return q;},
          maybeSingle(){single=true;return q;},single(){single=true;return q;},
          then(resolve,reject){
            assert(selected==='*'||/^[a-z_, ]+$/.test(selected));
            return db.asyncSql(`SET ROLE service_role; SELECT COALESCE(jsonb_agg(r),'[]') FROM (SELECT ${selected} FROM public.organizer_leads${filters.length?' WHERE '+filters.join(' AND '):''} ORDER BY id${limit?' LIMIT '+limit:''} OFFSET ${offset}) r;`)
              .then(raw=>{const rows=JSON.parse(raw);return{data:single?rows[0]||null:rows,error:null};}).then(resolve,reject);
          },
        };return q;
      },
      async rpc(name,args){assert.equal(name,'restore_organizer_lead');assert.match(args.p_lead_id,/^[a-f0-9-]{36}$/);try{return{data:await rpc(args.p_lead_id),error:null};}catch{return{data:null,error:{message:'PRIVATE_SQL_DETAIL'}};}},
    };
    const api=setup({database});
    await t.test('PUBLIC, anon and authenticated lack EXECUTE; invoker empty path service only',()=>{
      for(const role of ['anon','authenticated']) {
        assert.equal(db.sql(`SELECT has_function_privilege('${role}','public.restore_organizer_lead(uuid)','EXECUTE');`),'f');
        assert.throws(()=>db.sql(`SET ROLE ${role}; SELECT public.restore_organizer_lead('${ID}');`),/permission denied for function/);
      }
      assert.equal(db.sql("SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.restore_organizer_lead(uuid)'::regprocedure AND a.grantee=0;"),'0');
      assert.equal(db.sql("SELECT NOT prosecdef AND proconfig=ARRAY['search_path=\"\"'] AND has_function_privilege('service_role',oid,'EXECUTE') FROM pg_proc WHERE oid='public.restore_organizer_lead(uuid)'::regprocedure;"),'t');
      db.sql("CREATE ROLE fixture_without_table_access; GRANT USAGE ON SCHEMA public TO fixture_without_table_access; GRANT EXECUTE ON FUNCTION public.restore_organizer_lead(uuid) TO fixture_without_table_access;");
      assert.throws(()=>db.sql(`SET ROLE fixture_without_table_access; SELECT public.restore_organizer_lead('${ID}');`),/permission denied for table organizer_leads/);
    });
    for(const [name,sent,recipient]of[['prior sending',true,true],['last recipient only',false,true],['uncertain history',false,false]])
      await t.test(name+' stays held with exact evidence and every other row preserved',async()=>{
        seed('removed',sent,recipient);const before=snapshot(),beforeClaims=claims();
        const response=await api.restore();assert.equal(response.status,200);const after=snapshot();
        assert.equal(after[0].status,'restored_review');assert.notEqual(after[0].updated_at,before[0].updated_at);
        const strip=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['status','updated_at'].includes(key)));
        assert.deepEqual(strip(after[0]),strip(before[0]));assert.deepEqual(after[1],before[1]);assert.equal(claims(),beforeClaims);
        assert.equal((await api.restore()).status,409);assert.deepEqual(snapshot(),after);
      });
    await t.test('missing, active, null and suppressed states never return restoration success',async()=>{
      for(const status of ['new','pitch_sent','archived','restored_review',null]){
        seed(status);const before=snapshot();assert.equal((await api.restore()).status,409);assert.deepEqual(snapshot(),before);
      }
      assert.equal((await api.restore({leadId:'00000000-0000-4000-8000-999999999999'})).status,404);
    });
    await t.test('concurrent restores produce exactly one success and preserve unrelated rows',async()=>{
      seed();const other=snapshot()[1];const results=await Promise.all(Array.from({length:8},()=>api.restore()));
      assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,7);assert.deepEqual(snapshot()[1],other);
    });
    await t.test('a concurrent CRM change wins before restore rechecks the row lock',async()=>{
      seed();const change=db.asyncSql(`SET application_name='hm05_fixture_race'; BEGIN; UPDATE public.organizer_leads SET status='archived' WHERE id='${ID}'; SELECT pg_sleep(0.8); COMMIT;`);
      try {
        const deadline=Date.now()+5000;
        while(db.sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='hm05_fixture_race' AND wait_event='PgSleep';")!=='1') {assert(Date.now()<deadline);await new Promise(r=>setTimeout(r,20));}
        assert.equal((await api.restore()).status,409);
      }finally{await change;}
      assert.equal(snapshot()[0].status,'archived');
    });
    await t.test('write failure rolls back, zero affected rows cannot fabricate success',async()=>{
      seed();const before=snapshot();
      db.sql("CREATE FUNCTION public.hm05_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PRIVATE_SQL_DETAIL'; END $$; CREATE TRIGGER hm05_fail BEFORE UPDATE ON public.organizer_leads FOR EACH ROW EXECUTE FUNCTION public.hm05_fail();");
      try {assert.equal((await api.restore()).status,500);assert.deepEqual(snapshot(),before);}
      finally{db.sql("DROP TRIGGER hm05_fail ON public.organizer_leads; DROP FUNCTION public.hm05_fail();");}
      db.sql("CREATE FUNCTION public.hm05_skip() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER hm05_skip BEFORE UPDATE ON public.organizer_leads FOR EACH ROW EXECUTE FUNCTION public.hm05_skip();");
      try {assert.equal((await api.restore()).status,409);assert.deepEqual(snapshot(),before);}
      finally{db.sql("DROP TRIGGER hm05_skip ON public.organizer_leads; DROP FUNCTION public.hm05_skip();");}
    });
    await t.test('held records survive signed/replayed/legacy pixels and both automated senders plus duplicate suppression',async()=>{
      for(const [sent,recipient] of [[true,true],[false,true],[false,false]]){
        seed('removed',sent,recipient);assert.equal((await api.restore()).status,200);
        db.sql(`UPDATE public.organizer_leads SET status='new',organizer_email='selected@example.invalid',notes='[HACKERMATE_OUTREACH_APPROVED_V1]' WHERE id='${OTHER}';`);
        const before=snapshot(),beforeClaims=claims();
        const h=harness({'next/server':{NextRequest,NextResponse},'@supabase/supabase-js':{createClient:()=>({async rpc(name,args){assert.equal(name,'record_organizer_email_open');await db.asyncSql(`SET ROLE service_role; SELECT public.record_organizer_email_open('${args.p_lead_id}');`);return{error:null};}})},
          '@/lib/emailDispatch':{dispatchEmail:async()=>{throw Error('Restored/suppressed recipient must not be sent');}},
          '@/lib/admin/emailBudgetGuard':{checkEmailBudget:async()=>{throw Error('No budget, quota or claims should be touched');}}});
        h.env.EMAIL_OPEN_TRACKING_SECRET='ab'.repeat(32);
        const pixel=h.load('src/lib/emailOpenTracking.ts').organizerTrackingPixel('https://fixture.example.invalid',ID);
        const url=pixel.match(/src="([^"]+)"/)[1].replaceAll('&amp;','&');
        for(const endpoint of [url,url,'https://fixture.example.invalid/api/webhooks/email-open?id='+ID])
          assert.equal((await h.load('src/app/api/webhooks/email-open/route.ts').GET(new NextRequest(endpoint))).status,200);
        assert.deepEqual(snapshot(),before);
        const automatic=await h.load('src/lib/admin/autoSendPitches.ts').autoSendPitchEmailsForLeads(database);
        assert.equal(automatic.attempted,0);assert.equal(automatic.blocked,undefined);
        assert.equal((await h.load('src/lib/admin/scheduledOrganizerOutreach.ts').runScheduledOrganizerOutreach(database)).status,'no_eligible');
        assert.deepEqual(snapshot(),before);assert.equal(claims(),beforeClaims);
      }
    });
    await t.test('authorized existing CRM status editing is a separate decision and retains history',async()=>{
      seed();await api.restore();const before=snapshot()[0];
      // Real status route with an adapter executing its actual update predicates.
      const editor=setup({database:{from(table){assert.equal(table,'organizer_leads');let payload,id;const q={update(v){payload=v;return q;},eq(k,v){assert.equal(k,'id');id=v;return q;},select(){return q;},async single(){
        assert.equal(id,ID);const set=Object.entries(payload).map(([k,v])=>column(k)+'='+quote(v)).join(',');
        return{data:JSON.parse(await db.asyncSql(`SET ROLE service_role; WITH changed AS(UPDATE public.organizer_leads SET ${set} WHERE id='${ID}' RETURNING *) SELECT to_jsonb(changed) FROM changed;`)),error:null};}};return q;}}});
      const response=await editor.load('src/app/api/admin/organizer-leads/update-status/route.ts').POST(new NextRequest('http://localhost/api/admin/organizer-leads/update-status',{method:'POST',body:JSON.stringify({leadId:ID,status:'replied',notes:'Synthetic reviewed note'})}));
      assert.equal(response.status,200);const after=snapshot()[0];assert.equal(after.status,'replied');assert.equal(after.pitch_sent_at,before.pitch_sent_at);assert.equal(after.last_sent_to,before.last_sent_to);
    });
    await t.test('keyset listing traverses 1137 removed rows once beyond default API limit',async()=>{
      db.sql(`DELETE FROM public.organizer_leads; INSERT INTO public.organizer_leads(id,title,unstop_url,status)
        SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Synthetic removed '||n,'https://example.invalid/hm05/'||n,'removed' FROM generate_series(1,1137) n;`);
      const expected=snapshot().map(row=>row.id),seen=[];let cursor=null,pages=0;
      do {
        const response=await api.browse(cursor?'?cursor='+cursor:'');assert.equal(response.status,200);
        const page=await response.json();assert(page.leads.length<=25);seen.push(...page.leads.map(row=>row.id));
        assert(!page.nextCursor||page.nextCursor!==cursor);cursor=page.nextCursor;pages++;assert(pages<100);
      }while(cursor);
      assert.equal(pages,46);assert.equal(new Set(seen).size,1137);assert.deepEqual(seen,expected);
    });
    assert.equal(api.state.sends,0);
  }finally{await db.close();}
});
