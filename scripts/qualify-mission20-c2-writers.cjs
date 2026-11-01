/* eslint-disable @typescript-eslint/no-require-imports -- Explicit local adapter-to-PostgreSQL qualification. */
const assert=require('node:assert/strict'),path=require('node:path');
const {main}=require('./qualify-mission20-c1-postgres.cjs');
const {extension:c1}=require('./qualify-mission20-c1-writers.cjs');
const api=require('./ppt-vision-harness.cjs').harness().load('src/lib/writers.ts');
const extension={setup:c1.setup,async qualify(c){
 await c1.qualify(c);
 const {admin,session,identity,uid,passed,run,connection,SQL,ROOT}=c;
 for(const file of [path.join(SQL,'00-freeze-admission.proposed.sql'),path.join(ROOT,'docs/qa/mission20-c2/sql/01-cancel.proposed.sql'),path.join(SQL,'06-unfreeze-admission.proposed.sql')])
   run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1','-f',file]);
 await admin.query(`ALTER TABLE public.team_hackathons ENABLE ROW LEVEL SECURITY;
  CREATE POLICY c2_link_read ON public.team_hackathons FOR SELECT TO authenticated USING(true);
  CREATE POLICY c2_link_delete ON public.team_hackathons FOR DELETE TO authenticated USING(public.is_team_owner(team_id));
  GRANT SELECT,DELETE ON public.team_hackathons TO authenticated;
  INSERT INTO public.teams(id,name,owner_id,max_members) VALUES('${uid(9901)}','Synthetic adapter team','${uid(9501)}',20);
  INSERT INTO public.team_members(team_id,user_id,role) VALUES('${uid(9901)}','${uid(9501)}','owner'),('${uid(9901)}','${uid(9502)}','member');
  INSERT INTO public.hackathons(id,name,type,status,archived,organizer_id,min_team_size,max_team_size,max_participants,registration_start,registration_end,end_date)
   VALUES('${uid(9902)}','Synthetic adapter event','native','approved',false,'${uid(9501)}',1,20,1,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days');`);
 let serial=0;const calls=[];
 const parameters={register_native_hackathon:['p_hackathon_id','p_team_id','p_reviewed_unknown'],mission20_set_project_role:['p_team_id','p_member_id','p_role'],
  mission20_remove_team_member:['p_team_id','p_member_id'],mission20_delete_team:['p_team_id'],mission20_cancel_registration:['p_event_id','p_registration_id'],delete_user_completely:['p_target_user_id']};
 const literal=value=>value===null?'NULL':typeof value==='boolean'?String(value):"'"+String(value).replaceAll("'","''")+"'";
 function client(actor){return {auth:{getSession:async()=>({data:{session:{user:{id:uid(actor)},access_token:'fixture-token'}},error:null}),
  getUser:async token=>{assert.equal(token,'fixture-token');return {data:{user:{id:uid(actor)}},error:null};}},
  from(){throw Error('Adapter must never fall back to raw writes');},
  rpc(name,args){assert(parameters[name]);return {setHeader(key,value){assert.equal(key,'Authorization');assert.equal(value,'Bearer fixture-token');return this;},retry(enabled){assert.equal(enabled,false);return this;},abortSignal(){return this;},
   then(resolve,reject){return (async()=>{const db=session('c2_adapter_'+ ++serial);calls.push(name);
    try{await db.query(identity(actor));const value=await db.query(`SELECT public.${name}(${parameters[name].map(key=>literal(args[key])).join(',')});`);
      return {data:name==='register_native_hackathon'?JSON.parse(value):name==='delete_user_completely'?null:value,error:null};
    }catch(error){const match=error.message.match(/ERROR:\s+([A-Z0-9]{5}):\s*([^\r\n]+)/);assert(match,error.message);return {data:null,error:{code:match[1],message:match[2]}};}
    finally{await db.close();}})().then(resolve,reject);}};}};}
 const owner=client(9501),member=client(9502),adminClient=client(9500);
 const args={p_hackathon_id:uid(9902),p_team_id:uid(9901),p_reviewed_unknown:false};
 const first=api.nativeResult(await api.writerRpc(owner,'register_native_hackathon',args,uid(9501)));
 assert.equal(first.status,'confirmed');assert.equal(first.alreadyRegistered,false);
 const retry=api.nativeResult(await api.writerRpc(owner,'register_native_hackathon',args,uid(9501)));assert.equal(retry.alreadyRegistered,true);
 const full=api.nativeResult(await api.writerRpc(member,'register_native_hackathon',{...args,p_team_id:null},uid(9502)));assert.equal(full.status,'waitlisted');
 passed('C2 typed adapter preserves actual database confirmed/waitlisted/idempotent results without raw INSERT');
 const memberId=await admin.query(`SELECT id FROM public.team_members WHERE team_id='${uid(9901)}' AND user_id='${uid(9502)}';`);
 await api.setProjectRole(owner,uid(9901),memberId,'Backend Developer',uid(9501));
 await assert.rejects(api.setProjectRole(member,uid(9901),memberId,'Forged',uid(9502)),e=>e.status===403);
 assert.equal(await admin.query(`SELECT project_role FROM public.team_members WHERE id='${memberId}';`),'Backend Developer');
 passed('C2 role adapter has faithful owner UPDATE success and nonowner denial under column grant/RLS');
 const registration=await admin.query(`SELECT id FROM public.hackathon_registrations WHERE hackathon_id='${uid(9902)}' AND user_id='${uid(9501)}';`);
 await admin.query(`INSERT INTO public.team_hackathons(team_id,hackathon_id) VALUES('${uid(9901)}','${uid(9902)}');
  CREATE FUNCTION public.c2_reject_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
   IF current_setting('hm.reject_cancel',true)='on' AND OLD.id='${registration}' THEN RAISE EXCEPTION 'synthetic cancellation failure'; END IF; RETURN OLD; END; $$;
  CREATE TRIGGER c2_reject_cancel BEFORE DELETE ON public.hackathon_registrations FOR EACH ROW EXECUTE FUNCTION public.c2_reject_cancel();`);
 // Inject failure in the RPC session after linkage DELETE, never in production.
 const fail=client(9501);const original=fail.rpc;
 fail.rpc=(name,values)=>{const q=original(name,values);if(name!=='mission20_cancel_registration')return q;
  q.then=(resolve,reject)=>{const db=session('c2_cancel_failure');return (async()=>{
   try{await db.query(`${identity(9501)} SET hm.reject_cancel='on';`);await db.query(`SELECT public.mission20_cancel_registration('${uid(9902)}','${registration}');`);throw Error('Expected synthetic rejection');}
   catch(error){assert.match(error.message,/P0001/);return {data:null,error:{code:'P0001',message:'synthetic cancellation failure'}};}finally{await db.close();}})().then(resolve,reject);};return q;};
 await assert.rejects(api.cancelRegistration(fail,uid(9902),registration,uid(9501)),e=>e.status===409);
 assert.equal(await admin.query(`SELECT (SELECT count(*) FROM public.team_hackathons WHERE team_id='${uid(9901)}')+
  (SELECT count(*) FROM public.hackathon_registrations WHERE id='${registration}');`),'2');
 passed('C2 cancellation RPC failure rolls back both linkage and registration');
 await assert.rejects(api.cancelRegistration(member,uid(9902),registration,uid(9502)),e=>e.status===503);
 await api.cancelRegistration(owner,uid(9902),registration,uid(9501));
 assert.equal(await admin.query(`SELECT count(*) FROM public.team_hackathons WHERE team_id='${uid(9901)}';`),'0');
 assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE id='${registration}';`),'0');
 passed('C2 cancellation binds own registration/event identity and confirms atomic unlink/deletion');
 await admin.query(`INSERT INTO public.teams(id,name,owner_id) VALUES('${uid(9911)}','Synthetic cancellation race','${uid(9501)}');
  INSERT INTO public.hackathons(id,name,type,status,archived,organizer_id,min_team_size,max_team_size,max_participants,registration_start,registration_end,end_date)
   VALUES('${uid(9910)}','Synthetic race','native','approved',false,'${uid(9501)}',1,20,1,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days');
  ${identity(9501)} SELECT public.register_native_hackathon('${uid(9910)}','${uid(9911)}'); RESET ROLE;
  INSERT INTO public.team_hackathons(team_id,hackathon_id) VALUES('${uid(9911)}','${uid(9910)}');`);
 const raceId=await admin.query(`SELECT id FROM public.hackathon_registrations WHERE hackathon_id='${uid(9910)}';`);
 const cancel=session('c2_cancel_race'),join=session('c2_join_race');
 await cancel.query(`${identity(9501)} BEGIN; SELECT public.mission20_cancel_registration('${uid(9910)}','${raceId}');`);
 await join.query(`SET application_name='c2_join_race'; ${identity(9514)} BEGIN;`);
 const joining=join.query(`SELECT public.register_native_hackathon('${uid(9910)}')->>'status';`);
 await c.blocked('c2_join_race');await cancel.query('COMMIT;');assert.equal(await joining,'confirmed');await join.query('COMMIT;');
 await cancel.close();await join.close();
 assert.equal(await admin.query(`SELECT count(*) FROM public.team_hackathons WHERE team_id='${uid(9911)}';`),'0');
 passed('C2 atomic cancellation serializes simultaneous last-seat admission and releases linkage/slot together');
 await api.removeTeamMember(owner,uid(9901),memberId,uid(9501));
 assert.equal(await admin.query(`SELECT count(*) FROM public.conversation_participants WHERE conversation_id=(SELECT id FROM public.conversations WHERE team_id='${uid(9901)}') AND user_id='${uid(9502)}';`),'0');
 await api.deleteTeam(adminClient,uid(9901),uid(9500));
 assert.equal(await admin.query(`SELECT count(*) FROM public.conversations WHERE team_id='${uid(9901)}';`),'0');
 passed('C2 remove/admin-delete adapters retain confirmed policies and conversation CASCADE semantics');
 await assert.rejects(api.deleteAccount(member,uid(9515),uid(9502)),e=>e.status===403);
 await api.deleteAccount(adminClient,uid(9515),uid(9500));
 assert.equal(await admin.query(`SELECT count(*) FROM auth.users WHERE id='${uid(9515)}';`),'0');
 passed('C2 account adapter preserves canonical admin denial/success and exact void confirmation');
 assert(calls.every(name=>Object.hasOwn(parameters,name)));
}};
module.exports={extension};
if(require.main===module)main(extension).catch(error=>{console.error(error.stack);process.exitCode=1;});
