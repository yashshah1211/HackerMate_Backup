/* eslint-disable @typescript-eslint/no-require-imports -- Reject new diagnostics; preserve exact legacy rule/severity/message/source-line findings. */
const {ESLint}=require('eslint'),{execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const lint=new ESLint(),legacy=['src/app/hackathons/[id]/page.tsx','src/app/admin/_tabs/OutreachTab.tsx'],base='3a0b4d0488128fe730607ae1ef024a3bf52992e1';
 const files=['src/lib/hackathons/source.ts','src/lib/hackathons/providers.ts','src/lib/hackathons/sourceTransport.ts','src/lib/hackathons/synchronize.ts',
 'src/lib/hackathons/lifecycle.ts','src/lib/hackathons/discovery.ts','src/lib/hackathons/publicBrowsing.ts','src/lib/getLandingData.ts','src/types/supabase.ts',
 'src/app/api/admin/scrape-unstop/route.ts','src/app/api/cron/auto-scrape-leads/route.ts','src/app/hackathons/page.tsx','src/components/hackathons/SourceInformation.tsx',
 'src/components/hackathons/PublicHackathonDetail.tsx','src/components/landing/LandingHero.tsx',
 ...fs.readdirSync('scripts').filter(n=>/^(?:test-aggregator-|aggregator-local-db|reconcile-hackathon-catalog|lint-aggregator)/.test(n)).map(n=>'scripts/'+n),
 'scripts/qualify-aggregator.cjs','scripts/test-public-hackathon-data.cjs','scripts/test-public-hackathon-browsing.cjs','qa/fixtures/mission20-hotfix-browser.jsx','qa/fixtures/aggregator/provider-facts.cjs',
 'scripts/test-scraper-data-preservation.cjs','scripts/test-email-reliability.cjs','scripts/test-event-compatibility.cjs','scripts/test-hackathon-discovery.cjs','scripts/test-hackathon-discovery-page.cjs',
 'scripts/test-mission20-discovery-hotfix.cjs','scripts/test-mission20-unverified-opportunities.cjs','scripts/test-mission20-discovery-hotfix-browser.cjs'];
 const result=await lint.lintFiles(files);const diagnostics=result.filter(r=>r.messages.length).map(r=>({file:r.filePath,messages:r.messages}));
 if(diagnostics.length)console.log(JSON.stringify(diagnostics,null,2));
 assert.equal(result.reduce((n,r)=>n+r.errorCount+r.warningCount,0),0,'No new scoped diagnostics permitted');
 const baselines=[];
 for(const file of legacy){const old=execFileSync('git',['show',base+':'+file],{encoding:'utf8'}),current=fs.readFileSync(file,'utf8');
  const [before]=await lint.lintText(old,{filePath:file}),[after]=await lint.lintText(current,{filePath:file});
  const entries=(r,s)=>r.messages.map(m=>JSON.stringify({rule:m.ruleId,severity:m.severity,message:m.message.split('\n\n'+path.resolve(file)+':')[0],line:s.split(/\r?\n/)[m.line-1]?.trim()})).sort();
  assert.deepEqual(entries(after,current),entries(before,old),'Preserve exact baseline diagnostics: '+file);baselines.push({file,errors:after.errorCount,warnings:after.warningCount});
 }
 console.log(JSON.stringify({scopedFiles:files.length,newErrors:0,newWarnings:0,baselines,base}));
})().catch(e=>{console.error(e);process.exitCode=1;});
