/* eslint-disable @typescript-eslint/no-require-imports -- Fresh loopback-only native PostgreSQL fixture. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawnSync,spawn}=require('node:child_process');
async function createFixture(){
 const root=path.resolve(__dirname,'..'),env={};for(const k of ['PATH','SystemRoot','WINDIR','COMSPEC','USERPROFILE','LOCALAPPDATA','TEMP','TMP'])if(process.env[k])env[k]=process.env[k];
 const bin=process.env.AGGREGATOR_TEST_PG_BIN||(process.platform==='win32'?'C:/Program Files/PostgreSQL/17/bin':'/usr/lib/postgresql/17/bin'),binary=n=>path.join(bin,n+(process.platform==='win32'?'.exe':''));
 const server=net.createServer();await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});const port=server.address().port;await new Promise(r=>server.close(r));
 const parent=fs.realpathSync(os.tmpdir()),temp=fs.mkdtempSync(path.join(parent,'hackathon-aggregator-pg-')),cluster=path.join(temp,'cluster');let started=false;
 env.PGPASSFILE=path.join(temp,'no-password');env.PGSERVICEFILE=path.join(temp,'no-service');fs.writeFileSync(env.PGPASSFILE,'');fs.writeFileSync(env.PGSERVICEFILE,'');
 function run(name,args,input){const r=spawnSync(binary(name),args,{cwd:root,env,windowsHide:true,input,encoding:'utf8',timeout:60000,maxBuffer:8e6,stdio:name==='pg_ctl'?'ignore':'pipe'});if(r.error||r.status!==0)throw Error(name+': '+(r.error?.message||r.stderr||r.stdout));return (r.stdout||'').trim();}
 const args=['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','aggregator_fixture','-X','-w','-q','-At','-v','ON_ERROR_STOP=1'];
 const sql=s=>run('psql',args,s);
 const asyncSql=s=>new Promise((resolve,reject)=>{const p=spawn(binary('psql'),args,{cwd:root,env,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{p.kill();reject(Error('Fixture query timeout'));},15000);p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>err+=v);p.on('error',reject);p.on('exit',c=>{clearTimeout(timer);if(c===0)resolve(out.trim());else reject(Error(err||out));});p.stdin.end(s);});
 async function close(){if(started||fs.existsSync(path.join(cluster,'postmaster.pid')))run('pg_ctl',['-D',cluster,'-w','-m','immediate','stop']);const resolved=fs.realpathSync(temp);assert.equal(path.dirname(resolved),parent);assert(path.basename(resolved).startsWith('hackathon-aggregator-pg-'));fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
 try{
  assert.match(run('postgres',['--version']),/17\.6(?:\s|$)/,'PG17.6 qualification is mandatory; do not silently substitute another version');
  run('initdb',['-D',cluster,'-U','postgres','-A','trust','--no-locale','-E','UTF8']);run('pg_ctl',['-D',cluster,'-l',path.join(temp,'postgres.log'),'-w','start','-o',`-h 127.0.0.1 -p ${port} -F -c max_connections=12 -c shared_buffers=32MB -c hm.fixture_only=aggregator`]);started=true;
  run('createdb',['-h','127.0.0.1','-p',String(port),'-U','postgres','aggregator_fixture']);assert.equal(sql("SELECT current_database()='aggregator_fixture' AND inet_server_addr()='127.0.0.1'::inet AND current_setting('hm.fixture_only')='aggregator'"),'t');
  return {sql,asyncSql,close,root,port};
 }catch(e){await close();throw e;}
}
module.exports={createFixture};
