/* eslint-disable @typescript-eslint/no-require-imports -- Opt-in fresh local PostgreSQL writer qualification. */
const assert=require('node:assert/strict'),path=require('node:path');
const {main}=require('./qualify-mission20-c1-postgres.cjs');
const {definition}=require('./mission20-c1-writer-proposals.cjs');
const safe=promise=>promise.then(value=>({value}),error=>({error}));
const extension={
  async setup({admin,run,connection,SQL,passed}) {
    run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1','-f',path.join(SQL,'09-writer-fixture.review.sql')]);
    const core='supabase/migrations/202607020001_core_security.sql';
    for(const name of ['public.accept_team_invite','public.accept_team_join_request']) await admin.query(definition(core,name));
    await admin.query(definition('supabase/migrations/20260928100000_phase1a_definer_function_privileges.sql','public.add_user_to_team','$function$'));
    await admin.query(definition('supabase/migrations/202607070001_ensure_team_conversation.sql','public.ensure_team_conversation'));
    await admin.query(`REVOKE ALL ON FUNCTION public.add_user_to_team(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
      REVOKE ALL ON FUNCTION public.accept_team_invite(uuid),public.accept_team_join_request(uuid),public.ensure_team_conversation(uuid) FROM PUBLIC,anon,service_role;
      GRANT EXECUTE ON FUNCTION public.accept_team_invite(uuid),public.accept_team_join_request(uuid),public.ensure_team_conversation(uuid) TO authenticated;
      ALTER TABLE public.team_invites ADD FOREIGN KEY(team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
      ALTER TABLE public.team_join_requests ADD FOREIGN KEY(team_id) REFERENCES public.teams(id) ON DELETE CASCADE;`);
    passed('confirmed conversation/member CASCADE graph and reviewed trigger behaviors loaded before comparator races');
  },
  async qualify(c) {
    const {admin,run,connection,SQL,session,uid,identity,passed,blocked}=c;
    // Apply only inside this owned local cluster. Freeze stays in place while
    // replacing writers; no deployed adapter or operational receipt is implied.
    for(const file of ['00-freeze-admission.proposed.sql','07-writer-protocol.proposed.sql','08-existing-writers.proposed.sql'])
      run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1','-f',path.join(SQL,file)]);
    await admin.query(`${identity(9501)} SELECT public.fixture_error('SELECT public.register_native_hackathon(''${uid(9701)}'')','P0001','writer installation retains admission freeze'); RESET ROLE;`);
    run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1','-f',path.join(SQL,'06-unfreeze-admission.proposed.sql')]);
    passed('freeze retained through both writer proposals; local fixture unfreezes only after structural gate');
    let n=9800;
    async function team(owner=9501,members=[9501,9502]) {
      const id=++n;
      await admin.query(`INSERT INTO public.teams(id,name,owner_id,max_members) VALUES('${uid(id)}','Synthetic writer team','${uid(owner)}',20);
        INSERT INTO public.team_members(team_id,user_id,role) VALUES ${members.map(u=>`('${uid(id)}','${uid(u)}','${u===owner?'owner':'member'}')`).join(',')};`);
      return id;
    }
    async function event(actor=9501,teamId=null) {
      const id=++n;
      await admin.query(`INSERT INTO public.hackathons(id,name,type,status,archived,organizer_id,min_team_size,max_team_size,max_participants,registration_start,registration_end,end_date)
        VALUES('${uid(id)}','Synthetic writer event','native','approved',false,'${uid(9501)}',1,20,1,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days');`);
      if(actor) await admin.query(`${identity(actor)} SELECT public.register_native_hackathon('${uid(id)}',${teamId?`'${uid(teamId)}'`:'NULL'}); RESET ROLE;`);
      return id;
    }
    const memberId=(t,u)=>`(SELECT id FROM public.team_members WHERE team_id='${uid(t)}' AND user_id='${uid(u)}')`;
    const remove=(t,u)=>`SELECT public.mission20_remove_team_member('${uid(t)}',${memberId(t,u)});`;
    async function gone(t) {
      assert.equal(await admin.query(`SELECT (SELECT count(*) FROM public.teams WHERE id='${uid(t)}')+
        (SELECT count(*) FROM public.team_members WHERE team_id='${uid(t)}')+
        (SELECT count(*) FROM public.hackathon_registrations WHERE team_id='${uid(t)}')+
        (SELECT count(*) FROM public.conversations WHERE team_id='${uid(t)}')+
        (SELECT count(*) FROM matchmaking.team_feature WHERE team_id='${uid(t)}');`),'0');
    }
    async function chatMatches(t) {
      assert.equal(await admin.query(`SELECT NOT EXISTS((SELECT user_id FROM public.team_members WHERE team_id='${uid(t)}'
        EXCEPT SELECT p.user_id FROM public.conversation_participants p JOIN public.conversations c ON c.id=p.conversation_id WHERE c.team_id='${uid(t)}')
        UNION ALL (SELECT p.user_id FROM public.conversation_participants p JOIN public.conversations c ON c.id=p.conversation_id WHERE c.team_id='${uid(t)}'
        EXCEPT SELECT user_id FROM public.team_members WHERE team_id='${uid(t)}'));`),'t');
    }
    await admin.query(`SELECT public.fixture_assert((SELECT count(*)=6 FROM pg_constraint WHERE confdeltype='c' AND
      conname IN('team_members_team_id_fkey','team_members_user_id_fkey','hackathon_registrations_team_id_fkey',
      'conversations_team_id_fkey','conversation_participants_conversation_id_fkey','conversation_participants_user_id_fkey')),'six founder-confirmed FK actions modeled');
      SELECT public.fixture_assert(NOT has_function_privilege('authenticated','mission20_private.transfer_members(jsonb)','EXECUTE'),'transfer is not a new client capability');
      SELECT public.fixture_assert(NOT has_function_privilege('authenticated','mission20_private.lock_team_parents(uuid[])','EXECUTE'),'unscoped parent helper private');
      SELECT public.fixture_assert(NOT has_function_privilege('authenticated','public.add_user_to_team(uuid,uuid,text)','EXECUTE'),'existing add-member helper remains private');`);
    passed('confirmed FK catalog plus private helper/transfer negative EXECUTE privileges');

    const authTeam=await team();
    await admin.query(`${identity(9502)} SELECT public.fixture_error($q$${remove(authTeam,9501)}$q$,'42501','member cannot remove owner'); RESET ROLE;
      ${identity(9503)} SELECT public.fixture_error($q$${remove(authTeam,9502)}$q$,'42501','outsider cannot remove member'); RESET ROLE;
      ${identity(9502)} SELECT public.fixture_error('SELECT public.mission20_delete_team(''${uid(authTeam)}'')','42501','member cannot delete team'); RESET ROLE;
      ${identity(9502)} SELECT public.fixture_error($q$SELECT public.mission20_set_project_role('${uid(authTeam)}',${memberId(authTeam,9502)},'Tester')$q$,'42501','nonowner UPDATE denied'); RESET ROLE;
      ${identity(9501)} SELECT public.mission20_set_project_role('${uid(authTeam)}',${memberId(authTeam,9502)},'Tester'); RESET ROLE;
      SELECT public.fixture_assert(NOT has_column_privilege('authenticated','public.team_members','team_id','UPDATE'),'team identity UPDATE remains denied');
      ${identity(9502)} ${remove(authTeam,9502)} RESET ROLE;`);
    await chatMatches(authTeam);
    passed('confirmed owner project-role UPDATE succeeds; nonowner and identity-column UPDATE remain denied; self leave syncs chat');
    const adminTeam=await team();
    await admin.query(`${identity(9500)} SELECT public.mission20_delete_team('${uid(adminTeam)}'); RESET ROLE;`);
    await gone(adminTeam);passed('confirmed nonowner administrator DELETE policy succeeds with full conversation CASCADE');

    // Exactly the old residual order: parent held before legacy raw child DML.
    const rawTeam=await team();await event(9501,rawTeam);
    const a=session('protocol_parent'),b=session('legacy_child');
    await a.query(`BEGIN; SELECT id FROM public.teams WHERE id='${uid(rawTeam)}' FOR UPDATE;`);
    await b.query(`${identity(9502)} BEGIN;`);
    const started=Date.now(),raw=await safe(b.query(`DELETE FROM public.team_members WHERE team_id='${uid(rawTeam)}' AND user_id='${uid(9502)}';`));
    assert.match(raw.error?.message||'',/55P03/);assert(Date.now()-started<2000,'legacy conflict is fail-fast');
    assert.equal(await admin.query(`SELECT count(*) FROM public.team_members WHERE team_id='${uid(rawTeam)}';`),'2');
    await a.query(`DELETE FROM public.teams WHERE id='${uid(rawTeam)}'; COMMIT;`);await gone(rawTeam);
    await a.close();await b.close();
    passed('old residual raw DELETE schedule returns immediate 55P03, rolls back child and allows full team/chat CASCADE');

    const wrappedTeam=await team();
    const wa=session('wrapped_parent'),wb=session('wrapped_child');
    await wa.query(`BEGIN; SELECT id FROM public.teams WHERE id='${uid(wrappedTeam)}' FOR UPDATE;`);
    await wb.query(`SET application_name='wrapped_child'; ${identity(9502)} BEGIN;`);
    const wrapped=safe(wb.query(remove(wrappedTeam,9502)));await blocked('wrapped_child');
    await wa.query(`DELETE FROM public.teams WHERE id='${uid(wrappedTeam)}'; COMMIT;`);
    assert.match((await wrapped).error?.message||'',/55P03/);await gone(wrappedTeam);
    await wa.close();await wb.close();
    passed('writer pre-lock waits before child DML; disappearing parent returns retry instead of residual 40P01');

    const reverseTeam=await team();
    const ra=session('member_first'),rb=session('delete_second');
    await ra.query(`${identity(9502)} BEGIN; ${remove(reverseTeam,9502)}`);
    await rb.query(`SET application_name='delete_second'; ${identity(9501)} BEGIN;`);
    const reverse=safe(rb.query(`SELECT public.mission20_delete_team('${uid(reverseTeam)}');`));await blocked('delete_second');
    await ra.query('COMMIT;');const result=await reverse;if(result.error)throw result.error;await rb.query('COMMIT;');await gone(reverseTeam);
    await ra.close();await rb.close();
    passed('reverse member-delete then team-delete schedule commits both, with exact conversation cleanup');

    const chatTeam=await team(),conversationId=await admin.query(`SELECT id FROM public.conversations WHERE team_id='${uid(chatTeam)}';`);
    const ca=session('participant_edit'),cd=session('participant_cascade');
    // Physical lock schedule of the existing cleared_at UPDATE. No new CP grant
    // or policy is proposed; this fixture session is a trusted SQL-role writer.
    await ca.query(`BEGIN; UPDATE public.conversation_participants SET cleared_at=clock_timestamp() WHERE conversation_id='${conversationId}' AND user_id='${uid(9502)}';`);
    await cd.query(`SET application_name='participant_cascade'; ${identity(9501)} BEGIN;`);
    const clearing=safe(cd.query(`SELECT public.mission20_delete_team('${uid(chatTeam)}');`));await blocked('participant_cascade');
    await ca.query('COMMIT;');const clearResult=await clearing;if(clearResult.error)throw clearResult.error;await cd.query('COMMIT;');
    assert.equal(await admin.query(`SELECT count(*) FROM public.conversation_participants WHERE conversation_id='${conversationId}';`),'0');
    await gone(chatTeam);await ca.close();await cd.close();
    passed('direct participant UPDATE versus team CASCADE waits without inversion and removes every participant');

    const timeoutTeam=await team(),timeoutConv=await admin.query(`SELECT id FROM public.conversations WHERE team_id='${uid(timeoutTeam)}';`);
    const ct=session('participant_timeout_hold'),dt=session('participant_timeout_delete');
    await ct.query(`BEGIN; UPDATE public.conversation_participants SET cleared_at=clock_timestamp() WHERE conversation_id='${timeoutConv}' AND user_id='${uid(9502)}';`);
    await dt.query(`SET application_name='participant_timeout_delete'; ${identity(9501)} BEGIN;`);
    const timeoutStarted=Date.now(),deleting=safe(dt.query(`SELECT public.mission20_delete_team('${uid(timeoutTeam)}');`));
    await blocked('participant_timeout_delete');assert.match((await deleting).error?.message||'',/55P03/);
    assert(Date.now()-timeoutStarted<5500,'participant conflict has bounded per-lock failure');
    assert.equal(await admin.query(`SELECT (SELECT count(*) FROM public.team_members WHERE team_id='${uid(timeoutTeam)}')+
      (SELECT count(*) FROM public.conversation_participants WHERE conversation_id='${timeoutConv}');`),'4');
    await ct.query('COMMIT;');await ct.close();await dt.close();
    await admin.query(`${identity(9501)} SELECT public.mission20_delete_team('${uid(timeoutTeam)}'); RESET ROLE;`);await gone(timeoutTeam);
    passed('participant lock timeout returns 55P03 with full cascade rollback; explicit retry succeeds after release');

    const inviteTeam=await team(9501,[9501]),invite=++n;
    await admin.query(`INSERT INTO public.team_invites(id,team_id,invited_user_id,status) VALUES('${uid(invite)}','${uid(inviteTeam)}','${uid(9502)}','pending');
      ${identity(9502)} SELECT public.accept_team_invite('${uid(invite)}'); RESET ROLE;`);
    await chatMatches(inviteTeam);
    const request=++n;
    await admin.query(`INSERT INTO public.team_join_requests(id,team_id,user_id,status) VALUES('${uid(request)}','${uid(inviteTeam)}','${uid(9503)}','pending');
      ${identity(9501)} SELECT public.accept_team_join_request('${uid(request)}'); SELECT public.ensure_team_conversation('${uid(inviteTeam)}'); RESET ROLE;`);
    await chatMatches(inviteTeam);
    passed('original invite/request authorization and add-member helper retained; conversation participation stays unique');

    const queuedInviteTeam=await team(9501,[9501]),queuedInvite=++n;
    await admin.query(`INSERT INTO public.team_invites(id,team_id,invited_user_id,status) VALUES('${uid(queuedInvite)}','${uid(queuedInviteTeam)}','${uid(9502)}','pending');`);
    const ia=session('invite_parent'),ib=session('invite_child');
    await ia.query(`BEGIN; SELECT id FROM public.teams WHERE id='${uid(queuedInviteTeam)}' FOR UPDATE;`);
    await ib.query(`SET application_name='invite_child'; ${identity(9502)} BEGIN;`);
    const accepting=safe(ib.query(`SELECT public.accept_team_invite('${uid(queuedInvite)}');`));await blocked('invite_child');
    await ia.query(`DELETE FROM public.teams WHERE id='${uid(queuedInviteTeam)}'; COMMIT;`);
    assert.match((await accepting).error?.message||'',/55P03/);await gone(queuedInviteTeam);await ia.close();await ib.close();
    passed('invitation acceptance waits before invitation tuple lock, allowing parent CASCADE to finish');

    const admitTeam=await team(),admitEvent=await event(null);
    const na=session('registration_parent'),nb=session('raw_join');
    await na.query(`${identity(9501)} BEGIN; SELECT public.register_native_hackathon('${uid(admitEvent)}','${uid(admitTeam)}');`);
    const rawJoin=await safe(nb.query(`INSERT INTO public.team_members(team_id,user_id,role) VALUES('${uid(admitTeam)}','${uid(9503)}','member');`));
    assert.match(rawJoin.error?.message||'',/55P03/);
    const nc=session('raw_project_role');
    const rawRole=await safe(nc.query(`UPDATE public.team_members SET project_role='Synthetic tester' WHERE team_id='${uid(admitTeam)}' AND user_id='${uid(9502)}';`));
    assert.match(rawRole.error?.message||'',/55P03/);
    assert.equal(await admin.query(`SELECT project_role IS NULL FROM public.team_members WHERE team_id='${uid(admitTeam)}' AND user_id='${uid(9502)}';`),'t');
    await na.query('COMMIT;');await chatMatches(admitTeam);
    await na.close();await nb.close();await nc.close();
    passed('legacy raw membership INSERT/UPDATE conflicting with native admission fails 55P03 without chat/cache partial writes');

    const x=await team(9501,[9501,9502,9504]),y=await team(9501,[9501,9503,9505]);
    const moves=(items)=>JSON.stringify(items.map(([from,to,user])=>({from_team:uid(from),to_team:uid(to),user_id:uid(user)}))).replaceAll("'","''");
    const ba=session('bulk_a'),bb=session('bulk_b');
    await ba.query(`BEGIN; SELECT mission20_private.transfer_members('${moves([[x,y,9502],[y,x,9503]])}');`);
    await bb.query("SET application_name='bulk_b'; BEGIN;");
    const bulk=safe(bb.query(`SELECT mission20_private.transfer_members('${moves([[y,x,9505],[x,y,9504]])}');`));await blocked('bulk_b');
    await ba.query('COMMIT;');const bulkResult=await bulk;if(bulkResult.error)throw bulkResult.error;await bb.query('COMMIT;');
    await chatMatches(x);await chatMatches(y);await ba.close();await bb.close();
    assert.equal(await admin.query(`SELECT count(*) FROM public.team_members WHERE (team_id,user_id) IN(('${uid(y)}','${uid(9502)}'),('${uid(x)}','${uid(9503)}'),('${uid(y)}','${uid(9504)}'),('${uid(x)}','${uid(9505)}'));`),'4');
    passed('opposite-order bulk transfers pre-lock complete sorted parent sets, retain payloads and synchronize both chats');

    const isolation=session('writer_isolation');
    await isolation.query('BEGIN ISOLATION LEVEL REPEATABLE READ;');
    const isolated=await safe(isolation.query(`SELECT mission20_private.transfer_members('${moves([[y,x,9502]])}');`));
    assert.match(isolated.error?.message||'',/25000/);await isolation.close();await chatMatches(x);await chatMatches(y);
    passed('writer protocol rejects stale-snapshot isolation before membership mutation');

    const cpHold=session('participant_transfer_hold'),cpMove=session('participant_transfer_move');
    await cpHold.query(`BEGIN; UPDATE public.conversation_participants SET cleared_at=clock_timestamp()
      WHERE conversation_id=(SELECT id FROM public.conversations WHERE team_id='${uid(y)}') AND user_id='${uid(9502)}';`);
    await cpMove.query("SET application_name='participant_transfer_move'; BEGIN;");
    const cpTransfer=safe(cpMove.query(`SELECT mission20_private.transfer_members('${moves([[y,x,9502]])}');`));await blocked('participant_transfer_move');
    await cpHold.query('COMMIT;');const cpResult=await cpTransfer;if(cpResult.error)throw cpResult.error;await cpMove.query('COMMIT;');
    await chatMatches(x);await chatMatches(y);await cpHold.close();await cpMove.close();
    passed('direct participant UPDATE versus bulk transfer serializes actual participant DELETE/INSERT hooks');

    await admin.query(`CREATE FUNCTION public.fixture_reject_participant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('hm.reject_participant',true)='on' THEN RAISE EXCEPTION 'synthetic participant rejection'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER fixture_reject_participant BEFORE INSERT ON public.conversation_participants FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_participant();
      SET hm.reject_participant='on';
      SELECT public.fixture_error('SELECT mission20_private.transfer_members(''${moves([[x,y,9502]])}'')','P0001','participant error rolls back entire transfer');
      SET hm.reject_participant='off';`);
    await chatMatches(x);await chatMatches(y);
    assert.equal(await admin.query(`SELECT team_id FROM public.team_members WHERE user_id='${uid(9502)}' AND team_id IN('${uid(x)}','${uid(y)}');`),uid(x));
    passed('conversation participant failure aborts membership transfer and matchmaking changes atomically');

    const cancelTeam=await team(),cancelEvent=await event(9501,cancelTeam);
    const ea=session('event_first'),eb=session('legacy_cancel');
    await ea.query(`BEGIN; SELECT id FROM public.hackathons WHERE id='${uid(cancelEvent)}' FOR UPDATE;`);
    await eb.query(`${identity(9501)} BEGIN;`);
    const cancellation=await safe(eb.query(`DELETE FROM public.hackathon_registrations WHERE hackathon_id='${uid(cancelEvent)}';`));
    assert.match(cancellation.error?.message||'',/55P03/);await ea.query('ROLLBACK;');
    assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(cancelEvent)}';`),'1');
    await admin.query(`${identity(9501)} DELETE FROM public.hackathon_registrations WHERE hackathon_id='${uid(cancelEvent)}'; RESET ROLE;
      ${identity(9502)} SELECT public.register_native_hackathon('${uid(cancelEvent)}'); RESET ROLE;`);
    assert.equal(await admin.query(`SELECT user_id FROM public.hackathon_registrations WHERE hackathon_id='${uid(cancelEvent)}' AND status='confirmed';`),uid(9502));
    await ea.close();await eb.close();
    passed('legacy cancellation under event contention is bounded 55P03; explicit retry releases the row slot');

    // Successor profile is a late lock in the existing deletion RPC. NOWAIT
    // bounds that inversion instead of waiting behind an admitting successor.
    const owned=await team(9507,[9507,9508]),nonowned=await team(9501,[9501,9507,9509]),empty=await team(9507,[9507]);
    const targetEvent=await event(9507,owned),successorEvent=await event(null);
    const sa=session('successor_admit'),sd=session('delete_target');
    await sa.query(`${identity(9508)} BEGIN; SELECT public.register_native_hackathon('${uid(successorEvent)}');`);
    await sd.query(`${identity(9500)} BEGIN;`);
    const deletion=await safe(sd.query(`SELECT public.delete_user_completely('${uid(9507)}');`));
    assert.match(deletion.error?.message||'',/55P03/);
    assert.match(deletion.error.message,/Original SQLSTATE: 55P03/,'NOWAIT conflict, not a concealed 40P01');
    assert.equal(await admin.query(`SELECT count(*) FROM auth.users WHERE id='${uid(9507)}';`),'1');
    assert.equal(await admin.query(`SELECT owner_id FROM public.teams WHERE id='${uid(owned)}';`),uid(9507));
    await sa.query('COMMIT;');await sa.close();await sd.close();
    passed('user deletion versus successor admission returns bounded 55P03 and rolls back ownership/account/chat changes');

    const hold=session('nonowned_registration'),del=session('delete_retry');
    const holdEvent=await event(null);
    await hold.query(`${identity(9501)} BEGIN; SELECT public.register_native_hackathon('${uid(holdEvent)}','${uid(nonowned)}');`);
    await del.query(`SET application_name='delete_retry'; ${identity(9500)} BEGIN;`);
    const deleteRetry=safe(del.query(`SELECT public.delete_user_completely('${uid(9507)}');`));await blocked('delete_retry');
    await hold.query('COMMIT;');const deleted=await deleteRetry;if(deleted.error)throw deleted.error;await del.query('COMMIT;');
    await hold.close();await del.close();await gone(empty);await chatMatches(owned);await chatMatches(nonowned);
    assert.equal(await admin.query(`SELECT count(*) FROM auth.users WHERE id='${uid(9507)}';`),'0');
    assert.equal(await admin.query(`SELECT owner_id FROM public.teams WHERE id='${uid(owned)}';`),uid(9508));
    assert.equal(await admin.query(`SELECT count(*) FROM public.conversation_participants WHERE user_id='${uid(9507)}';`),'0');
    assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(targetEvent)}';`),'0');
    assert.equal(await admin.query(`SELECT count(*) FROM public.deleted_user_logs WHERE user_id='${uid(9507)}';`),'1');
    passed('user deletion pre-locks NON-owned team, transfers owner, removes empty team and cascades account/registrations/chat with audit');

    const auditTeam=await team(9510,[9510]);
    await admin.query(`CREATE FUNCTION public.fixture_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.user_id='${uid(9510)}' THEN RAISE EXCEPTION 'synthetic audit rejection'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER fixture_reject_audit BEFORE INSERT ON public.deleted_user_logs FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_audit();
      ${identity(9500)} SELECT public.fixture_error('SELECT public.delete_user_completely(''${uid(9510)}'')','P0001','swallowed audit insert still makes RPC fail'); RESET ROLE;`);
    assert.equal(await admin.query(`SELECT count(*) FROM auth.users WHERE id='${uid(9510)}';`),'1');await chatMatches(auditTeam);
    assert.equal(await admin.query(`SELECT count(*) FROM matchmaking.team_feature WHERE team_id='${uid(auditTeam)}';`),'1');
    await admin.query(`${identity(9502)} SELECT public.fixture_error('SELECT public.delete_user_completely(''${uid(9510)}'')','42501','ordinary caller cannot delete another user'); RESET ROLE;`);
    passed('existing admin/storage/audit boundary retained: failed audit rolls back team/chat/cache and ordinary caller is denied');

    await admin.query(`INSERT INTO storage.objects(owner) VALUES('${uid(9511)}');
      ${identity(9500)} SELECT public.fixture_error('SELECT public.delete_user_completely(''${uid(9511)}'')','P0001','owned storage still blocks deletion'); RESET ROLE;
      UPDATE public.profiles SET role='admin' WHERE id='${uid(9512)}';
      ${identity(9500)} SELECT public.fixture_error('SELECT public.delete_user_completely(''${uid(9512)}'')','42501','protected admin deletion still denied'); RESET ROLE;
      SELECT public.fixture_assert(NOT has_function_privilege('service_role','public.delete_user_completely(uuid)','EXECUTE'),'canonical deletion remains unavailable to service role');`);
    assert.equal(await admin.query(`SELECT count(*) FROM auth.users WHERE id IN('${uid(9511)}','${uid(9512)}');`),'2');
    passed('storage blocker, protected administrator and canonical authenticated-only EXECUTE boundary preserved');
  },
};
module.exports={extension};
if(require.main===module)main(extension).catch(error=>{console.error(error.stack);process.exitCode=1;});
