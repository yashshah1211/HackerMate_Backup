/* eslint-disable @typescript-eslint/no-require-imports -- Disposable synthetic PostgreSQL fixture. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const EVENT = '0da43cba-90dc-449c-a126-a2fc8be8a379';
const IDS = { admin: '00000000-0000-4000-8000-000000000001', organizer: '00000000-0000-4000-8000-000000000002', unrelated: '00000000-0000-4000-8000-000000000003', banned: '00000000-0000-4000-8000-000000000004', foreign: '00000000-0000-4000-8000-000000000005' };
const quote = value => value === null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";
async function freePort() { const server = net.createServer(); await new Promise((resolve, reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); }); const port=server.address().port; await new Promise(resolve=>server.close(resolve)); return port; }
async function createFixture() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(PG|SUPABASE|NEXT_PUBLIC_SUPABASE|DATABASE_URL)/.test(key)) delete env[key];
  const bin = process.env.PARTNER_TEST_PG_BIN || (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '');
  const binary = name => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const tempRoot = fs.realpathSync(os.tmpdir()); const temp = fs.mkdtempSync(path.join(tempRoot,'hustle-phase2-fixture-')); const cluster=path.join(temp,'cluster');
  const port=await freePort(); let started=false;
  function run(name,args,input) { const result=spawnSync(binary(name),args,{cwd:ROOT,env,windowsHide:true,encoding:'utf8',input,timeout:60000,maxBuffer:8*1024*1024,stdio:name==='pg_ctl'?'ignore':'pipe'}); if(result.error||result.status!==0) throw new Error(`${name}: ${result.error?.message||result.stderr||result.stdout}`); return (result.stdout||'').trim(); }
  const args=['-h','127.0.0.1','-p',String(port),'-U','fixture_owner','-d','hustle_phase2_fixture','-X','-w','-At','-v','ON_ERROR_STOP=1'];
  const sql = input => run('psql',args,input);
  const asyncSql = input => new Promise((resolve,reject)=>{const child=spawn(binary('psql'),args,{cwd:ROOT,env,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';const timeout=setTimeout(()=>{child.kill();reject(new Error('SQL timeout'));},20000);child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('exit',code=>{clearTimeout(timeout);if(code===0)resolve(out.trim());else reject(new Error(err||out));});child.stdin.end(input);});
  async function close() {
    if(started||fs.existsSync(path.join(cluster,'postmaster.pid')))run('pg_ctl',['-D',cluster,'-w','-m','immediate','stop']);
    const resolved=fs.realpathSync(temp);assert.equal(path.dirname(resolved),tempRoot);assert(path.basename(resolved).startsWith('hustle-phase2-fixture-'));fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
  try {
    run('initdb',['-D',cluster,'-U','fixture_owner','-A','trust','--no-locale','-E','UTF8']);
    run('pg_ctl',['-D',cluster,'-l',path.join(temp,'postgres.log'),'-w','start','-o',`-h 127.0.0.1 -p ${port} -F -c hm.fixture_only=hustle-phase2`]);started=true;
    run('createdb',['-h','127.0.0.1','-p',String(port),'-U','fixture_owner','hustle_phase2_fixture']);
    assert.equal(sql("SELECT current_database()='hustle_phase2_fixture' AND inet_server_addr()='127.0.0.1'::inet AND current_setting('hm.fixture_only')='hustle-phase2'"),'t');
    sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,is_banned boolean);
      CREATE TABLE public.hackathons(id uuid PRIMARY KEY,type text,organizer_id uuid);
      GRANT SELECT ON auth.users, public.profiles, public.hackathons TO service_role;
      INSERT INTO public.hackathons VALUES('${EVENT}','external',NULL),('10000000-0000-4000-8000-000000000099','external',NULL);
      ${Object.entries(IDS).map(([name,id])=>`INSERT INTO auth.users VALUES('${id}','${name}@example.invalid'); INSERT INTO profiles VALUES('${id}','${name==='admin'?'admin':'user'}',${name==='banned'});`).join('\n')}`);
    sql(fs.readFileSync(path.join(ROOT,'supabase/migrations/202610060002_partner_organizer_access.sql'),'utf8'));
    sql(`INSERT INTO event_organizers(hackathon_id,user_id) VALUES('${EVENT}','${IDS.organizer}'),('10000000-0000-4000-8000-000000000099','${IDS.foreign}');`);
    const migration=fs.readdirSync(path.join(ROOT,'supabase/migrations')).find(f=>f.endsWith('_hustle_phase2_shortlist.sql'));
    sql(fs.readFileSync(path.join(ROOT,'supabase/migrations',migration),'utf8'));
    return {sql,asyncSql,close,port,ROOT,IDS,EVENT,quote};
  } catch(error) { await close(); throw error; }
}
/** Clock substitution ONLY in a disposable fixture. Migration has no test clock. */
function installClock(db, initial='2026-10-23T04:30:00Z') {
  db.sql(`CREATE TABLE public.fixture_clock(value timestamptz); INSERT INTO public.fixture_clock VALUES('${initial}'); GRANT SELECT ON public.fixture_clock TO service_role;
    CREATE FUNCTION public.fixture_now() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$ SELECT value FROM public.fixture_clock $$;`);
  const names=['activate','invite','revoke','inspect','respond'];
  for(const name of names){const definition=db.sql(`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='hustle_phase2_${name}'`); db.sql(definition.replaceAll('clock_timestamp()', 'public.fixture_now()'));}
}
module.exports={createFixture,installClock,ROOT,EVENT,IDS,quote,freePort};
