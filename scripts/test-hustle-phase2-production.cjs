/* eslint-disable @typescript-eslint/no-require-imports -- Disabled-release production build/runtime checks, never a deployment. */
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');const {spawn,spawnSync}=require('node:child_process');
const {ROOT,freePort}=require('./hustle-phase2-local-db.cjs');
const out=path.join(ROOT,'test-results/hustle-phase2-production');fs.mkdirSync(out,{recursive:true});
// Turbopack serializes enumerable exports: a dynamic Proxy (used by the
// webpack browser fixture) becomes an empty map. Supply concrete offline URLs.
const {validateGoogleFontFunctionCall}=require('next/dist/compiled/@next/font/dist/google/validate-google-font-function-call');
const {getFontAxes}=require('next/dist/compiled/@next/font/dist/google/get-font-axes');
const {getGoogleFontsUrl}=require('next/dist/compiled/@next/font/dist/google/get-google-fonts-url');
const fontResponses={};
for(const [name,axes] of [['Instrument_Sans',['wdth']],['Bricolage_Grotesque',['opsz','wdth']],['JetBrains_Mono',undefined]]){
 const font=validateGoogleFontFunctionCall(name,{subsets:['latin'],...(axes?{axes}:{})});
 const url=getGoogleFontsUrl(font.fontFamily,getFontAxes(font.fontFamily,font.weights,font.styles,font.selectedVariableAxes),font.display);
 fontResponses[url]="@font-face{font-family:'"+font.fontFamily+"';src:local(Arial);font-weight:100 900}";
}
fs.writeFileSync(path.join(out,'font-mock.cjs'),'module.exports='+JSON.stringify(fontResponses)+';');const env={...process.env};
for(const key of Object.keys(env))if(/SUPABASE|DATABASE_URL|RESEND|SENTRY|VERCEL|HUSTLE|TOKEN|SECRET|API_KEY|NEXT_PUBLIC_GA|POSTHOG/.test(key))delete env[key];
function run(args,log){const stream=fs.createWriteStream(path.join(out,log));const child=spawn(process.execPath,['node_modules/next/dist/bin/next',...args],{cwd:ROOT,env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(stream);child.stderr.pipe(stream);return {child,done:new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>{stream.end();if(code===0)resolve();else reject(Error(log+': process exit '+code));});})};}
(async()=>{let runtime,stub;try{
 assert(!fs.existsSync(path.join(ROOT,'.env.local'))&&!fs.existsSync(path.join(ROOT,'.env')),'No real environment files');
 const dbPort=await freePort(),port=await freePort(),origin='http://127.0.0.1:'+port;let requests=0;
 stub=http.createServer((req,res)=>{requests++;res.setHeader('Content-Type','application/json');if(req.url.startsWith('/auth/')){res.statusCode=401;res.end('{"message":"Offline synthetic auth"}');}else res.end('[]');});await new Promise(r=>stub.listen(dbPort,'127.0.0.1',r));
 Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:'+dbPort,NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',HUSTLE_PHASE2_ENABLED:'true',HUSTLE_PHASE2_LOCAL_FIXTURE:'true',VERCEL_ENV:'production',NEXT_FONT_GOOGLE_MOCKED_RESPONSES:path.join(out,'font-mock.cjs')});
 if(!process.argv.includes('--reuse-build')){console.log('Building disabled PR A in production mode with synthetic loopback configuration only.');await run(['build'],'production-build.txt').done;console.log('Production build passed.');}
 runtime=run(['start','-H','127.0.0.1','-p',String(port)],'production-runtime.txt');runtime.done.catch(()=>{});
 for(let n=0;n<120;n++){try{if((await fetch(origin+'/partners/hustle-carnival/phase-2')).ok)break;}catch{}if(n===119)throw Error('Production server did not become ready');await new Promise(r=>setTimeout(r,500));}
 const results=[];const before=requests;const base='/partners/hustle-carnival/phase-2',api='/api/partners/hustle-carnival/phase-2';
 for(const route of [base,base+'/organizer',base+'/invite',api+'/organizer',api+'/export',api+'/import']){const response=await fetch(origin+route);const body=await response.text();assert.equal(response.status,route.startsWith(api)?503:200);assert(body.includes('not available yet'));assert(response.headers.get('cache-control').includes('no-store'));assert.equal(response.headers.get('referrer-policy'),'no-referrer');if(route.startsWith(base)){assert(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));assert(!/simpleanalytics|googletagmanager|sentry|<script src/.test(body));}results.push({route,status:response.status,disabled:true});}
 assert.equal(requests,before,'Disabled Round 2 never accesses even the fake DB');
 const round2DatabaseRequests=requests-before;
 for(const [route,status] of [['/partners/hustle-carnival',200],['/partners/hustle-carnival/workshops',200]]){const response=await fetch(origin+route);const body=await response.text();assert(body.includes(route.endsWith('/workshops')?'Introduction to AI Tools':'unstop.com'));results.push({route,status:response.status,expected:status,pass:response.status===status});}
 const failed=results.filter(r=>r.pass===false);fs.writeFileSync(path.join(out,'production-runtime-evidence.json'),JSON.stringify({results,round2DatabaseRequests,featureGuardsUnchanged:true},null,2));console.log(JSON.stringify(results,null,2));console.log('Production HTTP checks: '+(results.length-failed.length)+' passed, '+failed.length+' failed; Round 2 database requests='+round2DatabaseRequests);assert.equal(failed.length,0,'Production HTTP contract failures recorded in evidence');
 }finally{if(runtime){if(process.platform==='win32'&&runtime.child.exitCode===null)spawnSync('taskkill',['/pid',String(runtime.child.pid),'/t','/f'],{windowsHide:true,stdio:'ignore'});else runtime.child.kill();}if(stub)await new Promise(r=>stub.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
