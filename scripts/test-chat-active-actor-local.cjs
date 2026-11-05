/* eslint-disable @typescript-eslint/no-require-imports -- Actual installed-equivalent SQL in a disposable localhost cluster only. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const {workspaceFixture,OWNER,MEMBER,BANNED,TEAM}=require('./mission03-workspace-db.cjs');
const installedFunctions=[...require('./fixtures/chat-installed-functions.json'),...require('./fixtures/chat-installed-extra-functions.json')];
const installedPolicies=require('./fixtures/chat-installed-policies.json');
const TEAM_CHAT='30000000-0000-4000-8000-000000000001',DM='30000000-0000-4000-8000-000000000002';
test('chat authorization requires a currently active protected profile',async t=>{
  const db=await workspaceFixture();
  try{
    db.reset();
    db.sql(`CREATE TABLE conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text,team_id uuid UNIQUE);
      CREATE TABLE conversation_participants(conversation_id uuid,user_id uuid,cleared_at timestamptz,PRIMARY KEY(conversation_id,user_id));
      CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conversation_id uuid,sender_id uuid,content text,created_at timestamptz DEFAULT now(),is_read boolean DEFAULT false,is_pinned boolean DEFAULT false,reply_to_id uuid,mentions uuid[]);
      CREATE TABLE blocked_users(blocker_id uuid,blocked_id uuid);
      GRANT SELECT ON conversations,conversation_participants,messages TO authenticated;
      ALTER TABLE messages ENABLE ROW LEVEL SECURITY;`);
    const optimized=db.read('20260902232500_optimize_chat_rls_and_inbox.sql');
    db.sql(optimized.slice(optimized.indexOf('DROP POLICY'),optimized.indexOf('-- 4.')));
    db.sql(db.read('202608180005_allow_media_domains_in_messages.sql'));
    db.sql(db.read('202607070001_ensure_team_conversation.sql'));
    db.sql(db.read('202608180003_message_reactions.sql'));
    db.sql(db.read('202608180004_single_reaction_per_user.sql'));
    db.sql(db.read('202608180006_delete_message_rpc.sql'));
    db.sql('ALTER FUNCTION delete_message(uuid) SET search_path=public,pg_temp;ALTER FUNCTION toggle_message_reaction(uuid,text) SET search_path=public,pg_temp;');
    const core=db.read('202607020001_core_security.sql');
    db.sql('CREATE TABLE friend_requests(sender_id uuid,receiver_id uuid,status text);');
    db.sql(core.slice(core.indexOf('create or replace function public.get_or_create_dm'),core.indexOf('create or replace function public.send_message(')));
    db.sql('REVOKE ALL ON FUNCTION get_or_create_dm(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION get_or_create_dm(uuid) TO authenticated;');
    // Replay reviewed production metadata, not newer unapplied repository SQL.
    for(const row of installedFunctions){
      db.sql(row.definition);
      db.sql(`REVOKE ALL ON FUNCTION public.${row.signature} FROM PUBLIC,anon,authenticated,service_role;`);
      if(row.auth_exec)db.sql(`GRANT EXECUTE ON FUNCTION public.${row.signature} TO authenticated;`);
      if(row.service_exec)db.sql(`GRANT EXECUTE ON FUNCTION public.${row.signature} TO service_role;`);
    }
    for(const table of ['messages','message_reactions','conversations','conversation_participants'])db.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    for(const policy of installedPolicies.policies){
      assert.match(policy.policyname,/^[a-z_]+$/);assert.deepEqual(policy.roles,['authenticated']);
      db.sql(`DROP POLICY IF EXISTS ${policy.policyname} ON ${policy.tablename};CREATE POLICY ${policy.policyname} ON ${policy.tablename} FOR ${policy.cmd} TO authenticated${policy.qual?' USING('+policy.qual+')':''}${policy.with_check?' WITH CHECK('+policy.with_check+')':''};`);
    }
    db.sql(`INSERT INTO conversations VALUES('${TEAM_CHAT}','team','${TEAM}'),('${DM}','dm',NULL);
      INSERT INTO conversation_participants(conversation_id,user_id) VALUES('${TEAM_CHAT}','${MEMBER}'),('${TEAM_CHAT}','${BANNED}'),('${DM}','${BANNED}'),('${DM}','${OWNER}');
      INSERT INTO messages(conversation_id,sender_id,content) VALUES('${TEAM_CHAT}','${OWNER}','Synthetic team secret'),('${DM}','${OWNER}','Synthetic DM secret');`);
    db.sql(`INSERT INTO friend_requests VALUES('${OWNER}','${BANNED}','accepted'),('${OWNER}','${MEMBER}','accepted');`);
    const files=fs.readdirSync(path.join(db.ROOT,'supabase/migrations')).filter(f=>f.endsWith('_chat_active_actor_boundary.sql'));
    if(process.env.CHAT_ACTOR_BASELINE!=='1')for(const file of files)db.sql(db.read(file));
    await t.test('unfiltered participant identity move cannot acquire a private DM',()=>{
      assert.equal(db.as(MEMBER,`SELECT can_access_conversation('${DM}');`),'f');
      try{
        // No WHERE or column RETURNING: do not accidentally rely on SELECT RLS.
        assert.throws(()=>db.as(MEMBER,`UPDATE conversation_participants SET conversation_id='${DM}';`),/row-level security/);
        assert.equal(db.as(MEMBER,`SELECT can_access_conversation('${DM}');`),'f');
        assert.equal(db.as(MEMBER,`SELECT count(*) FROM messages WHERE conversation_id='${DM}';`),'0');
        assert.equal(db.as(MEMBER,`WITH changed AS(UPDATE conversation_participants SET cleared_at=now() RETURNING 1)SELECT count(*) FROM changed;`),'1');
      }finally{
        db.sql(`DELETE FROM conversation_participants WHERE user_id='${MEMBER}';INSERT INTO conversation_participants(conversation_id,user_id)VALUES('${TEAM_CHAT}','${MEMBER}');`);
      }
    });
    await t.test('suspended team member cannot read messages or pass conversation helper',()=>{
      assert.equal(db.as(BANNED,'SELECT count(*) FROM messages;'),'0');
      assert.equal(db.as(BANNED,`SELECT can_access_conversation('${TEAM_CHAT}');`),'f');
    });
    await t.test('suspended actor cannot send through definer RPC',()=>{
      try{
        assert.throws(()=>db.as(BANNED,`SELECT send_message_with_mentions('${TEAM_CHAT}','Forbidden synthetic send',ARRAY[]::uuid[],NULL);`),/access denied/i);
        assert.equal(db.sql("SELECT count(*) FROM messages WHERE content='Forbidden synthetic send';"),'0');
      }finally{db.sql("DELETE FROM messages WHERE content='Forbidden synthetic send';");}
    });
    await t.test('suspended actor cannot obtain DM previews or ensure participants',()=>{
      assert.equal(db.as(BANNED,'SELECT count(*) FROM get_my_dm_conversations();'),'0');
      assert.throws(()=>db.as(BANNED,`SELECT ensure_team_conversation('${TEAM}');`),/access denied/i);
    });
    await t.test('active owner/member reads, sends, inbox shape and owner-without-roster remain compatible',()=>{
      assert.equal(db.as(OWNER,`SELECT can_access_conversation('${TEAM_CHAT}');`),'t');
      assert.equal(db.as(MEMBER,'SELECT count(*) FROM messages;'),'1');
      const sent=db.as(MEMBER,`SELECT send_message_with_mentions('${TEAM_CHAT}','Allowed synthetic send',ARRAY[]::uuid[],NULL);`);
      assert.match(sent,/^[a-f0-9-]{36}$/);
      assert.equal(db.as(OWNER,'SELECT count(*) FROM get_my_dm_conversations();'),'1');
      assert.equal(db.as(MEMBER,`SELECT ensure_team_conversation('${TEAM}');`),TEAM_CHAT);
      assert.equal(db.as(OWNER,`SELECT ensure_team_conversation('${TEAM}');`),TEAM_CHAT);
      assert.match(db.as(OWNER,`SELECT send_message_with_mentions('${TEAM_CHAT}','Owner synthetic send',ARRAY[]::uuid[],NULL);`),/^[a-f0-9-]{36}$/);
    });
    await t.test('active inbox preserves response shape, blocked peers and cleared timestamps',()=>{
      const row=JSON.parse(db.as(OWNER,'SELECT to_jsonb(d) FROM get_my_dm_conversations() d;'));
      assert.deepEqual(Object.keys(row).sort(),['conversation_id','last_message','last_message_at','other_user_id','unread_count']);
      assert.equal(row.conversation_id,DM);assert.equal(row.other_user_id,BANNED);assert.equal(row.last_message,'Synthetic DM secret');assert.equal(row.unread_count,0);
      db.sql(`INSERT INTO blocked_users VALUES('${OWNER}','${BANNED}');`);
      assert.equal(db.as(OWNER,'SELECT count(*) FROM get_my_dm_conversations();'),'0');
      db.sql(`DELETE FROM blocked_users;UPDATE conversation_participants SET cleared_at=now()+interval '1 day' WHERE user_id='${OWNER}' AND conversation_id='${DM}';`);
      const cleared=JSON.parse(db.as(OWNER,'SELECT to_jsonb(d) FROM get_my_dm_conversations() d;'));
      assert.equal(cleared.last_message,null);assert.equal(cleared.unread_count,0);
    });
    await t.test('suspension also denies definer deletion/reaction/DM setup and direct reaction DELETE',()=>{
      const own=db.sql(`INSERT INTO messages(conversation_id,sender_id,content) VALUES('${TEAM_CHAT}','${BANNED}','Synthetic own message') RETURNING id;`).split('\n')[0].trim();
      db.sql(`INSERT INTO message_reactions(message_id,user_id,emoji) VALUES('${own}','${BANNED}','x');`);
      assert.throws(()=>db.as(BANNED,`SELECT toggle_message_reaction('${own}','y');`),/access denied/i);
      assert.throws(()=>db.as(BANNED,`SELECT delete_message('${own}');`),/access denied/i);
      assert.throws(()=>db.as(BANNED,`SELECT get_or_create_dm('${OWNER}');`),/access denied/i);
      assert.equal(db.as(BANNED,'WITH gone AS(DELETE FROM message_reactions RETURNING 1)SELECT count(*) FROM gone;'),'0');
      assert.equal(db.sql(`SELECT count(*) FROM messages WHERE id='${own}';`),'1');
    });
    await t.test('active reaction response, own deletion and connected DM setup preserve compatibility',()=>{
      const own=db.sql(`INSERT INTO messages(conversation_id,sender_id,content) VALUES('${TEAM_CHAT}','${MEMBER}','Synthetic active own') RETURNING id;`).split('\n')[0].trim();
      for(const [emoji,action] of [['x','added'],['x','removed'],['y','added'],['y','removed']]){
        const value=JSON.parse(db.as(MEMBER,`SELECT toggle_message_reaction('${own}','${emoji}');`));
        assert.equal(value.success,true);assert.equal(value.action,action);
        assert.deepEqual(Object.keys(value).sort(),['action','emoji','message_id','success']);
      }
      assert.equal(db.as(MEMBER,`SELECT delete_message('${own}');`),'t');
      assert.match(db.as(MEMBER,`SELECT get_or_create_dm('${OWNER}');`),/^[a-f0-9-]{36}$/);
      assert.equal(db.sql("SELECT bool_and(proconfig @> ARRAY['search_path=public, pg_temp']) FROM pg_proc WHERE oid IN('delete_message(uuid)'::regprocedure,'toggle_message_reaction(uuid,text)'::regprocedure);"),'t');
    });
    await t.test('suspended receipts, pins and direct participant/conversation writes are denied',()=>{
      const id=db.sql(`SELECT id FROM messages WHERE content='Synthetic team secret';`);
      db.sql(`UPDATE messages SET is_read=false,is_pinned=false WHERE id='${id}';`);
      for(const rpc of [`mark_conversation_read('${TEAM_CHAT}')`,`pin_message('${id}')`,`unpin_message('${id}')`,`toggle_message_pin('${id}')`]){
        try{assert.throws(()=>db.as(BANNED,'SELECT '+rpc+';'),/access denied/i);}
        finally{db.sql(`UPDATE messages SET is_read=false,is_pinned=false WHERE id='${id}';`);}
      }
      assert.equal(db.as(BANNED,`WITH changed AS(UPDATE conversation_participants SET cleared_at=now() WHERE user_id='${BANNED}' RETURNING 1)SELECT count(*) FROM changed;`),'0');
      assert.throws(()=>db.as(BANNED,"INSERT INTO conversations(type) VALUES('dm');"),/row-level security/);
      assert.equal(db.as(BANNED,`SELECT is_conversation_participant('${TEAM_CHAT}');`),'f');
    });
    await t.test('active receipts, pins, mentions and plain send preserve existing contracts',()=>{
      const id=db.sql(`SELECT id FROM messages WHERE content='Synthetic team secret';`);
      db.as(MEMBER,`SELECT mark_conversation_read('${TEAM_CHAT}');`);
      assert.equal(db.sql(`SELECT is_read FROM messages WHERE id='${id}';`),'t');
      db.as(MEMBER,`SELECT pin_message('${id}');`);assert.equal(db.sql(`SELECT is_pinned FROM messages WHERE id='${id}';`),'t');
      db.as(MEMBER,`SELECT unpin_message('${id}');`);assert.equal(db.sql(`SELECT is_pinned FROM messages WHERE id='${id}';`),'f');
      assert.equal(db.as(MEMBER,`SELECT toggle_message_pin('${id}');`),'t');
      const sent=db.as(MEMBER,`SELECT send_message_with_mentions('${TEAM_CHAT}','Synthetic mention',ARRAY['${OWNER}']::uuid[],'${id}');`);
      assert.equal(db.sql(`SELECT sender_id='${MEMBER}' AND reply_to_id='${id}' AND mentions=ARRAY['${OWNER}']::uuid[] FROM messages WHERE id='${sent}';`),'t');
      assert.match(db.as(MEMBER,`SELECT send_message('${TEAM_CHAT}','Synthetic plain send',NULL);`),/^[a-f0-9-]{36}$/);
    });
    await t.test('active actors cannot forge sender/participant or delete another author',()=>{
      const id=db.sql(`SELECT id FROM messages WHERE content='Synthetic team secret';`);
      assert.throws(()=>db.as(MEMBER,`INSERT INTO messages(conversation_id,sender_id,content)VALUES('${TEAM_CHAT}','${OWNER}','Impersonated');`),/row-level security/);
      assert.equal(db.as(MEMBER,`WITH changed AS(UPDATE messages SET sender_id='${MEMBER}' WHERE id='${id}' RETURNING 1)SELECT count(*) FROM changed;`),'0');
      assert.throws(()=>db.as(MEMBER,`UPDATE conversation_participants SET user_id='00000000-0000-4000-8000-000000000005' WHERE user_id='${MEMBER}';`),/row-level security/);
      assert.throws(()=>db.as(MEMBER,`SELECT delete_message('${id}');`),/only delete your own/i);
      assert.equal(db.sql(`SELECT sender_id FROM messages WHERE id='${id}';`),OWNER);
    });
    await t.test('live null flag and membership removal are fail closed, service maintenance preserved',()=>{
      db.sql(`UPDATE profiles SET is_banned=NULL WHERE id='${MEMBER}';`);
      assert.equal(db.as(MEMBER,`SELECT can_access_conversation('${TEAM_CHAT}');`),'f');
      db.sql(`UPDATE profiles SET is_banned=false WHERE id='${MEMBER}';DELETE FROM team_members WHERE user_id='${MEMBER}';`);
      assert.equal(db.as(MEMBER,`SELECT can_access_conversation('${TEAM_CHAT}');`),'f');
      assert.equal(db.as(MEMBER,`SELECT is_conversation_participant('${TEAM_CHAT}');`),'f');
      assert.equal(db.as(MEMBER,`SELECT count(*) FROM messages WHERE conversation_id='${TEAM_CHAT}';`),'0');
      const own=db.sql(`INSERT INTO messages(conversation_id,sender_id,content) VALUES('${TEAM_CHAT}','${MEMBER}','Revoked own') RETURNING id;`).split('\n')[0].trim();
      assert.throws(()=>db.as(MEMBER,`SELECT delete_message('${own}');`),/access denied/i);
      assert.throws(()=>db.as(MEMBER,`SELECT toggle_message_reaction('${own}','revoked');`),/access denied/i);
      assert.equal(db.sql(`SELECT count(*) FROM message_reactions WHERE message_id='${own}';`),'0');
      assert.equal(db.as(MEMBER,`WITH changed AS(UPDATE conversation_participants SET cleared_at=now() WHERE conversation_id='${TEAM_CHAT}' RETURNING 1)SELECT count(*) FROM changed;`),'0');
      assert.equal(db.sql('SET ROLE service_role;SELECT count(*)>0 FROM messages;').split('\n').at(-1),'t');
      for(const file of files)db.sql(db.read(file));
    });
    await t.test('DM inbox cannot bypass revoked team access through a hybrid conversation',()=>{
      // Installed CHECK constrains type values but not type/team_id coherence.
      db.sql(`UPDATE conversations SET type='dm' WHERE id='${TEAM_CHAT}';`);
      try{
        assert.equal(db.as(MEMBER,`SELECT can_access_conversation('${TEAM_CHAT}');`),'f');
        assert.equal(db.as(MEMBER,`SELECT count(*) FROM get_my_dm_conversations() WHERE conversation_id='${TEAM_CHAT}';`),'0');
      }finally{db.sql(`UPDATE conversations SET type='team' WHERE id='${TEAM_CHAT}';`);}
    });
    await t.test('function ownership, ACLs and hardened settings remain unchanged',()=>{
      for(const row of installedFunctions){
        const signature='public.'+row.signature;
        assert.equal(db.sql(`SELECT pg_get_userbyid(proowner)=current_user FROM pg_proc WHERE oid='${signature}'::regprocedure;`),'t');
        assert.equal(db.sql(`SELECT has_function_privilege('anon','${signature}','EXECUTE');`),String(row.anon_exec?'t':'f'));
        assert.equal(db.sql(`SELECT has_function_privilege('authenticated','${signature}','EXECUTE');`),row.auth_exec?'t':'f');
        assert.equal(db.sql(`SELECT has_function_privilege('service_role','${signature}','EXECUTE');`),row.service_exec?'t':'f');
        assert.equal(db.sql(`SELECT proconfig=ARRAY['search_path=public, pg_temp'] FROM pg_proc WHERE oid='${signature}'::regprocedure;`),'t');
      }
    });
    await t.test('unknown/missing actor and anonymous execute fail closed across guarded paths',()=>{
      db.reset();db.sql(`INSERT INTO conversation_participants(conversation_id,user_id) VALUES('${TEAM_CHAT}','${MEMBER}'),('${DM}','${MEMBER}') ON CONFLICT DO NOTHING;`);
      for(const state of ['unknown','missing']){
        if(state==='unknown')db.sql(`UPDATE profiles SET is_banned=NULL WHERE id='${MEMBER}';`);
        else db.sql(`DELETE FROM profiles WHERE id='${MEMBER}';`);
        assert.equal(db.as(MEMBER,'SELECT count(*) FROM messages;'),'0');
        assert.equal(db.as(MEMBER,`SELECT can_access_conversation('${TEAM_CHAT}');`),'f');
        assert.equal(db.as(MEMBER,'SELECT count(*) FROM get_my_dm_conversations();'),'0');
        assert.throws(()=>db.as(MEMBER,`SELECT ensure_team_conversation('${TEAM}');`),/access denied/i);
        assert.throws(()=>db.as(MEMBER,`SELECT send_message_with_mentions('${TEAM_CHAT}','Unknown actor send',ARRAY[]::uuid[],NULL);`),/access denied/i);
      }
      assert.equal(db.sql(`SET ROLE authenticated;SET request.jwt.claim.sub='';SELECT can_access_conversation('${TEAM_CHAT}');`).split('\n').at(-1),'f');
      for(const signature of ['can_access_conversation(uuid)','get_my_dm_conversations()','ensure_team_conversation(uuid)'])assert.equal(db.sql(`SELECT has_function_privilege('anon','${signature}','EXECUTE');`),'f');
    });
    await t.test('new statement in an existing session observes suspension without refreshed identity',async()=>{
      db.reset();
      const writer=db.asyncSql(`BEGIN;SET ROLE authenticated;SET request.jwt.claim.sub='${MEMBER}';
        SELECT can_access_conversation('${TEAM_CHAT}');
        SELECT pg_sleep(1) /* chat_actor_suspension_wait */;
        SELECT count(*) FROM messages WHERE conversation_id='${TEAM_CHAT}';COMMIT;`);
      try{
        let waiting=false;const deadline=Date.now()+5000;
        while(Date.now()<deadline){
          waiting=db.sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='PgSleep' AND query LIKE '%chat_actor_suspension_wait%');")==='t';
          if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert(waiting,'existing actor session reaches the controlled pause');
        db.sql(`UPDATE profiles SET is_banned=true WHERE id='${MEMBER}';`);
        assert.equal((await writer).split('\n').at(-2).trim(),'0');
      }finally{await writer;db.sql(`UPDATE profiles SET is_banned=false WHERE id='${MEMBER}';`);}
    });
    await t.test('restrictive actor policies defeat additional permissive policies',()=>{
      const tables=['messages','message_reactions','conversations','conversation_participants'];
      try{
        for(const table of tables)db.sql(`CREATE POLICY fixture_extra_allow ON ${table} FOR ALL TO authenticated USING(true) WITH CHECK(true);`);
        for(const table of tables)assert.equal(db.as(BANNED,`SELECT count(*) FROM ${table};`),'0');
      }finally{for(const table of tables)db.sql(`DROP POLICY IF EXISTS fixture_extra_allow ON ${table};`);}
    });
    await t.test('unrelated active actor and removed DM participant cannot read or send',()=>{
      const stranger='00000000-0000-4000-8000-000000000005';
      assert.equal(db.as(stranger,'SELECT count(*) FROM messages;'),'0');
      assert.equal(db.as(stranger,'SELECT count(*) FROM conversations;'),'0');
      assert.throws(()=>db.as(stranger,`SELECT send_message_with_mentions('${TEAM_CHAT}','Foreign actor send',ARRAY[]::uuid[],NULL);`),/access denied/i);
      db.sql(`DELETE FROM conversation_participants WHERE user_id='${MEMBER}' AND conversation_id='${DM}';`);
      assert.equal(db.as(MEMBER,`SELECT can_access_conversation('${DM}');`),'f');
    });
    if(process.env.CHAT_ACTOR_BASELINE!=='1'){
      await t.test('metadata drift is rejected before permissions change',()=>{
        const definition=db.sql("SELECT pg_get_functiondef('can_access_conversation(uuid)'::regprocedure);");
        try{
          db.sql("CREATE OR REPLACE FUNCTION can_access_conversation(p_conversation_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT false $$;");
          assert.throws(()=>db.sql(db.read(files[0])),/metadata\/body drift/);
          assert.equal(db.sql("SELECT count(*) FROM pg_policies WHERE policyname IN('messages_active_actor','message_reactions_active_actor','conversations_active_actor','conversation_participants_active_actor');"),'4');
        }finally{db.sql(definition);}
      });
      await t.test('review-only rollback restores old behavior and forward reapply closes it again',()=>{
        db.sql(fs.readFileSync(path.join(db.ROOT,'docs/stabilization/rollback/20261105143908_chat_active_actor_boundary.sql'),'utf8'));
        assert.equal(db.as(BANNED,`SELECT can_access_conversation('${TEAM_CHAT}');`),'t');
        assert(Number(db.as(BANNED,`SELECT count(*) FROM messages WHERE conversation_id='${TEAM_CHAT}';`))>0);
        for(const file of files)db.sql(db.read(file));
        assert.equal(db.as(BANNED,'SELECT count(*) FROM messages;'),'0');
        assert.equal(db.as(OWNER,`SELECT can_access_conversation('${TEAM_CHAT}');`),'t');
      });
    }
  }finally{await db.close();}
});
