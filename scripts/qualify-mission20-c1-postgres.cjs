/* eslint-disable @typescript-eslint/no-require-imports -- Explicit, disposable local PostgreSQL qualification. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const {randomBytes}=require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const SQL = path.join(ROOT, 'docs/qa/mission20-c1/sql');
const env = {};
for (const key of ['PATH','SystemRoot','WINDIR','COMSPEC','USERPROFILE','LOCALAPPDATA','TEMP','TMP']) if (process.env[key]) env[key] = process.env[key];
let major = 18;
const binary = name => process.platform === 'win32' ? path.join(major===17&&fs.existsSync(path.join(ROOT,'scratch/pg17/bin/postgres.exe')) ? path.join(ROOT,'scratch/pg17/bin') : path.join(process.env.ProgramFiles || 'C:/Program Files', `PostgreSQL/${major}/bin`), name + '.exe')
  : major===17 ? path.join(fs.existsSync(path.join(ROOT,'scratch/pg17/bin/postgres')) ? path.join(ROOT,'scratch/pg17/bin') : '/usr/lib/postgresql/17/bin',name) : name;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let passes = 0;
function passed(label) { passes++; console.log('PASS: ' + label); }
function run(name, args) {
  const r = spawnSync(binary(name), args, { cwd: ROOT, env, windowsHide: true, encoding: 'utf8',
    timeout: 90000, maxBuffer: 8e6, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe' });
  if (r.error || r.status !== 0) throw Error(`${name}: ${r.error?.message || r.stderr || r.stdout}`);
  return r.stdout + (r.stderr || '');
}
function session(connection, label, sessions) {
  const child = spawn(binary('psql'), [...connection, '-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'], { cwd: ROOT, env, windowsHide: true, stdio: 'pipe' });
  let output = '', errors = '', waiter, count = 0, exited = false;
  const closed = new Promise(resolve => child.once('exit', code => { exited = true; waiter?.reject(Error(`${label} exited ${code}: ${errors}\n${output}`)); resolve(code); }));
  child.on('error', error => { errors += error.message; waiter?.reject(error); });
  child.stdout.on('data', chunk => { output += chunk.toString().replace(/\r/g,''); flush(); });
  child.stderr.on('data', chunk => { errors += chunk; });
  function flush() {
    if (!waiter) return;
    const index = output.indexOf(waiter.marker + '\n');
    if (index < 0) return;
    const result = output.slice(0, index).trim(); output = output.slice(index + waiter.marker.length + 1);
    const { resolve, timer } = waiter; waiter = null; clearTimeout(timer); resolve(result);
  }
  const api = {
    async query(sql) {
      assert(!waiter && !exited, 'one query at a time on a live fixture connection');
      const marker = `c1_barrier_${label}_${++count}`;
      return new Promise((resolve,reject) => {
        const timer = setTimeout(() => { child.kill(); reject(Error(label + ' timed out: ' + errors + '\n' + output)); }, 15000);
        waiter = { marker, resolve, reject: error => { clearTimeout(timer); waiter = null; reject(error); }, timer };
        child.stdin.write(sql + '\n\\echo ' + marker + '\n'); flush();
      });
    },
    async close() { if (!exited) child.stdin.end('\\q\n'); await closed; },
  };
  sessions.push(api); return api;
}
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const identity = n => `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${uid(n)}',false);`;

async function qualify(variant, extension) {
  if(extension?.privateInput)assert(process.env.CI===undefined&&process.env.GITHUB_ACTIONS===undefined,'private_audit_forbidden_in_ci');
  const firstPass=passes;
  const server = net.createServer();
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const tempRoot = fs.realpathSync(os.tmpdir()), temp = fs.mkdtempSync(path.join(tempRoot,'mission20-c1-pg-'));
  const cluster = path.join(temp,'cluster'), sessions = [];
  // Do not consult a per-user password/service file even for loopback trust.
  env.PGPASSFILE=path.join(temp,'empty-pgpass'); env.PGSERVICEFILE=path.join(temp,'empty-pgservice');
  fs.writeFileSync(env.PGPASSFILE,'',{mode:0o600}); fs.writeFileSync(env.PGSERVICEFILE,'',{mode:0o600});
  let started = false, failure;
  try {
    const authentication=['-A','trust'];
    if(extension?.privateInput){
      const secret=randomBytes(32).toString('base64url'),pwfile=path.join(temp,'initdb-password');
      fs.writeFileSync(pwfile,secret+'\n',{mode:0o600});
      fs.writeFileSync(env.PGPASSFILE,`127.0.0.1:${port}:*:postgres:${secret}\n`,{mode:0o600});
      authentication.splice(0,authentication.length,'-A','scram-sha-256','--pwfile',pwfile);
    }
    run('initdb',['-D',cluster,'-U','postgres',...authentication,'--no-locale','-E','UTF8']);
    run('pg_ctl',['-D',cluster,'-l',path.join(temp,'postgres.log'),'-w','start','-o',`-h 127.0.0.1 -p ${port} -F -c max_connections=20 -c shared_buffers=32MB`]);
    started = true;
    const host = ['-h','127.0.0.1','-p',String(port),'-U','postgres'];
    run('createdb',[...host,'partner_authz_fixture']);
    const connection = [...host,'-d','partner_authz_fixture'];
    const fixture = run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1',...(variant==='per-team'?['-v','per_team=1']:[]),'-f',path.join(SQL,'04-security-tests.review.sql')]);
    const assertions = (fixture.match(/NOTICE:\s+PASS:/g) || []).length;
    assert(assertions >= 245, 'preserve baseline privacy and new security assertions');
    console.log(`${variant} SQL assertions: ${assertions} (includes unchanged baseline privacy suite).`);
    const admin = session(connection,'admin',sessions);
    const version=await admin.query('SHOW server_version;'); console.log('Local PostgreSQL: '+version);
    assert.equal(Number(version.split('.')[0]),major,'Only the selected local major qualifies');
    assert.equal(await admin.query("SELECT current_database()='partner_authz_fixture' AND inet_server_addr()='127.0.0.1'::inet AND session_user='postgres';"),'t');
    passed('fresh loopback-only disposable database guard');
    // Fixture additions only; exercise the real repository matchmaking trigger,
    // whose AFTER member hook takes the parent team FOR NO KEY UPDATE.
    await admin.query(`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS hackathon_participations integer DEFAULT 0, ADD COLUMN IF NOT EXISTS hackathon_wins integer DEFAULT 0,
      ADD COLUMN IF NOT EXISTS has_won_hackathon boolean DEFAULT false, ADD COLUMN IF NOT EXISTS year_of_study text;
      ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS skills text[], ADD COLUMN IF NOT EXISTS college text;
      ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS project_role text;
      CREATE TABLE IF NOT EXISTS public.blocked_users(blocker_id uuid,blocked_id uuid);
      CREATE TABLE IF NOT EXISTS public.team_join_requests(team_id uuid,user_id uuid,status text);
      CREATE TABLE IF NOT EXISTS public.team_invites(team_id uuid,invited_user_id uuid,status text);`);
    run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1','-f',path.join(ROOT,'supabase/migrations/20260925221500_matchmaking_v2_engine.sql')]);
    passed('real matchmaking maintenance functions and membership triggers loaded');
    const context={admin,run,connection,session:label=>session(connection,label,sessions),uid,identity,passed,ROOT,SQL,variant,ownedRoot:temp,pgPort:port};
    // Extra fixtures may be allocated only inside this newly owned cluster.
    // No caller-supplied host, URL, credentials or pre-existing database path.
    context.allocateFixtureDatabase=name=>{
      assert(/^mission20_fixture_[a-z]+$/.test(name));
      run('createdb',[...host,name]);const local=[...host,'-d',name];
      return {connection:local,session:label=>session(local,label,sessions)};
    };
    if(extension) await extension.setup(context);
    {
      let gateError;
      try { run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1','-f',path.join(SQL,'06-unfreeze-admission.proposed.sql')]); }
      catch(error) { gateError=error; }
      assert.match(gateError?.message||'',/per_team_and_contract_release_gate_required/);
      passed('release gate refuses '+variant+' comparator without the final writer protocol');
    }
    async function seed(event, type='native', team=null) {
      await admin.query(`INSERT INTO public.hackathons(id,name,type,status,archived,organizer_id,min_team_size,max_team_size,max_participants,registration_start,registration_end,end_date)
        VALUES('${uid(event)}','Synthetic race','${type}','approved',false,'${uid(9001)}',1,4,1,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days');
        ${team ? `INSERT INTO public.teams(id,name,owner_id) VALUES('${uid(team)}','Synthetic race team','${uid(9001)}');` : ''}`);
    }
    async function blocked(label) {
      const until = Date.now()+2500;
      while(Date.now()<until) {
        if(await admin.query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${label}' AND state='active' AND wait_event_type='Lock';`) === '1') return;
        await delay(15);
      }
      throw Error(label + ' did not reach a real PostgreSQL lock wait');
    }
    async function lastSeat(event, community=false, rollback=false, duplicate=false) {
      await seed(event,community?'external':'native');
      const a=session(connection,'a'+event,sessions),b=session(connection,'b'+event,sessions);
      await a.query(`SET application_name='a${event}'; ${identity(9001)} BEGIN;`);
      await b.query(`SET application_name='b${event}'; ${identity(duplicate?9001:9002)} BEGIN;`);
      const op=actor=>community?`INSERT INTO public.hackathon_registrations(hackathon_id,user_id,status) VALUES('${uid(event)}','${uid(actor)}','confirmed') RETURNING status;`:`SELECT public.register_native_hackathon('${uid(event)}')->>'status';`;
      assert.equal(await a.query(op(9001)),'confirmed');
      const waiting=b.query(duplicate?`SELECT public.register_native_hackathon('${uid(event)}')->>'alreadyRegistered';`:op(9002));
      const safe=waiting.then(value=>({value}),error=>({error}));
      await blocked('b'+event); await a.query(rollback?'ROLLBACK;':'COMMIT;');
      const outcome=await safe; if(outcome.error) throw outcome.error;
      assert.equal(outcome.value,duplicate?'true':rollback?'confirmed':'waitlisted');
      await b.query('COMMIT;');
      assert.equal(await admin.query(`SELECT count(*) FILTER(WHERE status='confirmed')||','||count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(event)}';`),rollback||duplicate?'1,1':'1,2');
      passed(`${community?'community':'native'} simultaneous last-seat ${event}: ${rollback?'rollback releases slot':duplicate?'idempotent same actor':'one confirmed, one waitlisted'}`);
      await a.close(); await b.close();
    }
    await lastSeat(9701); await lastSeat(9702,false,true); await lastSeat(9703,false,false,true); await lastSeat(9704,true);
    await seed(9720,'native',9620);
    await admin.query(`UPDATE public.hackathons SET max_team_size=1 WHERE id='${uid(9720)}';`);
    const joinA=session(connection,'join_a',sessions),joinB=session(connection,'join_b',sessions);
    await joinA.query(`${identity(9001)} BEGIN; SELECT public.register_native_hackathon('${uid(9720)}','${uid(9620)}');`);
    await joinB.query("SET application_name='join_b'; BEGIN;");
    const joining=joinB.query(`INSERT INTO public.team_members(team_id,user_id) VALUES('${uid(9620)}','${uid(9002)}');`).then(value=>({value}),error=>({error}));
    await blocked('join_b'); await joinA.query('COMMIT;');
    const joined=await joining; if(joined.error) throw joined.error; await joinB.query('COMMIT;');
    await admin.query(`DELETE FROM public.hackathon_registrations WHERE hackathon_id='${uid(9720)}';`);
    await admin.query(`${identity(9001)} SELECT public.fixture_error('SELECT public.register_native_hackathon(''${uid(9720)}'',''${uid(9620)}'')','P0001','new admission rechecks enlarged roster'); RESET ROLE;`);
    assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(9720)}';`),'0');
    await joinA.close(); await joinB.close();
    passed('same-team addition waits; a later admission rechecks owner-plus-member size');

    await seed(9721,'native',9621);
    await admin.query(`UPDATE public.hackathons SET min_team_size=2,max_team_size=2 WHERE id='${uid(9721)}';
      INSERT INTO public.team_members(team_id,user_id) VALUES('${uid(9621)}','${uid(9001)}'),('${uid(9621)}','${uid(9002)}');
      ${identity(9001)} SELECT public.register_native_hackathon('${uid(9721)}','${uid(9621)}'); RESET ROLE;`);
    assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(9721)}' AND status='confirmed';`),'1');
    passed('owner already in roster is counted once at the exact two-person limit');

    await seed(9722,'native',9622);
    const ownerA=session(connection,'owner_a',sessions),ownerB=session(connection,'owner_b',sessions);
    await ownerA.query(`${identity(9001)} BEGIN; SELECT public.register_native_hackathon('${uid(9722)}','${uid(9622)}');`);
    await ownerB.query("SET application_name='owner_b'; BEGIN;");
    const changing=ownerB.query(`UPDATE public.teams SET owner_id='${uid(9002)}' WHERE id='${uid(9622)}';`).then(value=>({value}),error=>({error}));
    await blocked('owner_b'); await ownerA.query('COMMIT;');
    const changed=await changing; if(changed.error) throw changed.error; await ownerB.query('COMMIT;');
    await admin.query(`DELETE FROM public.hackathon_registrations WHERE hackathon_id='${uid(9722)}';
      ${identity(9001)} SELECT public.fixture_error('SELECT public.register_native_hackathon(''${uid(9722)}'',''${uid(9622)}'')','42501','former owner denied'); RESET ROLE;
      ${identity(9002)} SELECT public.register_native_hackathon('${uid(9722)}','${uid(9622)}'); RESET ROLE;`);
    assert.equal(await admin.query(`SELECT user_id FROM public.hackathon_registrations WHERE hackathon_id='${uid(9722)}';`),uid(9002));
    await ownerA.close(); await ownerB.close();
    passed('owner transfer waits; former owner denied and new owner admitted on next attempt');

    await seed(9723);
    await admin.query(`${identity(9001)} SELECT public.register_native_hackathon('${uid(9723)}'); RESET ROLE;`);
    const cancelA=session(connection,'cancel_a',sessions),cancelB=session(connection,'cancel_b',sessions);
    await cancelA.query(`${identity(9001)} BEGIN; DELETE FROM public.hackathon_registrations WHERE hackathon_id='${uid(9723)}';`);
    await cancelB.query(`SET application_name='cancel_b'; ${identity(9002)} BEGIN;`);
    const replacing=cancelB.query(`SELECT public.register_native_hackathon('${uid(9723)}')->>'status';`).then(value=>({value}),error=>({error}));
    await blocked('cancel_b'); await cancelA.query('COMMIT;');
    const replaced=await replacing; if(replaced.error) throw replaced.error; assert.equal(replaced.value,'confirmed'); await cancelB.query('COMMIT;');
    assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(9723)}';`),'1');
    await cancelA.close(); await cancelB.close();
    passed('concurrent cancellation releases its confirmed row slot before waiting admission counts');

    if(variant==='per-team') {
      await seed(9726);
      await admin.query(`${identity(9001)} SELECT public.register_native_hackathon('${uid(9726)}'); RESET ROLE;`);
      const retryA=session(connection,'retry_a',sessions),retryB=session(connection,'retry_b',sessions);
      await retryA.query(`${identity(9001)} BEGIN; DELETE FROM public.hackathon_registrations WHERE hackathon_id='${uid(9726)}';`);
      await retryB.query(`SET application_name='retry_b'; ${identity(9001)} BEGIN;`);
      const retrying=retryB.query(`SELECT public.register_native_hackathon('${uid(9726)}');`).then(value=>({value}),error=>({error}));
      await blocked('retry_b'); await retryA.query('COMMIT;');
      assert.match((await retrying).error?.message||'',/participation_changed_retry/);
      assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(9726)}';`),'0');
      await retryA.close(); await retryB.close();
      passed('per-team idempotent retry racing cancellation refuses to recreate the deleted row');
    }

    await seed(9724);
    const editA=session(connection,'edit_a',sessions),editB=session(connection,'edit_b',sessions);
    await editA.query(`BEGIN; UPDATE public.hackathons SET registration_end=clock_timestamp()-interval '1 second' WHERE id='${uid(9724)}';`);
    await editB.query(`SET application_name='edit_b'; ${identity(9002)} BEGIN;`);
    const edited=editB.query(`SELECT public.register_native_hackathon('${uid(9724)}');`).then(value=>({value}),error=>({error}));
    await blocked('edit_b'); await editA.query('COMMIT;');
    assert.match((await edited).error?.message||'',/P0001/);
    assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(9724)}';`),'0');
    await editA.close(); await editB.close();
    passed('waiting admission observes a concurrently committed deadline restriction');

    await seed(9725);
    const timeoutA=session(connection,'timeout_a',sessions),timeoutB=session(connection,'timeout_b',sessions);
    await timeoutA.query(`BEGIN; SELECT id FROM public.hackathons WHERE id='${uid(9725)}' FOR UPDATE;`);
    await timeoutB.query(`${identity(9002)} BEGIN;`);
    const timed=await timeoutB.query(`SELECT public.register_native_hackathon('${uid(9725)}');`).then(value=>({value}),error=>({error}));
    assert.match(timed.error?.message||'',/55P03/); await timeoutA.query('ROLLBACK;');
    assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(9725)}';`),'0');
    await timeoutA.close(); await timeoutB.close();
    passed('lock timeout returns 55P03 with no partial registration');
    await seed(9705);
    const lock=session(connection,'deadline_lock',sessions),late=session(connection,'deadline_late',sessions);
    await lock.query(`BEGIN; UPDATE public.hackathons SET registration_end=clock_timestamp()+interval '1 second' WHERE id='${uid(9705)}';`);
    await late.query(`SET application_name='deadline_late'; ${identity(9002)} BEGIN;`);
    const waiting=late.query(`SELECT public.register_native_hackathon('${uid(9705)}');`).then(value=>({value}),error=>({error}));
    await blocked('deadline_late'); await delay(1100); await lock.query('COMMIT;');
    assert.match((await waiting).error?.message || '',/P0001/);
    assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(9705)}';`),'0');
    passed('real database clock rejects a caller queued before the cutoff');
    // Real CASCADE, including the cache FK: no claim of registration retention.
    await seed(9710,'native',9610);
    const admit=session(connection,'cascade_admit',sessions),remove=session(connection,'cascade_remove',sessions);
    await admit.query(`${identity(9001)} BEGIN; SELECT public.register_native_hackathon('${uid(9710)}','${uid(9610)}');`);
    await remove.query("SET application_name='cascade_remove'; BEGIN;");
    const removing=remove.query(`DELETE FROM public.teams WHERE id='${uid(9610)}';`).then(value=>({value}),error=>({error}));
    await blocked('cascade_remove'); await admit.query('COMMIT;');
    const removed=await removing; if(removed.error) throw removed.error; await remove.query('COMMIT;');
    assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(9710)}';`),'0');
    await admin.query(`${identity(9002)} SELECT public.register_native_hackathon('${uid(9710)}'); RESET ROLE;`);
    assert.equal(await admin.query(`SELECT status FROM public.hackathon_registrations WHERE hackathon_id='${uid(9710)}';`),'confirmed');
    passed('concurrent team deletion CASCADE removes admission and releases its row slot');

    await seed(9711,'native',9611);
    await admin.query(`UPDATE public.profiles SET skills=ARRAY['React'] WHERE id='${uid(9002)}';
      INSERT INTO public.team_members(team_id,user_id) VALUES('${uid(9611)}','${uid(9002)}');`);
    assert.equal(await admin.query(`SELECT 'react'=ANY(skills) FROM matchmaking.team_feature WHERE team_id='${uid(9611)}';`),'t');
    const roster=session(connection,'roster_admit',sessions),leave=session(connection,'roster_leave',sessions);
    await roster.query(`${identity(9001)} BEGIN; SELECT public.register_native_hackathon('${uid(9711)}','${uid(9611)}');`);
    await leave.query("SET application_name='roster_leave'; BEGIN;");
    const leaving=leave.query(`DELETE FROM public.team_members WHERE team_id='${uid(9611)}' AND user_id='${uid(9002)}';`).then(value=>({value}),error=>({error}));
    await blocked('roster_leave'); await roster.query('COMMIT;');
    const left=await leaving; if(left.error) throw left.error; await leave.query('COMMIT;');
    assert.equal(await admin.query(`SELECT 'react'=ANY(skills) FROM matchmaking.team_feature WHERE team_id='${uid(9611)}';`),'f');
    passed('same-team departure waits, then actual matchmaking trigger rebuilds cache');

    await seed(9712,'native',9612);
    await admin.query(`INSERT INTO public.teams(id,name,owner_id) VALUES('${uid(9613)}','Synthetic unrelated','${uid(9001)}');`);
    const unrelatedA=session(connection,'unrelated_a',sessions),unrelatedB=session(connection,'unrelated_b',sessions);
    await unrelatedA.query(`SET application_name='unrelated_a'; ${identity(9001)} BEGIN; SELECT public.register_native_hackathon('${uid(9712)}','${uid(9612)}');`);
    await unrelatedB.query("SET application_name='unrelated_b'; BEGIN;");
    const unrelatedWrite=unrelatedB.query(`INSERT INTO public.team_members(team_id,user_id) VALUES('${uid(9613)}','${uid(9002)}') RETURNING team_id;`).then(value=>({value}),error=>({error}));
    if(variant==='global') {
      await blocked('unrelated_b');
      await unrelatedA.query('COMMIT;');
    }
    const unrelated=await Promise.race([unrelatedWrite,delay(2500).then(()=>({error:Error('unrelated team was unexpectedly blocked')}))]);
    if(unrelated.error) throw unrelated.error;
    assert.equal(unrelated.value,uid(9613)); await unrelatedB.query('COMMIT;');
    if(variant==='per-team') {
      assert.equal(await admin.query("SELECT count(*) FROM pg_stat_activity WHERE application_name='unrelated_a' AND state='idle in transaction';"),'1');
      await unrelatedA.query('COMMIT;');
    }
    passed(variant==='global'?'global lock demonstrably blocks unrelated-team write (release limitation)':'per-team unrelated write completes while admission transaction remains open');

    // Deterministic model of the existing member AFTER-trigger lock inversion.
    // A holds exactly the team lock taken by its admission implementation.
    await seed(9713,'native',9614);
    const da=session(connection,'deadlock_a',sessions),db=session(connection,'deadlock_b',sessions);
    await da.query(`BEGIN; SELECT id FROM public.teams WHERE id='${uid(9614)}' FOR ${variant==='global'?'SHARE':'UPDATE'}; ${identity(9001)}`);
    await db.query("SET application_name='deadlock_b'; BEGIN;");
    const dw=db.query(`INSERT INTO public.team_members(team_id,user_id) VALUES('${uid(9614)}','${uid(9002)}');`).then(value=>({value}),error=>({error}));
    await blocked('deadlock_b');
    const ar=await da.query(`SELECT public.register_native_hackathon('${uid(9713)}','${uid(9614)}');`).then(value=>({value}),error=>({error}));
    if(!ar.error) await da.query('COMMIT;');
    const br=await dw; if(!br.error) await db.query('COMMIT;');
    if(variant==='global') assert.match((ar.error?.message||'')+(br.error?.message||''),/40P01/);
    else { if(ar.error) throw ar.error; if(br.error) throw br.error; }
    assert.equal(await admin.query(`SELECT count(*)<=1 FROM public.hackathon_registrations WHERE hackathon_id='${uid(9713)}' AND status='confirmed';`),'t');
    passed(variant==='global'?'global/matchmaking cycle reproduced as 40P01; victim rolled back':'per-team schedule completes without the global/matchmaking lock cycle');
    // Both team_id CASCADE actions are independently confirmed in production.
    await seed(9714,'native',9615);
    await admin.query(`INSERT INTO public.team_members(team_id,user_id) VALUES('${uid(9615)}','${uid(9002)}');`);
    const ca=session(connection,'member_cascade_a',sessions),cb=session(connection,'member_cascade_b',sessions);
    await ca.query(`${identity(9001)} BEGIN; SELECT public.register_native_hackathon('${uid(9714)}','${uid(9615)}');`);
    await cb.query("SET application_name='member_cascade_b'; BEGIN;");
    const cascading=cb.query(`DELETE FROM public.teams WHERE id='${uid(9615)}';`).then(value=>({value}),error=>({error}));
    await blocked('member_cascade_b'); await ca.query('COMMIT;');
    const cascaded=await cascading; if(cascaded.error) throw cascaded.error; await cb.query('COMMIT;');
    assert.equal(await admin.query(`SELECT (SELECT count(*) FROM public.team_members WHERE team_id='${uid(9615)}')+
      (SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(9714)}')+
      (SELECT count(*) FROM matchmaking.team_feature WHERE team_id='${uid(9615)}');`),'0');
    passed('confirmed member-CASCADE clears roster, registration and real matchmaking cache');
    if(variant==='per-team') {
      // A BEFORE row trigger runs after DELETE has locked its target tuple.
      // Explicitly retain this residual cycle as a release-qualification limit.
      await seed(9727,'native',9627);
      await admin.query(`INSERT INTO public.team_members(team_id,user_id) VALUES('${uid(9627)}','${uid(9002)}');`);
      const parent=session(connection,'parent_delete',sessions),child=session(connection,'child_delete',sessions);
      await parent.query(`BEGIN; SELECT id FROM public.teams WHERE id='${uid(9627)}' FOR UPDATE;`);
      await child.query("SET application_name='child_delete'; BEGIN;");
      const childDelete=child.query(`DELETE FROM public.team_members WHERE team_id='${uid(9627)}' AND user_id='${uid(9002)}';`).then(value=>({value}),error=>({error}));
      await blocked('child_delete');
      const parentDelete=await parent.query(`DELETE FROM public.teams WHERE id='${uid(9627)}';`).then(value=>({value}),error=>({error}));
      if(!parentDelete.error) await parent.query('COMMIT;');
      const childResult=await childDelete; if(!childResult.error) await child.query('COMMIT;');
      assert.match((parentDelete.error?.message||'')+(childResult.error?.message||''),/40P01/);
      assert.equal(await admin.query(`SELECT count(*) FROM public.team_members m LEFT JOIN public.teams t ON t.id=m.team_id WHERE t.id IS NULL;`),'0');
      await parent.close(); await child.close();
      passed('per-team residual child-row/cascading-parent 40P01 reproduced; victim rollback leaves no orphan');
    }
    if(extension && variant==='per-team') {
      for(const s of sessions) if(s!==admin) await s.close();
      await extension.qualify({...context,blocked,seed});
    }
    run('psql',[...connection,'-X','-w','-v','ON_ERROR_STOP=1','-f',path.join(SQL,'03-rollback-freeze.proposed.sql')]);
    const frozen=session(connection,'frozen',sessions);
    await frozen.query(identity(9001));
    const refused=await frozen.query(`SELECT public.register_native_hackathon('${uid(9701)}');`).then(value=>({value}),error=>({error}));
    assert.match(refused.error?.message||'',/42501/);
    await admin.query(`${identity(9001)} SELECT public.fixture_error('INSERT INTO public.hackathon_registrations(hackathon_id,user_id) VALUES(''${uid(9704)}'',auth.uid())','42501','rollback community INSERT denied');
      UPDATE public.hackathon_registrations SET looking_for_team=false WHERE hackathon_id='${uid(9701)}'; RESET ROLE;`);
    assert.equal(await admin.query(`SELECT count(*) FROM public.hackathon_registrations WHERE hackathon_id='${uid(9701)}';`),'2');
    passed('rollback freeze rejects RPC while preserving records and own preference updates');
    console.log(JSON.stringify({variant,version,localOnly:true,sqlAssertions:assertions,checks:passes-firstPass,productionConnections:0}));
  } catch(error) { failure=error; }
  finally {
    for(const s of sessions) { try { await s.close(); } catch(error) { failure ||= error; } }
    try {
      if(started || fs.existsSync(path.join(cluster,'postmaster.pid'))) run('pg_ctl',['-D',cluster,'-w','-m','immediate','stop']);
      const resolved=fs.realpathSync(temp);
      assert.equal(path.dirname(resolved),tempRoot); assert(path.basename(resolved).startsWith('mission20-c1-pg-'));
      fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
      assert(!fs.existsSync(resolved)); console.log('CLEANUP: stopped owned cluster and removed exact allocated temporary root.');
    } catch(error) { failure ||= error; }
  }
  if(failure) throw failure;
}
async function main(extension, args=process.argv.slice(2)) {
  // No URL, port, database, credentials, PG variables, SQL path or .env accepted.
  assert(args.length===1 && ['--local-only','--local-pg17-only'].includes(args[0]), 'Run only with --local-only or --local-pg17-only; connections are allocated internally.');
  major=args[0]==='--local-pg17-only'?17:18;
  console.log('Selected native binaries: '+run('postgres',['--version']).trim());
  await qualify('global',extension);
  await qualify('per-team',extension);
  console.log(JSON.stringify({totalChecks:passes,localOnly:true,releaseApproved:false}));
}
module.exports={main};
if(require.main===module) main().catch(error=>{console.error(error.stack);process.exitCode=1;});
