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
const ROOT = path.resolve(__dirname, '..'), evidence = path.resolve(ROOT, process.env.HM_EVALUATOR_BROWSER_EVIDENCE || 'scratch/feature-retirement/ppt');
const USER_A = '00000000-0000-4000-8000-000000000001', USER_B = '00000000-0000-4000-8000-000000000002';
const adapters = {
  'next/link': `import React from 'react';export default function Link({href,children,...props}){return <a {...props} href={href}>{children}</a>}`,
  'next/navigation': `export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push(url){window.__qa.navigation=url},replace(){},refresh(){}});`,
  '@/context/NotificationContext': `const api={showToast(){},confirm(){}};export const useNotification=()=>api;`,
  '@/components/AuthModal': `export default function AuthModal(){return null}`,

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
  const output = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import PPT from'@/components/PPTEvaluatorTab';const view=<PPT teamId="00000000-0000-4000-8000-000000000004"/>;createRoot(document.getElementById('root')).render(<React.StrictMode>{view}</React.StrictMode>);`, loader: 'tsx', resolveDir: ROOT }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
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
  let browser; const external = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch(process.env.QA_CHROMIUM_PATH ? { executablePath: process.env.QA_CHROMIUM_PATH, headless: true } : { channel: 'chrome', headless: true, chromiumSandbox: true });
    const presentationChecks=[];
    const TEAM='00000000-0000-4000-8000-000000000004', SAVED='00000000-0000-4000-8000-000000000007';
    function pitchRecord(mode='visual_text') {return {id:SAVED,team_id:TEAM,track_id:'generic',ps_title:'Offline deck review',ps_category:'software',version:1,status:'completed',file_name:'Synthetic.pdf',created_at:'2026-10-24T12:00:00Z',score_novelty:18,score_tech:18,score_ui_ux:18,score_team:18,total_score:72,grade:'Promising',ai_feedback:{usedAiFallback:false,track_id:'generic',strengths:[],criticalRisks:['The proposal does not establish measured results.'],scoreDeductions:{tech:'Lost 7 points. Define a validation method.'},slideRecommendations:{technicalApproach:'Describe the actual data flow.'},slideFeedback:mode==='visual_text'?[{slideNumber:1,title:'Proposed architecture',observation:'A client and API are connected in the supplied diagram.',recommendation:'Label the failure path.'}]:[],analysis:{mode,pdfReceived:mode==='visual_text',schemaVersion:'evaluator-v1',rubricVersion:'ppt-v1',trackId:'generic',categoryCaps:{scoreNovelty:25,scoreTech:25,scoreUiUx:25,scoreTeam:25},categoryLabels:{scoreNovelty:'Problem clarity',scoreTech:'Architecture',scoreUiUx:'Impact',scoreTeam:'Communication'}}}}}
    for(const width of [390,1440]) {
      const context=await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});
      let apiMode='failure',history=[],release,started;const posts=[],errors=[];
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());if(url.origin!==origin){external.push(url.origin);return route.abort()}
        if(url.pathname===('/api/teams/'+TEAM+'/ppt-evaluations'))return route.fulfill({json:{evaluations:history}});
        if(url.pathname.endsWith('/ppt-evaluate')){
          posts.push({headers:request.headers(),body:request.postData(),path:url.pathname});
          if(apiMode==='lost')return route.abort();
          if(apiMode==='deferred'){started=true;await new Promise(resolve=>{release=resolve})}
          const success=['visual_text','text_only','deferred'].includes(apiMode);
          return route.fulfill({status:success?200:apiMode==='cooldown'?409:503,json:success?{success:true,evaluation:pitchRecord(apiMode==='visual_text'?'visual_text':'text_only')}:{success:false,result:null,code:apiMode==='cooldown'?'cooldown':'provider_unavailable',error:'AI evaluation is unavailable. No score was generated.'}}).catch(()=>{});
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
      await page.getByRole('button',{name:/v1.*Offline deck review/}).click();
      await expect(page.getByText('Historical provenance unverified',{exact:true})).toBeVisible();
      history=[pitchRecord(width===1440?'visual_text':'text_only')];
      await page.getByRole('button',{name:/Refresh history/}).click();
      await expect(page.getByText('Historical provenance unverified',{exact:true})).toBeVisible();
      await expect(page.getByText('VISUAL + TEXT',{exact:true})).toHaveCount(0);
      await expect(page.getByText('TEXT ONLY',{exact:true})).toHaveCount(0);
      await page.reload();await expect(page.getByText('Historical provenance unverified',{exact:true})).toBeVisible();
      if(width===1440)await expect(page.getByRole('heading',{name:'Reported slide feedback',exact:true})).toBeVisible();

      history=[{...pitchRecord(),status:'evaluating',updated_at:new Date(Date.now()-200000).toISOString()}];await openPPT();await expect(page.getByText(/Processing is interrupted or unconfirmed/)).toBeVisible();await expect(page.getByText('/100',{exact:true})).toHaveCount(0);history=[];
      apiMode='deferred';await fillPPT();await page.getByRole('button',{name:'Run review',exact:true}).click();await expect.poll(()=>started).toBe(true);await expect(page.getByLabel('Google Slides or Drive link')).toBeDisabled();await page.evaluate(id=>window.__qa.switchUser(id),USER_B);release();await expect(page.getByLabel('Problem statement or idea')).toHaveValue('');await expect(page.getByText('Offline deck review',{exact:true})).toHaveCount(0);
      await page.goto(origin+'/qa/ppt?visitor=1');await expect(page.getByRole('button',{name:'Retry access check',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Refresh history',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Run review',exact:true})).toHaveCount(0);
      assert(posts.every(post=>post.headers.authorization.startsWith('Bearer offline-token-')&&post.headers['idempotency-key']));assert.deepEqual(errors,[]);
      presentationChecks.push({width,passed:['no score or celebration on failure','draft preserved','uncertain network and cooldown retain token','confirmed PPT visual/text mode','stale processing honestly labelled without score','pending form disabled','account switch discards old response and draft','visitor cannot submit team review','PPT historical provenance remains unverified','no overflow'],liveWrites:0});await context.close();
    }

    assert.deepEqual(external, []);
    await fs.writeFile(path.join(evidence,'ppt-retirement-results.json'),JSON.stringify({presentationChecks,externalRequests:external.length},null,2));
    console.log(JSON.stringify({passed:presentationChecks.length,failed:0,viewports:[390,1440],syntheticOnly:true}));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
