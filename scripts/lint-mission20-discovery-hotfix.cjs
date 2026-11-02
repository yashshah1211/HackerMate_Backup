/* eslint-disable @typescript-eslint/no-require-imports -- Preserve existing legacy diagnostics and reject new ones. */
const {ESLint}=require('eslint'),{execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const lint=new ESLint(),legacy='src/app/hackathons/[id]/page.tsx';
 const files=['src/lib/hackathons/lifecycle.ts','src/lib/hackathons/discovery.ts','src/lib/hackathons/publicBrowsing.ts','src/lib/getLandingData.ts',
  'src/app/hackathons/page.tsx','src/components/hackathons/PublicHackathonDetail.tsx','src/components/landing/LandingHero.tsx','src/app/LandingPageClient.tsx',
  'scripts/test-mission20-unverified-opportunities.cjs',
  'scripts/test-mission20-discovery-hotfix.cjs','scripts/test-mission20-discovery-hotfix-browser.cjs','scripts/lint-mission20-discovery-hotfix.cjs'];
 const results=await lint.lintFiles(files);
 assert.equal(results.reduce((n,r)=>n+r.errorCount+r.warningCount,0),0,JSON.stringify(results.filter(r=>r.messages.length).map(r=>({file:r.filePath,messages:r.messages}))));
 const old=execFileSync('git',['show','afcc0da97b8d39cc7a9f202431e19c39d4f4bc69:'+legacy],{encoding:'utf8'}),current=fs.readFileSync(legacy,'utf8');
 const [before]=await lint.lintText(old,{filePath:legacy}),[after]=await lint.lintText(current,{filePath:legacy});
 const diagnostics=(result,source)=>result.messages.map(m=>JSON.stringify({rule:m.ruleId,severity:m.severity,message:m.message,
  line:source.split(/\r?\n/)[m.line-1]?.trim()})).sort();
 assert.deepEqual(diagnostics(after,current),diagnostics(before,old),'No added, removed or altered legacy diagnostics are permitted');
 console.log(JSON.stringify({scopedFiles:files.length,newErrors:0,newWarnings:0,legacyBaselineErrors:before.errorCount,legacyBaselineWarnings:before.warningCount,
  legacyCurrentErrors:after.errorCount,legacyCurrentWarnings:after.warningCount,baseline:'afcc0da97b8d39cc7a9f202431e19c39d4f4bc69'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
