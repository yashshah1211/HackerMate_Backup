/* eslint-disable @typescript-eslint/no-require-imports -- Loopback-only browser fixtures; no production connections. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createServer } = require('node:http');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
const { existsSync, statSync } = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium, expect } = require('@playwright/test');
const ROOT = path.resolve(__dirname, '..');
const BASE = '432e76c2760946116fc298efd02efc208972e0f7';
const evidence = path.join(ROOT, 'docs/qa/first-team-activation');

// Test-only adapters. All database operations stay in memory and every unexpected write throws.
const adapters = {
  'next/link': `import React from 'react'; export default function Link({href,onClick,children,...props}) {
    return <a {...props} href={href} onClick={event=>{onClick?.(event); if(!event.defaultPrevented&&!event.metaKey&&!event.ctrlKey){event.preventDefault();history.pushState(null,'',href);window.dispatchEvent(new PopStateEvent('popstate'));}}}>{children}</a>; }`,
  'next/navigation': `export const usePathname=()=>location.pathname; export const useSearchParams=()=>new URLSearchParams(location.search);
    export const useParams=()=>({id:location.pathname.split('/')[2]}); export const useRouter=()=>({push:go,replace:go});
    function go(href){history.pushState(null,'',href);window.dispatchEvent(new PopStateEvent('popstate'));}`,
  '@/lib/posthog': `export const trackEvent=(name,properties)=>window.__qa.events.push({name,properties});`,
  '@/lib/supabase': `const team={id:'fixture-open',name:'QA Campus Builders',owner_id:'fixture-owner',description:'Building an accessible campus map for a synthetic hackathon.',skills:['React','Python'],roles_needed:['Frontend Developer'],college:null,max_members:4,is_recruiting:true,team_hackathons:[]};
    export const supabase={auth:{getUser:async()=>({data:{user:{id:'fixture-viewer'}}})},
      from(table){let single=false;return {select(){return this},eq(){return this},single(){single=true;return this},maybeSingle(){single=true;return this},
        then(resolve,reject){let data=[];if(table==='teams')data=team;else if(table==='profiles')data={skills:['React']};else if(single)data=null;return Promise.resolve({data,error:null}).then(resolve,reject)}}},
      async rpc(name,args){if(name!=='request_to_join_team')throw new Error('Unexpected fixture mutation: '+name);window.__qa.writes.push({name,args});return {data:null,error:null}}};`,
  '@/components/StreakWidget': `export default function Streak(){return null}`,
  '@/components/partners/HustlePartnershipBanner': `export default function Banner(){return null}`,
};
const entry = `import React,{useState,useEffect} from 'react';import{createRoot}from'react-dom/client';
  import{DashboardView}from'@/app/dashboard/DashboardView';import{TeamsView}from'@/app/teams/TeamsView';
  import TeamDetailsPage from '@/app/teams/[id]/page';import{NotificationProvider}from'@/context/NotificationContext';
  window.__qa={events:[],writes:[]};
  const scenario=new URLSearchParams(location.search).get('scenario')||'empty';
  const data={loading:scenario==='loading',teamsRefreshing:scenario==='refresh',redirecting:false,
    profile:{id:'fixture-viewer',full_name:'QA Student',college:'QA Campus',skills:['React'],bio:null,github_url:null,linkedin_url:null,avatar_url:null,onboarding_completed:scenario!=='incomplete'},
    completeness:{percent:60,missing:[]},nextStep:'Add a short bio when you are ready.',bestFit:[],campus:[],matchError:null,connectionStates:{},
    teams:scenario==='member'?[{id:'fixture-owned',name:'QA Existing Team',category:'project',tag:'PROJECT',eventName:'',memberCount:2,maxMembers:4,members:[],isOwner:false,firstHackathonId:null}]:[],
    queue:[],stats:{builders:20,teams:3,hackathons:2,closingSoon:0},activity:[],partners:[],year:{visible:false,value:'2nd Year',saving:false},busyId:null,joinBusyId:null,joinError:scenario==='error'?'Synthetic membership read failed':null};
  const noop=()=>{};const handlers={onReload:noop,onConfirmYear:noop,onYearChange:noop,onOpenProfileSetup:noop,onAcceptInvite:noop,onDeclineInvite:noop,onAcceptJoin:noop,onDeclineJoin:noop,onAcceptConnection:noop,onDeclineConnection:noop,onOpenInbox:noop};
  const teams=[{id:'fixture-open',name:'QA Campus Builders',description:'Building an accessible campus map for a synthetic hackathon.',skills:['React','Python'],college:null,hackathon_name:'QA Hackathon',max_members:4,is_recruiting:true,team_members:[{id:'fixture-owner'}]}];
  function App(){const[route,setRoute]=useState(location.pathname);useEffect(()=>{const change=()=>setRoute(location.pathname);window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change)},[]);
    return <NotificationProvider>{route==='/dashboard'?<DashboardView data={data} unreadMessages={0} handlers={handlers}/>:
      route==='/teams'?<TeamsView teams={teams} viewerSkills={['React']} loading={false} error={null} onRetry={noop} today="2026-10-19"/>:
      route==='/teams/fixture-open'?<TeamDetailsPage/>:<p>Fixture navigation destination: {route}</p>}</NotificationProvider>}
  createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`;

async function bundle(before) {
  const baseline = before ? execFileSync('git', ['show', BASE + ':src/app/dashboard/DashboardView.tsx'], { cwd: ROOT, encoding: 'utf8' }) : null;
  const result = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: ROOT }, bundle: true, write: false, jsx: 'automatic', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'offline-activation-fixtures', setup(builder) {
      builder.onResolve({ filter: /^(@\/|next\/)/ }, args => {
        if (adapters[args.path]) return { path: args.path, namespace: 'fixture' };
        const target = path.join(ROOT, 'src', args.path.slice(2));
        const file = [target, target + '.tsx', target + '.ts', target + '/index.ts'].find(file => existsSync(file) && statSync(file).isFile());
        assert(file, 'Unresolved source: ' + args.path); return { path: file };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: adapters[args.path], loader: 'tsx', resolveDir: ROOT }));
      if (before) builder.onLoad({ filter: /dashboard[\\/]DashboardView\.tsx$/ }, () => ({ contents: baseline, loader: 'tsx', resolveDir: path.join(ROOT, 'src/app/dashboard') }));
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
  let browser;
  const checks = [], external = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const [name, viewport, isMobile] of [['desktop', { width: 1440, height: 1000 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
      const context = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, reducedMotion: 'reduce' });
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage(), pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(origin + '/dashboard?before=1');
      await expect(page.locator('#your-teams')).toContainText("You're not on a team yet");
      await page.screenshot({ path: path.join(evidence, `before-${name}.png`), fullPage: true });
      await page.goto(origin + '/dashboard');
      const section = page.locator('#your-teams');
      await expect(section).toContainText('Find a hackathon team');
      await expect(section.getByRole('link')).toHaveCount(2);
      await page.screenshot({ path: path.join(evidence, `after-${name}.png`), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
      if (isMobile) for (const link of await section.getByRole('link').all()) assert((await link.boundingBox()).height >= 44, 'Mobile touch target under 44px');
      await expect.poll(() => page.evaluate(() => window.__qa.events)).toEqual([{ name: 'first_team_prompt_shown', properties: { source: 'dashboard_empty_teams' } }]);
      await section.getByRole('link', { name: 'Find a team', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(origin + '/teams');
      await expect(page.getByRole('link', { name: 'QA Campus Builders', exact: true })).toBeVisible();
      assert.deepEqual(await page.evaluate(() => window.__qa.writes), []);
      await expect.poll(() => page.evaluate(() => window.__qa.events.at(-1))).toEqual({ name: 'first_team_prompt_selected', properties: { source: 'dashboard_empty_teams', path: 'join' } });
      await page.getByRole('link', { name: 'QA Campus Builders', exact: true }).click();
      await expect(page).toHaveURL(origin + '/teams/fixture-open');
      const request = page.getByRole('button', { name: 'Request to join', exact: true });
      await expect(request).toBeVisible();
      for (const label of ['Share team', 'Edit team details', 'Invite builders']) await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
      assert.deepEqual(await page.evaluate(() => window.__qa.writes), []);
      await request.click();
      await expect.poll(() => page.evaluate(() => window.__qa.events.filter(event => event.name === 'team_join_request_sent').length)).toBe(1);
      assert.equal((await page.evaluate(() => window.__qa.writes)).length, 1);
      checks.push(`${name}: keyboard activation → discovery → actual team detail → explicit synthetic request; no automatic writes or management controls`);
      await page.goto(origin + '/dashboard');
      await page.locator('#your-teams').getByRole('link', { name: 'Create a team' }).click();
      await expect(page).toHaveURL(origin + '/teams/create');
      await expect.poll(() => page.evaluate(() => window.__qa.events.at(-1))).toEqual({ name: 'first_team_prompt_selected', properties: { source: 'dashboard_empty_teams', path: 'create' } });
      assert.deepEqual(await page.evaluate(() => window.__qa.writes), []);
      checks.push(`${name}: alternate create link retains route and records choice without mutation (form covered separately)`);
      for (const scenario of ['member', 'incomplete', 'loading', 'refresh', 'error']) {
        await page.goto(origin + '/dashboard?scenario=' + scenario);
        await expect(page.locator('#your-teams')).toBeAttached();
        await expect(page.locator('#your-teams').getByRole('link', { name: 'Find a team', exact: true })).toHaveCount(0);
        if (scenario === 'member') await expect(page.locator('#your-teams').getByRole('link', { name: /QA Existing Team/ })).toHaveAttribute('href', '/teams/fixture-owned/workspace');
        if (scenario === 'error') await expect(page.locator('#your-teams').getByRole('button', { name: 'Retry' })).toBeVisible();
        assert.deepEqual(await page.evaluate(() => window.__qa.events), []);
        assert.deepEqual(await page.evaluate(() => window.__qa.writes), []);
        checks.push(`${name}: ${scenario} suppresses activation prompt and analytics`);
      }
      assert.deepEqual(pageErrors, []); await context.close();
    }
    assert.deepEqual(external, [], 'Fixture attempted an external connection');
    const report = { baseline: BASE, screenshots: ['before-desktop.png', 'after-desktop.png', 'before-mobile.png', 'after-mobile.png'], checks, externalRequests: 0,
      limitations: 'Real components and application CSS with synthetic adapters; no Next server, live OAuth, database or GA ingestion. Google fonts use local system fallbacks. Before uses pinned main source; unrelated dashboard widgets are excluded identically from both screenshots.' };
    await writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`${checks.length} browser checks passed; four screenshots saved to docs/qa/first-team-activation; zero external requests.`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
