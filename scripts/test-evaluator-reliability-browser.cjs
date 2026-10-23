/* eslint-disable @typescript-eslint/no-require-imports -- Existing esbuild/Edge/loopback tooling, no live services. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync, statSync } = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const { build } = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium, expect } = require('@playwright/test');
const ROOT = path.resolve(__dirname, '..'), evidence = path.join(ROOT, 'docs/qa/evaluator-reliability');
const USER_A = '00000000-0000-4000-8000-000000000001', USER_B = '00000000-0000-4000-8000-000000000002';
const result = { trackId: 'generic', totalScore: 72, grade: 'Strong Contender ✅', subScores: { novelty: 18, tech: 18, uiUxOrFeasibility: 18, impactOrTeam: 18 },
  categoryLabels: { novelty: 'Problem clarity', tech: 'Architecture', uiUxOrFeasibility: 'Impact', impactOrTeam: 'Communication' },
  strengths: [], redFlags: ['Validation is planned, not measured.'], architectureSuggestions: ['Test the held-out examples.'], recommendedRoles: [], usedAiEngine: true,
  evaluationTimestamp: '2026-10-23T12:00:00Z', evaluationMetadata: { schemaVersion: 'evaluator-v1', rubricVersion: 'idea-v1', mode: 'text_only', trackId: 'generic', attempts: 1, providerAttempts: [], evidence: {} } };
const legacy = { ...result, totalScore: 42, grade: 'Needs Iteration ⚠️', subScores: { novelty: 10, tech: 12, uiUxOrFeasibility: 10, impactOrTeam: 10 }, usedAiEngine: false, evaluationMetadata: undefined, fallbackReason: 'gemini_api_error' };
const adapters = {
  'next/link': `import React from 'react';export default function Link({href,children,...props}){return <a {...props} href={href}>{children}</a>}`,
  'next/navigation': `export const useSearchParams=()=>new URLSearchParams(location.search);export const useParams=()=>({slug:'fixture-challenge',submissionId:'00000000-0000-4000-8000-000000000007'});export const useRouter=()=>({push(url){window.__qa.navigation=url},replace(){},refresh(){}});`,
  '@/context/NotificationContext': `const api={showToast(){},confirm(){}};export const useNotification=()=>api;`,
  '@/components/AuthModal': `export default function AuthModal(){return null}`,
  '@/components/LinkedIdeaScorecard': `export default function LinkedIdea(){return null}`,

  '@/lib/supabase': `
    const params=new URLSearchParams(location.search);let actor=params.has('guest')?null:{id:'${USER_A}',email:'fixture@example.invalid'};
    const callbacks=new Set();const session=()=>actor?{user:actor,access_token:'offline-token-'+actor.id}:null;
    let rejectInitial;const pending=new Promise((_resolve,reject)=>{rejectInitial=reject});
    window.__qa={failInitial(){rejectInitial(Error('Old initial identity failure'))},switchUser(id){actor=id?{id,email:'fixture@example.invalid'}:null;for(const cb of callbacks)cb('SIGNED_IN',session())}};
    export const supabase={auth:{getUser:()=>params.has('initial-auth-reject')?pending:Promise.resolve({data:{user:actor},error:null}),getSession:async()=>({data:{session:session()},error:null}),
      onAuthStateChange(cb){callbacks.add(cb);queueMicrotask(()=>{if(callbacks.has(cb))cb('INITIAL_SESSION',session())});return{data:{subscription:{unsubscribe(){callbacks.delete(cb)}}}}}},
      from(table){const q={select(){return this},eq(){return this},order(){return this},abortSignal(){return this},maybeSingle(){if(table==='teams')return Promise.resolve({data:{id:'00000000-0000-4000-8000-000000000004',owner_id:params.has('visitor')?'other':actor?.id,team_hackathons:[],team_members:[]},error:null});throw Error('Unexpected single fixture table')},then(resolve,reject){if(!['team_members','hackathons'].includes(table))throw Error('Unexpected fixture table');return Promise.resolve({data:[],error:null}).then(resolve,reject)}};return q;}};`,
};
async function bundle() {
  const output = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Pitch from'@/components/PitchEvaluatorClient';import PPT from'@/components/PPTEvaluatorTab';import Challenge from'@/app/challenges/[slug]/page';import Result from'@/app/challenges/[slug]/submissions/[submissionId]/page';const view=location.pathname.includes('qa/ppt')?<PPT teamId="00000000-0000-4000-8000-000000000004"/>:location.pathname.includes('qa/challenge-result')?<Result/>:location.pathname.includes('qa/challenge')?<Challenge/>:<Pitch initialTrack="generic"/>;createRoot(document.getElementById('root')).render(<React.StrictMode>{view}</React.StrictMode>);`, loader: 'tsx', resolveDir: ROOT }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'offline-evaluator', setup(builder) {
      builder.onResolve({ filter: /^(@\/|next\/)/ }, args => {
        if (adapters[args.path]) return { path: args.path, namespace: 'fixture' };
        const target = path.join(ROOT, 'src', args.path.slice(2));
        const file = [target, target + '.ts', target + '.tsx', target + '/index.ts'].find(f => existsSync(f) && statSync(f).isFile());
        assert(file, 'Unresolved source: ' + args.path); return { path: file };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: adapters[args.path], loader: 'tsx', resolveDir: ROOT }));
    } }] });
  return output.outputFiles[0].text;
}
(async () => {
  await fs.mkdir(evidence, { recursive: true });
  const javascript = await bundle();
  const css = (await postcss([tailwind()]).process(await fs.readFile(path.join(ROOT, 'src/app/globals.css'), 'utf8'), { from: path.join(ROOT, 'src/app/globals.css') })).css;
  const server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); return res.end(javascript); }
    if (req.url === '/app.css') { res.setHeader('content-type', 'text/css'); return res.end(css); }
    if (req.url.startsWith('/api/')) { res.statusCode = 500; return res.end('Unexpected unmocked API request'); }
    res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>:root{--font-ui:Arial;--font-display-face:Arial;--font-code:monospace}*{animation:none!important;transition:none!important}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  let browser; const checks = [], external = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch(process.env.QA_CHROMIUM_PATH ? { executablePath: process.env.QA_CHROMIUM_PATH, headless: true } : process.platform === 'win32' ? { channel: 'msedge', headless: true } : { headless: true });
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
      let mode = 'failure', showLegacy = false, legacyTrack = 'generic', legacyAI = false, release, started; const posts = [], errors = [];
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
        if (url.pathname === '/api/evaluator/history') return route.fulfill({ json: { success: true, history: showLegacy ? [{ id: 'legacy-fixture', ps_title: 'Legacy proposal', created_at: '2026-10-01', track_id: legacyTrack || undefined, total_score: 42, grade: legacy.grade, evaluation_result: { ...legacy, usedAiEngine: legacyAI, trackId: legacyTrack || undefined } }] : [] } });
        if (url.pathname === '/api/evaluator/evaluate') {
          posts.push({ headers: request.headers(), body: request.postDataJSON() });
          if (mode === 'lost') return route.abort();
          if (mode === 'deferred') { started = true; await new Promise(resolve => { release = resolve; }); }
          const success = mode === 'success' || mode === 'deferred';
          return route.fulfill({ status: success ? 200 : ['duplicate', 'cooldown'].includes(mode) ? 409 : 503, json: success ? { success: true, result, persistence: 'saved', savedEvaluationId: '00000000-0000-4000-8000-000000000003' } : { success: false, result: null, requestId: '00000000-0000-4000-8000-000000000004', retryable: true, code: mode === 'duplicate' ? 'duplicate_request' : mode === 'cooldown' ? 'cooldown' : 'provider_unavailable', error: 'AI evaluation is unavailable. No score was generated.' } }).catch(() => {});
        }
        return route.continue();
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      const fill = async (title = 'Offline proposal') => { await page.getByLabel('Project or pitch title').fill(title); await page.getByLabel('Problem and proposed solution').fill('We propose a classifier with a held-out validation set.'); };
      const submit = () => page.locator('button[type=submit]').click();
      await page.goto(origin + '/tools/pitch-evaluator'); await expect(page.locator('button[type=submit]')).toBeEnabled(); await fill();
      await submit(); await expect(page.getByRole('alert').last()).toContainText('No score was generated'); await expect(page.getByRole('heading', { name: 'Offline proposal', exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Project or pitch title')).toHaveValue('Offline proposal'); await expect(page.getByRole('button', { name: 'Copy summary' })).toHaveCount(0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 390) await page.screenshot({ path: path.join(evidence, 'idea-failure-390.png'), fullPage: true });
      mode = 'lost'; await submit(); await expect(page.getByRole('alert').last()).toContainText('retry token are preserved'); const lostToken = posts.at(-1).headers['idempotency-key'];
      mode = 'cooldown'; await submit(); await expect(page.getByRole('alert').last()).toContainText('No score was generated'); assert.equal(posts.at(-1).headers['idempotency-key'], lostToken);
      mode = 'duplicate'; await submit(); await expect(page.getByRole('alert').last()).toContainText('No score was generated'); assert.equal(posts.at(-1).headers['idempotency-key'], lostToken);
      mode = 'success'; await submit(); await expect(page.getByRole('heading', { name: 'Offline proposal', exact: true })).toBeVisible(); await expect(page.getByText('AI · Text only', { exact: true })).toBeVisible(); assert.notEqual(posts.at(-1).headers['idempotency-key'], lostToken);
      assert(posts.every(p => p.headers.authorization === `Bearer offline-token-${USER_A}` && !Object.hasOwn(p.body, 'userId')));
      await page.getByLabel('Project or pitch title').fill('Edited proposal'); await expect(page.getByRole('button', { name: 'Copy summary' })).toHaveCount(0);
      mode = 'deferred'; started = false; await fill('Account A private proposal'); await submit(); await expect.poll(() => started).toBe(true);
      await expect(page.getByLabel('Project or pitch title')).toBeDisabled(); await expect(page.getByText(/Step \d of/)).toHaveCount(0);
      await page.evaluate(id => window.__qa.switchUser(id), USER_B); await expect(page.getByLabel('Project or pitch title')).toHaveValue(''); release();
      await expect(page.locator('button[type=submit]')).toBeEnabled(); await expect(page.getByText('Account A private proposal', { exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Copy summary' })).toHaveCount(0);
      mode = 'success'; await fill('Account B proposal'); await submit(); await expect(page.getByRole('heading', { name: 'Account B proposal', exact: true })).toBeVisible(); assert.equal(posts.at(-1).headers.authorization, `Bearer offline-token-${USER_B}`);
      showLegacy = true; await page.goto(origin + '/tools/pitch-evaluator'); await expect(page.locator('button[type=submit]')).toBeEnabled();
      await page.getByRole('button', { name: /History/ }).click(); await page.getByText('Legacy proposal', { exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByText('Legacy heuristic check', { exact: true })).toBeVisible(); await expect(page.getByText(/Historical score;/)).toBeVisible();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 1440) await page.screenshot({ path: path.join(evidence, 'legacy-mode-1440.png'), fullPage: true });
      legacyTrack = null; legacyAI = true; await page.goto(origin + '/tools/pitch-evaluator'); await expect(page.locator('button[type=submit]')).toBeEnabled();
      await page.getByRole('button', { name: /History/ }).click(); await expect(page.getByText('Unknown historical rubric', { exact: true })).toBeVisible(); await page.getByText('Legacy proposal', { exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByText('Historical rubric unknown', { exact: true })).toBeVisible(); await expect(page.getByText('Legacy AI · mode unrecorded', { exact: true })).toBeVisible();
      await page.goto(origin + '/tools/pitch-evaluator?initial-auth-reject=1'); await expect(page.locator('button[type=submit]')).toBeEnabled();
      await page.evaluate(id => { window.__qa.switchUser(id); window.__qa.failInitial(); }, USER_B); await expect(page.getByRole('alert').last()).toHaveCount(0); await expect(page.locator('button[type=submit]')).toBeEnabled();
      showLegacy = false; await page.goto(origin + '/tools/pitch-evaluator?engine=heuristic'); await expect(page.locator('button[type=submit]')).toBeEnabled(); await fill(); const before = posts.length;
      await submit(); await expect(page.getByRole('alert').last()).toContainText('Heuristic scoring is retired'); assert.equal(posts.length, before); await expect(page.getByRole('link', { name: 'Open AI evaluation' })).toHaveAttribute('href', '/tools/pitch-evaluator');
      assert.deepEqual(errors, []);
      checks.push({ width, passed: ['no new score/share on failure', 'draft retained', 'uncertain network and cooldown retain retry token', 'confirmed terminal response permits later explicit token', 'Bearer identity without body userId', 'edited inputs invalidate scorecard', 'account switch discards stale response and private draft', 'new identity used on next explicit request', 'legacy heuristic readable and labelled', 'unknown historical rubric and AI mode never guessed', 'stale initial Auth error ignored after identity switch', 'forced heuristic retired', 'no simulated stage claims', 'no horizontal overflow'] });
      await context.close();
    }

    const presentationChecks=[];
    const TEAM='00000000-0000-4000-8000-000000000004', CHALLENGE='00000000-0000-4000-8000-000000000005', SAVED='00000000-0000-4000-8000-000000000007';
    const challengeFixture={id:CHALLENGE,slug:'fixture-challenge',challenge_number:1,title:'Offline systems practice',track:'Open',difficulty:'Intermediate',summary:'Explain a proposed system.',problem_statement:'Explain a useful system and its validation method.',constraints:[],slide_template:[],additional_rules:null,status:'active',starts_at:new Date(Date.now()-100000).toISOString(),ends_at:new Date(Date.now()+86400000).toISOString()};
    function pitchRecord(mode='visual_text') {return {id:SAVED,team_id:TEAM,track_id:'generic',ps_title:'Offline deck review',ps_category:'software',version:1,status:'completed',file_name:'Synthetic.pdf',created_at:'2026-10-24T12:00:00Z',score_novelty:18,score_tech:18,score_ui_ux:18,score_team:18,total_score:72,grade:'Promising',ai_feedback:{usedAiFallback:false,track_id:'generic',strengths:[],criticalRisks:['The proposal does not establish measured results.'],scoreDeductions:{tech:'Lost 7 points. Define a validation method.'},slideRecommendations:{technicalApproach:'Describe the actual data flow.'},slideFeedback:mode==='visual_text'?[{slideNumber:1,title:'Proposed architecture',observation:'A client and API are connected in the supplied diagram.',recommendation:'Label the failure path.'}]:[],analysis:{mode,pdfReceived:mode==='visual_text',schemaVersion:'evaluator-v1',rubricVersion:'ppt-v1',trackId:'generic',categoryCaps:{scoreNovelty:25,scoreTech:25,scoreUiUx:25,scoreTeam:25},categoryLabels:{scoreNovelty:'Problem clarity',scoreTech:'Architecture',scoreUiUx:'Impact',scoreTeam:'Communication'}}}}}
    const challengeRecord={id:SAVED,challenge_id:CHALLENGE,user_id:USER_A,submission_mode:'solo',submission_type:'external_link',version:1,status:'completed',file_name:'Synthetic.pdf',score_problem:5,score_solution:5,score_architecture:5,score_feasibility_impact:5,total_score:20,grade:'Needs Revision',strengths:[],growth_areas:['Explain how the proposed system will be tested.'],slide_feedback:{slide3:'Describe the claimed classifier and its held-out test method.'},format_violations:[],score_deductions:{},ai_raw_feedback:{topActionItem:'Describe a validation method.',analysis:{mode:'text_only',pdfReceived:false,rubricVersion:'challenge-v1',schemaVersion:'evaluator-v1'}},used_ai_fallback:false,created_at:'2026-10-24T12:00:00Z'};
    for(const width of [390,1440]) {
      const context=await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});
      let apiMode='failure',history=[],resultRecord=challengeRecord,release,started;const posts=[],errors=[];
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());if(url.origin!==origin){external.push(url.origin);return route.abort()}
        if(url.pathname===('/api/teams/'+TEAM+'/ppt-evaluations'))return route.fulfill({json:{evaluations:history}});
        if(url.pathname==='/api/challenges/fixture-challenge')return route.fulfill({json:{challenge:challengeFixture,userTeams:[{id:TEAM,name:'Synthetic team'}]}});
        if(url.pathname==='/api/challenges/fixture-challenge/submissions')return route.fulfill({json:{submissions:[]}});
        if(url.pathname===('/api/challenges/fixture-challenge/submissions/'+SAVED))return route.fulfill({json:{submission:resultRecord,challenge:challengeFixture}});
        if(url.pathname.endsWith('/ppt-evaluate')||url.pathname.endsWith('/fixture-challenge/evaluate')){
          posts.push({headers:request.headers(),body:request.postData(),path:url.pathname});
          if(apiMode==='lost')return route.abort();
          if(apiMode==='deferred'){started=true;await new Promise(resolve=>{release=resolve})}
          const success=['visual_text','text_only','deferred','challenge-success'].includes(apiMode);
          return route.fulfill({status:success?200:apiMode==='cooldown'?409:503,json:success?(url.pathname.endsWith('ppt-evaluate')?{success:true,evaluation:pitchRecord(apiMode==='visual_text'?'visual_text':'text_only')}:{success:true,submission:challengeRecord}):{success:false,result:null,code:apiMode==='cooldown'?'cooldown':'provider_unavailable',error:'AI evaluation is unavailable. No score was generated.'}}).catch(()=>{});
        }
        return route.continue();
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      const openPPT=async()=>{await page.goto(origin+'/qa/ppt');await expect(page.getByRole('button',{name:'Run review',exact:true})).toBeVisible()};
      const fillPPT=async()=>{await page.getByLabel('Problem statement or idea').fill('Offline deck review');await page.getByLabel('Google Slides or Drive link').fill('https://docs.google.com/presentation/d/fixture/edit')};
      await openPPT();await fillPPT();await page.getByRole('button',{name:'Run review',exact:true}).click();await expect(page.getByRole('alert').last()).toContainText('No score was generated');await expect(page.getByText('72',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Problem statement or idea')).toHaveValue('Offline deck review');
      apiMode='lost';await page.getByRole('button',{name:'Run review',exact:true}).click();await expect(page.getByRole('alert').last()).toContainText('could not be confirmed');const retry=posts.at(-1).headers['idempotency-key'];
      apiMode='cooldown';await page.getByRole('button',{name:'Run review',exact:true}).click();await expect(page.getByRole('alert').last()).toContainText('No score was generated');assert.equal(posts.at(-1).headers['idempotency-key'],retry);
      apiMode=width===1440?'visual_text':'text_only';await page.getByRole('button',{name:'Run review',exact:true}).click();await expect(page.getByText(width===1440?'VISUAL + TEXT':'TEXT ONLY',{exact:true})).toBeVisible();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(evidence,width===1440?'team-visual-1440.png':'team-text-390.png'),fullPage:true});
      if(width===390)await expect(page.getByText('Slide 1:',{exact:false})).toHaveCount(0);
      history=[{...pitchRecord(),status:'evaluating',updated_at:new Date(Date.now()-200000).toISOString()}];await openPPT();await expect(page.getByText(/Processing is interrupted or unconfirmed/)).toBeVisible();await expect(page.getByText('/100',{exact:true})).toHaveCount(0);history=[];
      apiMode='deferred';await fillPPT();await page.getByRole('button',{name:'Run review',exact:true}).click();await expect.poll(()=>started).toBe(true);await expect(page.getByLabel('Google Slides or Drive link')).toBeDisabled();await page.evaluate(id=>window.__qa.switchUser(id),USER_B);release();await expect(page.getByLabel('Problem statement or idea')).toHaveValue('');await expect(page.getByText('Offline deck review',{exact:true})).toHaveCount(0);
      await page.goto(origin+'/qa/ppt?visitor=1');await expect(page.getByRole('button',{name:'Retry access check',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Refresh history',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Run review',exact:true})).toHaveCount(0);
      apiMode='failure';await page.goto(origin+'/qa/challenge');await expect(page.getByRole('heading',{name:'Offline systems practice',exact:true})).toBeVisible();
      const link=page.locator('#challenge-deck-link');await expect(link).toBeVisible();await link.fill('https://docs.google.com/presentation/d/fixture/edit');
      const submit=()=>page.locator('button[type=submit]').click();await submit();await expect(page.getByRole('alert').last()).toContainText('No score was generated');await expect(link).toHaveValue('https://docs.google.com/presentation/d/fixture/edit');await expect(page.getByText(/multi-model AI evaluation cascade/i)).toHaveCount(0);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===390)await page.screenshot({path:path.join(evidence,'challenge-failure-390.png'),fullPage:true});
      apiMode='lost';await submit();await expect(page.getByRole('alert').last()).toContainText('could not be confirmed');const challengeToken=posts.at(-1).headers['idempotency-key'];apiMode='cooldown';await submit();await expect(page.getByRole('alert').last()).toContainText('No score was generated');assert.equal(posts.at(-1).headers['idempotency-key'],challengeToken);
      apiMode='deferred';started=false;await submit();await expect.poll(()=>started).toBe(true);await expect(link).toHaveCount(0);await expect(page.getByRole('heading',{name:'Scoring your deck'})).toBeVisible();await page.evaluate(id=>window.__qa.switchUser(id),USER_B);release();await expect(link).toHaveValue('');await expect(page.getByText('Text-only AI evaluation',{exact:true})).toHaveCount(0);
      await page.goto(origin+'/qa/challenge-result');await expect(page.getByText('TEXT ONLY',{exact:true})).toBeVisible();await expect(page.getByText(/^20\s*\/100$/)).toBeVisible();await expect(page.getByText('No strengths recorded.',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Topic feedback',exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Share',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Share',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('no independent verification');await expect(page.getByText('Verified by Multi-Model AI Jury')).toHaveCount(0);await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===1440)await page.screenshot({path:path.join(evidence,'challenge-text-1440.png'),fullPage:true});
      resultRecord={...challengeRecord,used_ai_fallback:true};await page.goto(origin+'/qa/challenge-result');await expect(page.getByText('LEGACY HEURISTIC',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Share',exact:true})).toBeDisabled();resultRecord={...challengeRecord,ai_raw_feedback:{}};await page.goto(origin+'/qa/challenge-result');await expect(page.getByText('MODE UNRECORDED',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Share',exact:true})).toBeDisabled();resultRecord=challengeRecord;
      await page.evaluate(id=>window.__qa.switchUser(id),USER_B);await expect(page.getByText("Couldn't load this evaluation",{exact:true})).toBeVisible();
      assert(posts.every(post=>post.headers.authorization.startsWith('Bearer offline-token-')&&post.headers['idempotency-key']));assert.deepEqual(errors,[]);
      presentationChecks.push({width,passed:['no score or celebration on failure','draft preserved','uncertain network and cooldown retain token','confirmed PPT visual/text mode','stale processing honestly labelled without score','pending form disabled','account switch discards old response and draft','visitor cannot submit team review','Challenge text-only disclosure and local score20','legacy/unknown results labelled and not shared as verified','qualified share text without multi-model verification claim','no overflow'],liveWrites:0});await context.close();
    }

    assert.deepEqual(external, []);
    const file = path.join(evidence, 'results.json'), record = JSON.parse(await fs.readFile(file, 'utf8'));
    record.validation.presentationBrowser = {status:'passed',checks:presentationChecks,externalRequests:0,liveDatabaseWrites:0,limitations:'Actual PPT/Challenge components and CSS with synthetic Auth/DB/API adapters. No live Auth/RLS/provider validation.'};
    record.validation.ideaBrowser = { status: 'passed', checks, externalRequests: 0, liveDatabaseWrites: 0, limitations: 'Actual Idea component/CSS with synthetic Auth/read/API adapters; no live Auth/RLS/provider or production evidence. Presentation browser results are recorded separately.' };
    await fs.writeFile(file, JSON.stringify(record, null, 2) + '\n');
    console.log('Idea, PPT and Challenge browser checks passed at 390 and 1440px, including stale-account and uncertain-response regressions.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
