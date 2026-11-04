/* eslint-disable @typescript-eslint/no-require-imports -- Explicit offline regression selection; never discovers/runs live smoke scripts. */
const {spawnSync}=require('node:child_process');
const files=[
 'test-auth-return-paths','test-auth-return-ui','test-evaluator-generation-admission','test-feature-retirement','test-evaluator-reliability','test-evaluator-result-authority','test-evaluator-maintenance','test-ppt-vision','test-ppt-document-identity','test-team-creation','test-squad-matching','test-partner-presentation','test-partner-discovery-navigation','test-partner-admin','test-partner-authorization','test-certificate-verification-page',
 'test-rack-it-up-2026','test-rack-conversion-funnel','test-onboarding-submission','test-public-hackathon-browsing','test-event-compatibility',
 'test-public-hackathon-data','test-public-hackathon-metadata','test-hackathon-discovery','test-hackathon-discovery-page','test-mission20-discovery-hotfix','test-mission20-unverified-opportunities','test-email-reliability','test-scraper-data-preservation','test-aggregator-sources','test-aggregator-transport','test-aggregator-lifecycle-evidence','test-aggregator-validation',
 'test-aggregator-partner-evidence','test-aggregator-ongoing','test-unattended-aggregator',
].map(n=>'scripts/'+n+'.cjs');
if(process.argv.includes('--list'))console.log(JSON.stringify(files,null,2));
else {const r=spawnSync(process.execPath,['--import','./qa/fixtures/rack-network-guard.mjs','--test','--test-concurrency=1',...files],{stdio:'inherit',timeout:600000,windowsHide:true});if(r.error)console.error(r.error);process.exitCode=r.status??1;}
