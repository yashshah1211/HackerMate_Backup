/* eslint-disable @typescript-eslint/no-require-imports -- Loopback-only synthetic team-detail verification. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { existsSync, statSync } = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const { build } = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium, expect } = require('@playwright/test');
const ROOT = path.resolve(__dirname, '..'), BASE = '51af1f0d2ed8faa0fed7fb28e699f230496a98be';
const evidence = path.join(ROOT, 'docs/qa/team-owner-review');
const adapters = {
  'next/link': `import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`,
  'next/navigation': `export const useParams=()=>({id:'fixture-team'});const router={push(){}};export const useRouter=()=>router;`,
  '@/lib/posthog': `export const trackEvent=()=>{};`,
  '@/lib/matchingClient': `export const loadTeammateRecommendations=async()=>({data:[],error:null});`,
  '@/components/StreakWidget': `export default function Stub(){return null}`,
  '@/components/partners/HustlePartnershipBanner': `export default function Stub(){return null}`,
  '@/components/AuthGuard': `export default function AuthGuard({children}){return children}`,
  '@/context/NotificationContext': `export const useNotification=()=>({showToast:(...args)=>window.__qa.toasts.push(args)});`,
  '@/lib/supabase': `const listeners=new Set();const dashboard=location.pathname==='/dashboard';const qa=window.__qa={user:'owner',toasts:[],writes:[],capacityError:new URLSearchParams(location.search).has('capacity'),zero:true,pendingError:false,hold:false,releases:[],setUser(user){qa.user=user;for(const fn of listeners)fn('SIGNED_IN',{user:{id:user}})},release(){for(const fn of qa.releases.splice(0))fn()}};
  const profile={id:'synthetic-applicant',full_name:'Synthetic Campus Builder',skills:['React'],bio:'Building campus tools',college:'QA College',year_of_study:'3rd Year',onboarding_completed:true,avatar_url:null};
  let rows=[{id:'request-1',team_id:'fixture-team',user_id:profile.id,status:'pending',created_at:new Date().toISOString(),profiles:profile}];
  const team=()=>({id:'fixture-team',owner_id:'owner',name:'Campus Builders',max_members:4,team_hackathons:[],team_members:[{user_id:'owner',role:'owner',profiles:{...profile,id:'owner'}}]});
  export const subscribeWithRetry=()=>()=>{};
  export const supabase={channel:()=>({on(){return this}}),auth:{getUser:async()=>({data:{user:{id:qa.user}},error:null}),onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}},from(table){let deleting=false,id,single=false,head=false;return{select(_c,settings){head=!!settings?.head;return this},eq(k,v){if(k==='id')id=v;return this},in(){return this},neq(){return this},or(){return this},gte(){return this},lte(){return this},limit(){return this},order(){return this},single(){single=true;return this},maybeSingle(){single=true;return this},delete(){deleting=true;return this},then(resolve,reject){if(deleting){qa.writes.push({table,id});return Promise.resolve({data:qa.zero?[]:[{id}],error:null}).then(resolve,reject)}let result={data:[],error:null,count:0};if(table==='teams')result={data:head?null:single||!dashboard?team():[team()],error:null,count:1};if(table==='profiles')result={data:single?{...profile,id:qa.user}:[],error:null,count:0};if(table==='team_members')result={data:[],count:qa.capacityError?null:1,error:qa.capacityError?{message:'Synthetic capacity failure'}:null};if(table==='team_join_requests')result={data:qa.pendingError?null:single?rows.find(r=>r.id===id)||null:rows,error:qa.pendingError?{message:'Synthetic pending refresh failure'}:null};return Promise.resolve(result).then(resolve,reject)}}},async rpc(name,args){qa.writes.push({name,args});if(qa.hold)await new Promise(done=>qa.releases.push(done));rows=rows.filter(r=>r.id!==args.p_request_id);return{data:'fixture-team',error:null}}};`,
};
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import Page from '@/app/teams/[id]/requests/page';import{useDashboardData}from '@/app/dashboard/useDashboardData';import{DashboardView}from '@/app/dashboard/DashboardView';function Dashboard(){const dash=useDashboardData();return <DashboardView data={dash.data} unreadMessages={0} handlers={{onAcceptJoin:dash.acceptJoinRequest,onDeclineJoin:dash.declineJoinRequest,onReload:dash.reload,onConfirmYear(){},onYearChange(){},onOpenProfileSetup(){},onOpenInbox(){}}}/>};createRoot(document.getElementById('root')).render(location.pathname==='/dashboard'?<Dashboard/>:<Page/>);`;

async function bundle(before) {
  const baseline = name => execFileSync('git', ['show', BASE + ':' + name], { cwd: ROOT, encoding: 'utf8' });
  const result = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: ROOT }, bundle: true, write: false, jsx: 'automatic', platform: 'browser', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'synthetic-team-adapters', setup(builder) {
      builder.onResolve({ filter: /^(@\/|next\/)/ }, args => {
        if (adapters[args.path]) return { path: args.path, namespace: 'fixture' };
        const target = path.join(ROOT, 'src', args.path.slice(2));
        const file = [target, target + '.tsx', target + '.ts', target + '/index.ts'].find(file => existsSync(file) && statSync(file).isFile());
        assert(file, 'Unresolved source: ' + args.path); return { path: file };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: adapters[args.path], loader: 'tsx', resolveDir: ROOT }));
      if (before) builder.onLoad({ filter: /teams[\\/]\[id\][\\/]requests[\\/]page\.tsx$/ }, args => ({ contents: baseline(path.relative(ROOT, args.path).replaceAll('\\', '/')), loader: 'tsx', resolveDir: path.dirname(args.path) }));
    } }] });
  return result.outputFiles[0].text;
}
async function main() {
  await mkdir(evidence, { recursive: true });
  const [before, after, source] = await Promise.all([bundle(true), bundle(false), readFile(path.join(ROOT, 'src/app/globals.css'), 'utf8')]);
  const css = (await postcss([tailwind()]).process(source, { from: path.join(ROOT, 'src/app/globals.css') })).css;
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(url.searchParams.has('before') ? before : after); }
    else if (url.pathname === '/app.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>:root{--font-ui:Arial;--font-display-face:Arial;--font-code:monospace}*{animation:none!important;transition:none!important}</style></head><body><div id="root"></div><script src="/app.js' + (url.searchParams.has('before') ? '?before=1' : '') + '"></script></body></html>'); }
  });
  let browser; let rpcCount=0; const checks = [], external = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const width of [320,390,768,1440]) {
      const context = await browser.newContext({ viewport:{width,height:900}, reducedMotion:'reduce' });
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(external.push(route.request().url()),route.abort()));
      const page=await context.newPage(), errors=[];page.on('pageerror',error=>errors.push(error.message));
      const button=name=>page.getByRole('button',{name,exact:true});
      await page.goto(origin+'/teams/fixture-team/requests?before=1&capacity=1');
      await expect(button('Accept')).toBeVisible();
      await page.screenshot({path:path.join(evidence,`before-${width}.png`),fullPage:true});
      await button('Decline').click();await expect.poll(()=>page.evaluate(()=>window.__qa.toasts.length)).toBe(1);
      assert.equal(await page.evaluate(()=>window.__qa.toasts[0][1]),'info');
      checks.push(`${width}: baseline reproduces acceptance after capacity failure and false zero-row decline`);
      await page.goto(origin+'/teams/fixture-team/requests?capacity=1');
      await expect(page.getByRole('alert')).toContainText('Capacity is unavailable');await expect(button('Accept')).toHaveCount(0);
      await page.screenshot({path:path.join(evidence,`after-${width}.png`),fullPage:true});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await button('Decline').focus();await expect(button('Decline')).toBeFocused();await page.keyboard.press('Enter');
      await expect.poll(()=>page.evaluate(()=>window.__qa.toasts.length)).toBe(1);assert.equal(await page.evaluate(()=>window.__qa.toasts[0][1]),'error');
      await expect(button('Decline')).toBeEnabled();
      await page.evaluate(()=>{window.__qa.capacityError=false;window.__qa.pendingError=true});await button('Decline').click();
      await expect(page.getByRole('alert')).toContainText("Couldn't verify the latest requests");
      await expect(button('Decline')).toBeDisabled();await expect(button('Accept')).toBeDisabled();
      await page.screenshot({path:path.join(evidence,`stale-pending-${width}.png`),fullPage:true});
      const writes=await page.evaluate(()=>window.__qa.writes.length);
      await page.evaluate(()=>{window.__qa.pendingError=false});const retry=page.getByRole('button',{name:/Retry/});await retry.focus();await expect(retry).toBeFocused();await page.keyboard.press('Enter');
      await expect(button('Accept')).toBeEnabled();await expect(button('Decline')).toBeEnabled();assert.equal(await page.evaluate(()=>window.__qa.writes.length),writes);

      await page.evaluate(()=>{window.__qa.hold=true});await button('Accept').click();await expect(button('Decline')).toBeDisabled();
      await page.evaluate(()=>window.__qa.setUser('different-account'));await expect(button('Accept')).toHaveCount(0);
      await page.evaluate(()=>window.__qa.release());assert.equal(await page.evaluate(()=>window.__qa.toasts.filter(t=>t[1]==='success').length),0);
      rpcCount+=await page.evaluate(()=>window.__qa.writes.filter(w=>w.name).length);
      await page.goto(origin+'/dashboard');const queue=page.locator('#needs-you');await expect(queue.getByRole('button',{name:'Decline',exact:true})).toBeVisible();
      await queue.getByRole('button',{name:'Decline',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__qa.toasts.length)).toBe(1);
      assert.equal(await page.evaluate(()=>window.__qa.toasts[0][1]),'error');await expect(queue.getByRole('button',{name:'Accept',exact:true})).toBeEnabled();
      await queue.getByRole('button',{name:'Accept',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__qa.toasts.some(t=>t[1]==='success'))).toBe(true);
      rpcCount+=await page.evaluate(()=>window.__qa.writes.filter(w=>w.name).length);
      assert.deepEqual(errors,[]);checks.push(`${width}: no overflow, capacity-only decline enabled, failed pending refresh disables retained rows, keyboard read-only Retry recovery, busy lock, stale success suppressed; dashboard zero-row decline and confirmed accept`);await context.close();
    }
    assert.deepEqual(external, []);
    await writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify({ baseline: BASE, checks, externalRequests: 0, syntheticRequestRPCs: rpcCount,
      limitations: 'Real request page and dashboard hook/view/components/CSS; mocked Supabase, matching, notification, Next navigation and unrelated dashboard decorations. System fonts replace Next fonts. No live Supabase, RLS, middleware, real OAuth or production writes.' }, null, 2) + '\n');
    console.log(`${checks.length} viewport checks passed; twelve screenshots; zero external requests; ${rpcCount} explicitly initiated synthetic RPCs.`);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
