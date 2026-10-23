/* eslint-disable @typescript-eslint/no-require-imports -- Isolated real-component browser checks, never live Supabase. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createServer } = require('node:http');
const fs = require('node:fs/promises');
const { existsSync, statSync } = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium, expect } = require('@playwright/test');
const ROOT = path.resolve(__dirname, '..');
const BASE = '51af1f0d2ed8faa0fed7fb28e699f230496a98be';
const evidence = path.join(ROOT, 'docs/qa/responsive-team-discovery');
const adapters = {
  'next/link': `import React from 'react';export default function Link({href,children,...props}){return <a {...props} href={href} onClick={e=>{e.preventDefault();history.pushState(null,'',href);window.dispatchEvent(new PopStateEvent('popstate'));}}>{children}</a>}`,
  'next/navigation': `export const usePathname=()=>location.pathname;`,
  '@/lib/supabase': `
    Date.now=()=>Date.parse('2026-10-19T12:00:00Z');
    const listeners=new Set();
    const qa=window.__qa={queries:[],writes:[],user:'viewer',release:null,setUser(user){qa.user=user;for(const fn of listeners)fn(user?'SIGNED_IN':'SIGNED_OUT',user?{user:{id:user}}:null)}};
    const params=new URLSearchParams(location.search);
    if(params.has('signedout'))qa.user=null;
    const team=(id,name,extra={})=>({id,name,owner_id:'owner-'+id,description:'Building accessible tools for students. Looking for thoughtful collaborators.',skills:['React'],college:'QA Campus',hackathon_name:null,max_members:4,is_recruiting:true,created_at:'2026-10-18T00:00:00Z',team_members:[{id:'m-'+id}],team_hackathons:[],...extra});
    const h={id:'event',name:'QA Design Sprint',archived:true,status:'approved',end_date:'2026-11-01'};
    const records=[team('stale','Campus Tools'),team('active','Open Source Builders',{skills:['React','TypeScript'],created_at:'2026-05-01T00:00:00Z'}),
      team('unknown','Weekend Makers',{created_at:'2026-09-01T00:00:00Z'}),
      team('less-relevant','Python Studio',{skills:['Python'],created_at:'2026-10-17T00:00:00Z'}),
      team('archived','Archived Event Team',{hackathon_id:h.id,hackathons:h}),
      team('ended','Concluded Event Team',{team_hackathons:[{hackathons:{id:'past',name:'QA Past Hackathon',end_date:'2026-10-18'}}]}),
      team('full','Full Team',{max_members:1}),team('closed','Closed Team',{is_recruiting:false})];
    export const supabase={auth:{getUser:async()=>({data:{user:qa.user?{id:qa.user}:null},error:null}),onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}},from(table){
      const q={table};const chain={select(columns){q.columns=columns;return this},eq(key,value){q[key]=value;return this},single(){return this},in(column,ids){q.ids=ids;return this},
        order(){return this},abortSignal(){return this},then(resolve,reject){window.__qa.queries.push(q);
          return Promise.resolve().then(()=>{if(table==='teams'){
            if(params.has('list-error'))return{data:null,error:{message:'Synthetic team read denied'}};
            const result={data:records.map(t=>JSON.parse(JSON.stringify(t))),error:null};
            if(params.has('list-slow'))return new Promise(done=>{qa.release=()=>done(result)});
            return result;}
          if(table==='profiles'&&q.columns==='skills')return{data:{skills:qa.user==='viewer-b'?['Python']:['React']},error:null};
          if(table==='profiles'&&q.columns==='id, last_seen_at'){
            if(params.has('denied'))return{data:null,error:{code:'42501'}};
            const result={data:[{id:'owner-active',last_seen_at:params.has('weak')?null:'2026-10-18T11:00:00+00:00'},{id:'owner-stale',last_seen_at:'2026-06-01T00:00:00Z'},
              {id:'owner-unknown',last_seen_at:null},{id:'owner-less-relevant',last_seen_at:params.has('weak')?null:'2026-10-19T10:00:00Z'}],error:null};
            if(params.has('slow'))return new Promise(done=>{qa.release=()=>done(result)});
            return result;}
          throw Error('Unexpected fixture query '+table+' '+q.columns);
        }).then(resolve,reject)}};return chain;}};`,
};
const entry = `import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';
 import{TeamsView}from'@/app/teams/TeamsView';import{useTeamsData}from'@/app/teams/useTeamsData';
 function App(){const d=useTeamsData();const[route,setRoute]=useState(location.pathname);useEffect(()=>{const change=()=>setRoute(location.pathname);window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change)},[]);
 return route==='/teams'?<TeamsView {...d} onRetry={d.reload} today="2026-10-19"/>:<p>Fixture destination: {route}</p>}
 createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`;
async function bundle(before) {
  const result = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: ROOT }, bundle: true, write: false, jsx: 'automatic', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'offline-team-discovery', setup(builder) {
      builder.onResolve({ filter: /^(@\/|next\/)/ }, args => {
        if (adapters[args.path]) return { path: args.path, namespace: 'fixture' };
        const target = path.join(ROOT, 'src', args.path.slice(2));
        const file = [target, target + '.tsx', target + '.ts', target + '/index.ts'].find(file => existsSync(file) && statSync(file).isFile());
        assert(file, 'Unresolved source: ' + args.path); return { path: file };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: adapters[args.path], loader: 'tsx', resolveDir: ROOT }));
      if (before) builder.onLoad({ filter: /teams[\\/](TeamsView\.tsx|useTeamsData\.ts)$/ }, args => ({
        contents: execFileSync('git', ['show', BASE + ':' + path.relative(ROOT, args.path).replaceAll('\\', '/')], { cwd: ROOT, encoding: 'utf8' }),
        loader: 'tsx', resolveDir: path.dirname(args.path),
      }));
    } }] });
  return result.outputFiles[0].text;
}
(async () => {
  await fs.mkdir(evidence, { recursive: true });
  const [before, after, source] = await Promise.all([bundle(true), bundle(false), fs.readFile(path.join(ROOT, 'src/app/globals.css'), 'utf8')]);
  const css = (await postcss([tailwind()]).process(source, { from: path.join(ROOT, 'src/app/globals.css') })).css;
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(url.searchParams.has('before') ? before : after); }
    if (url.pathname === '/app.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
    res.setHeader('Content-Type', 'text/html');res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>:root{--font-ui:Arial;--font-display-face:Arial;--font-code:monospace}*{animation:none!important;transition:none!important}</style></head><body><div id="root"></div><script src="/app.js' + (url.searchParams.has('before') ? '?before=1' : '') + '"></script></body></html>');
  });
  let browser;const checks = [], external = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ ...(process.env.QA_CHROMIUM_PATH ? { executablePath: process.env.QA_CHROMIUM_PATH } : process.platform === 'win32' ? { channel: 'msedge' } : { executablePath: '/usr/bin/chromium' }), headless: true });
    for (const width of [320, 390, 768, 1440]) {
      const name = String(width);
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, isMobile: width < 500, hasTouch: width < 500, reducedMotion: 'reduce' });
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage(), errors = [];page.on('pageerror', err => errors.push(err.message));
      const cards = () => page.locator('a[href^="/teams/"]').filter({ hasNotText: /New team|Create a team/ });
      const ids = () => cards().evaluateAll(nodes => nodes.map(node => node.getAttribute('href').slice(7)));
      await page.goto(origin + '/teams?before=1'); await expect(cards().first()).toBeVisible();
      assert.deepEqual(await ids(), ['stale', 'unknown', 'active', 'less-relevant']);
      await page.screenshot({ path: path.join(evidence, `before-${name}.png`), fullPage: true });
      await page.goto(origin + '/teams');
      await expect(cards().first()).toHaveText('Open Source Builders');
      assert.deepEqual(await ids(), ['active', 'less-relevant', 'stale', 'unknown']);
      await expect(page.getByText('Owner recently active', { exact: true })).toHaveCount(2);
      await expect(page.getByText(/doesn’t guarantee a response/)).toBeVisible();
      assert(!/last seen|online now|abandoned|2026-10-18T/.test(await page.locator('body').innerText()));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow ${width}`);
      await expect(page.getByText('No confirmed recent owner activity', { exact: true })).toHaveCount(2);
      await page.screenshot({ path: path.join(evidence, `after-${name}.png`), fullPage: true });
      const queries = await page.evaluate(() => window.__qa.queries);
      const activity = queries.filter(q => q.columns === 'id, last_seen_at');assert.equal(activity.length, 1);
      assert.equal(activity[0].ids.length, 8);assert.equal(new Set(activity[0].ids).size, 8);
      await page.getByRole('tab', { name: /All teams/ }).click();
      assert.equal((await ids()).length, 8);await expect(page.getByRole('link', { name: 'Archived Event Team', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Concluded Event Team', exact: true })).toBeVisible();
      const eventFilter = async value => {
        if (width < 1024) {
          const trigger = page.getByRole('button', { name: 'Filters', exact: true });
          await trigger.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible();
          await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
          await expect(trigger).toBeFocused();
          await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible();
        }
        const panel = width < 1024 ? page.getByRole('dialog') : page.locator('aside');
        assert.equal(await page.locator('#t-event').count(), 1, 'Desktop and sheet filter IDs must be distinct');
        await panel.getByLabel('Hackathon', { exact: true }).selectOption(value);
        if (width < 1024) { await page.getByRole('button', { name: /^Show \d+ teams$/ }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); }
      };
      await eventFilter('QA Design Sprint');assert.deepEqual(await ids(), ['archived']);
      await page.getByRole('tab', { name: /Open to join/ }).click();await expect(page.getByText('No open teams match')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Create a team', exact: true })).toHaveAttribute('href', '/teams/create');
      await expect(page.getByRole('link', { name: 'Discover builders', exact: true })).toHaveAttribute('href', '/developers');
      if (width === 390) await page.screenshot({ path: path.join(evidence, `empty-${name}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Show all teams', exact: true }).click();assert.deepEqual(await ids(), ['archived']);
      await eventFilter('');
      await page.getByRole('searchbox', { name: 'Search teams', exact: true }).fill('nothing fits');
      await expect(page.getByText('No teams match', { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Discover builders', exact: true }).focus();await page.keyboard.press('Enter');
      await expect(page).toHaveURL(origin + '/developers');
      await page.goto(origin + '/teams?denied=1');await expect(page.getByRole('status')).toContainText('Owner activity couldn’t be checked');
      assert.deepEqual(await ids(), ['stale', 'unknown', 'active', 'less-relevant']);
      await expect(page.getByText('Owner recently active', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Owner activity unavailable', { exact: true })).toHaveCount(4);
      if (width === 390) await page.screenshot({ path: path.join(evidence, 'activity-unavailable-390.png'), fullPage: true });
      await page.goto(origin + '/teams?weak=1');
      await expect(page.getByText('No recent owner activity confirmed for open teams here.')).toBeVisible();
      assert.deepEqual(await ids(), ['stale', 'unknown', 'active', 'less-relevant']);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Weak-supply overflow ${width}`);
      if (width === 390) await page.screenshot({ path: path.join(evidence, 'weak-supply-390.png'), fullPage: true });
      await page.getByRole('button', { name: 'Browse other teams', exact: true }).click();
      assert.equal((await ids()).length, 8);
      await page.getByRole('link', { name: 'Create a team', exact: true }).focus(); await page.keyboard.press('Enter');
      await expect(page).toHaveURL(origin + '/teams/create');
      await page.goto(origin + '/teams?slow=1');
      await expect(page.getByText('Checking owner activity…', { exact: true })).toHaveCount(4);
      await expect(page.getByText('No recent owner activity confirmed for open teams here.')).toHaveCount(0);
      await page.evaluate(() => window.__qa.release());
      await expect(cards().first()).toHaveText('Open Source Builders');
      await page.evaluate(() => window.__qa.setUser('viewer-b'));
      await expect.poll(() => page.evaluate(() => window.__qa.queries.filter(q => q.columns === 'skills' && q.id === 'viewer-b').length)).toBe(1);
      await page.evaluate(() => window.__qa.release());
      await expect(cards().first()).toHaveText('Python Studio');
      await page.goto(origin + '/teams?list-slow=1');
      await expect(page.getByText('Loading teams…', { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => typeof window.__qa.release)).toBe('function');
      await page.evaluate(() => window.__qa.release());
      await expect(cards().first()).toHaveText('Open Source Builders');
      await cards().first().focus(); await page.keyboard.press('Enter');
      await expect(page).toHaveURL(origin + '/teams/active');
      await page.goto(origin + '/teams?signedout=1');await expect(cards().first()).toBeVisible();
      assert.equal((await page.evaluate(() => window.__qa.queries)).filter(q => q.table === 'profiles').length, 0);
      await page.goto(origin + '/teams?list-error=1');await expect(page.getByRole('alert')).toContainText('Synthetic team read denied');
      await expect(page.getByText('No open teams match', { exact: true })).toHaveCount(0);
      assert.deepEqual(await page.evaluate(() => window.__qa.writes), []);assert.deepEqual(errors, []);
      checks.push({ viewport: name, width, checks: ['baseline and activity-before-skills order', 'coarse activity states', 'no overflow', 'all teams retained', 'primary-event filter and closure', 'filter sheet keyboard opening, Escape and focus restoration below 1024px', 'empty-state paths and keyboard navigation', 'denied optional read preserves skill ranking', 'weak-supply alternatives', 'activity and list loading states', 'account switch updates relevance', 'keyboard team-detail navigation', 'signed-out skips profiles', 'team-read error without empty state', 'zero writes or external network'] });
      await context.close();
    }
    assert.deepEqual(external, []);await fs.writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify({ base: BASE, checks, externalRequests: 0, writes: 0 }, null, 2) + '\n');
    console.log(`Passed real TeamsView/useTeamsData browser checks at 320, 390, 768 and 1440px; before/after evidence: ${path.relative(ROOT, evidence)}`);
  } finally { if (browser) await browser.close();await new Promise(resolve => server.close(resolve)); }
})().catch(err => { console.error(err);process.exitCode = 1; });
