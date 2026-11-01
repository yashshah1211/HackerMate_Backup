/* eslint-disable @typescript-eslint/no-require-imports -- Deterministic review-only SQL generation. */
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const base='f7845bc5993a8145782b1d614c62a391c1012081';
const read=file=>cp.execFileSync('git',['show',base+':'+file],{encoding:'utf8'}).replace(/\r/g,'');
function definition(file,name,delimiter='$$'){
  const text=read(file),start=text.toLowerCase().indexOf('create or replace function '+name.toLowerCase());
  const fallback=text.toLowerCase().indexOf('create function '+name.toLowerCase());
  const pos=start<0?fallback:start;assert(pos>=0,name);
  const open=text.indexOf(delimiter,pos),end=text.indexOf(delimiter+';',open+delimiter.length);
  assert(open>pos && end>open,name);return text.slice(pos,end+delimiter.length+1);
}
const block=text=>`\n  -- M20 LOCK BEGIN\n${text}\n  -- M20 LOCK END\n`;
const bound=text=>text.replace(/\nAS \$\$/i,()=>"\nSET lock_timeout='3s' SET statement_timeout='15s'\nAS $$");
let deletion=definition('supabase/migrations/202610060001_restore_safe_user_deletion.sql','public.delete_user_completely');
deletion=bound(deletion).replace('  v_audit_count bigint;','  v_audit_count bigint;'+block('  v_team_ids uuid[];'));
deletion=deletion.replace('  FOR v_team IN',block(`  -- Include NON-owned memberships and team-linked registrations before any child
  -- DML or Auth cascade. The existing caller/target identity locks stay first.
  SELECT array_agg(id ORDER BY id) INTO v_team_ids FROM (
    SELECT id FROM public.teams WHERE owner_id=p_target_user_id
    UNION SELECT team_id FROM public.team_members WHERE user_id=p_target_user_id
    UNION SELECT team_id FROM public.hackathon_registrations WHERE user_id=p_target_user_id AND team_id IS NOT NULL
  ) affected;
  PERFORM mission20_private.lock_team_parents(coalesce(v_team_ids,'{}'));
  -- One sorted union: do not lock separate event subsets in different orders.
  PERFORM h.id FROM public.hackathons h WHERE EXISTS(
    SELECT 1 FROM public.hackathon_registrations r WHERE r.hackathon_id=h.id
      AND (r.user_id=p_target_user_id OR r.team_id=ANY(v_team_ids))) ORDER BY h.id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.teams t WHERE t.owner_id=p_target_user_id AND NOT(t.id=ANY(coalesce(v_team_ids,'{}'))))
    OR EXISTS(SELECT 1 FROM public.team_members m WHERE m.user_id=p_target_user_id AND NOT(m.team_id=ANY(coalesce(v_team_ids,'{}')))) THEN
    RAISE EXCEPTION 'membership_scope_changed_retry' USING ERRCODE='55P03';
  END IF;`)+ '  FOR v_team IN');
deletion=deletion.replace('LIMIT 1 FOR UPDATE OF m, p;','LIMIT 1 FOR UPDATE OF m, p NOWAIT;');
deletion=deletion.replace(/\nEND;\n\$\$;$/,()=>block(`EXCEPTION WHEN deadlock_detected OR lock_not_available THEN
  -- Preserve rollback and expose a bounded retryable failure, never success.
  RAISE EXCEPTION 'team_write_retry' USING ERRCODE='55P03', DETAIL='Original SQLSTATE: '||SQLSTATE;`)+'END;\n$$;');

const core='supabase/migrations/202607020001_core_security.sql';
let invite=definition(core,'public.accept_team_invite');
invite=bound(invite).replace('  select i.team_id, t.name',block(`  select i.team_id into v_team_id from public.team_invites i
  where i.id=p_invite_id and i.invited_user_id=v_user_id and i.status='pending';
  if v_team_id is null then raise exception 'Pending invitation not found'; end if;
  perform mission20_private.lock_team_parents(ARRAY[v_team_id]);
  v_team_id:=null;`)+ '  select i.team_id, t.name');
let request=definition(core,'public.accept_team_join_request');
request=bound(request).replace('  select r.team_id, r.user_id',block(`  select r.team_id into v_team_id from public.team_join_requests r join public.teams t on t.id=r.team_id
  where r.id=p_request_id and r.status='pending' and t.owner_id=auth.uid();
  if v_team_id is null then raise exception 'Pending request not found or not authorized'; end if;
  perform mission20_private.lock_team_parents(ARRAY[v_team_id]);
  v_team_id:=null;`)+ '  select r.team_id, r.user_id');
let conversation=definition('supabase/migrations/202607070001_ensure_team_conversation.sql','public.ensure_team_conversation');
conversation=bound(conversation).replace('  -- Try to find',block(`  PERFORM mission20_private.lock_team_parents(ARRAY[p_team_id]);
  IF NOT public.is_team_member(p_team_id) THEN RAISE EXCEPTION 'Access denied'; END IF;`)+ '  -- Try to find');
let guard=definition('docs/qa/mission20-c1/sql/01-expand.proposed.sql','mission20_private.guard_registration_write');
assert(guard.includes('WHERE h.id = OLD.hackathon_id FOR UPDATE;'));
guard=guard.replace('WHERE h.id = OLD.hackathon_id FOR UPDATE;','WHERE h.id = OLD.hackathon_id FOR UPDATE NOWAIT;');
guard=guard.replace(/^CREATE FUNCTION/,'CREATE OR REPLACE FUNCTION');
const result=`-- REVIEW ONLY. Generated complete writer prototypes; never an active migration.\n-- Source: ${base}; regenerate/check with scripts/mission20-c1-writer-proposals.cjs.\n-- No caller/target/owner/protection/storage/audit checks removed. No ACL changes\n-- for existing functions: CREATE OR REPLACE preserves their existing grants.\nBEGIN;\nDO $$ BEGIN\n IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hackathon_registrations' AND policyname='mission20_release_freeze')\n OR to_regprocedure('mission20_private.lock_team_parents(uuid[])') IS NULL THEN\n  RAISE EXCEPTION 'frozen_writer_protocol_required'; END IF;\nEND; $$;\n${[invite,request,conversation,deletion,guard].join('\n\n')}\nCOMMIT;\n`;
const file='docs/qa/mission20-c1/sql/08-existing-writers.proposed.sql';
if(require.main===module){
  if(process.argv.includes('--check')){assert.equal(fs.readFileSync(file,'utf8').replace(/\r/g,''),result);console.log('Existing-writer proposal matches immutable sources and explicit lock insertions.');}
  else if(process.argv.includes('--write'))fs.writeFileSync(file,result);
  else process.stdout.write(result);
}
module.exports={definition,base};
