/* eslint-disable @typescript-eslint/no-require-imports -- Loopback-only synthetic browser verification. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createServer } = require('node:http');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { existsSync, statSync } = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium, expect } = require('@playwright/test');
const ROOT = path.resolve(__dirname, '..'), BASE = '9c857b27e6b1d335ee381831743696103acc16ee';
const evidence = path.join(ROOT, 'docs/qa/pending-applications');
const adapters = {
  '@/components/AuthGuard': `export default function Guard({children}){return children;}`,
  'next/link': `import React from 'react';export default function Link({href,children,...props}){return <a {...props} href={href} onClick={event=>{event.preventDefault();history.pushState(null,'',href);window.dispatchEvent(new PopStateEvent('popstate'))}}>{children}</a>}`,
  'next/navigation': `export const usePathname=()=>location.pathname;`,
  '@/lib/supabase': `
    const A='fixture-a',B='fixture-b',listeners=new Set();const scenario=new URLSearchParams(location.search).get('scenario');
    const member=(user,id)=>({user_id:user,teams:{id,name:user===A?'QA Existing Team':'QA Account B Team',description:'An existing synthetic membership.',owner_id:user,team_ppt_evaluations:[]}});
    const request=(user,id,name)=>({id:'request-'+id,team_id:id,user_id:user,status:'pending',created_at:'2026-10-18T10:00:00Z',teams:name?{id,name}:null});
    const qa=window.__qa={user:A,members:scenario==='teamless'?[]:[member(A,'fixture-member'),member(B,'fixture-b-member')],
      requests:scenario==='empty'?[]:[request(A,'fixture-campus','QA Campus Builders'),request(A,'fixture-long','QA Accessible Campus Map and Inclusive Student Tools'),request(A,'fixture-hidden',null),request(B,'fixture-b-pending','QA Account B Application')],
      reads:[],writes:[],failApps:scenario==='error',failMembers:false,holdNext:false,releases:[],
      setUser(user){qa.user=user;for(const listener of listeners)listener(user?'SIGNED_IN':'SIGNED_OUT',user?{user:{id:user}}:null)},
      release(){for(const resolve of qa.releases.splice(0))resolve()},listenerCount:()=>listeners.size};
    export const supabase={auth:{getUser:async()=>({data:{user:qa.user?{id:qa.user}:null},error:null}),onAuthStateChange(callback){listeners.add(callback);return{data:{subscription:{unsubscribe(){listeners.delete(callback)}}}}}},
      from(table){const query={table,filters:{}};return{select(columns,settings){query.columns=columns;query.settings=settings;return this},eq(key,value){query.filters[key]=value;return this},order(){return this},abortSignal(signal){query.signal=signal;return this},
        delete(){throw new Error('No writes allowed')},insert(){throw new Error('No writes allowed')},update(){throw new Error('No writes allowed')},
        then(resolve,reject){qa.reads.push(query);const rows=(table==='team_members'?qa.members:qa.requests).filter(row=>Object.entries(query.filters).every(([key,value])=>row[key]===value));
          const result={data:rows,error:(table==='team_join_requests'&&qa.failApps)||(table==='team_members'&&qa.failMembers)?{message:'Synthetic read failure'}:null,count:rows.length};
          const gate=table==='team_join_requests'&&qa.holdNext?(qa.holdNext=false,new Promise(done=>qa.releases.push(done))):Promise.resolve();
          return gate.then(()=>result).then(resolve,reject)}}},rpc(){throw new Error('No RPC allowed')}};`,
};
const entry = `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import MyTeamsPage from '@/app/my-teams/page';
  function App(){const[route,setRoute]=useState(location.pathname);useEffect(()=>{const change=()=>setRoute(location.pathname);window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change)},[]);
    return route==='/my-teams'?<MyTeamsPage/>:<p>Fixture destination: {route}</p>}
  createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`;

async function bundle(before) {
  const baseline = before ? execFileSync('git', ['show', BASE + ':src/app/my-teams/page.tsx'], { cwd: ROOT, encoding: 'utf8' }) : null;
  const result = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: ROOT }, bundle: true, write: false, jsx: 'automatic', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'offline-application-adapters', setup(builder) {
      builder.onResolve({ filter: /^(@\/|next\/)/ }, args => {
        if (adapters[args.path]) return { path: args.path, namespace: 'fixture' };
        const target = path.join(ROOT, 'src', args.path.slice(2));
        const file = [target, target + '.tsx', target + '.ts', target + '/index.ts'].find(file => existsSync(file) && statSync(file).isFile());
        assert(file, 'Unresolved source: ' + args.path); return { path: file };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: adapters[args.path], loader: 'tsx', resolveDir: ROOT }));
      if (before) builder.onLoad({ filter: /my-teams[\\/]page\.tsx$/ }, () => ({ contents: baseline, loader: 'tsx', resolveDir: path.join(ROOT, 'src/app/my-teams') }));
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
  let browser; const checks = [], external = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const [name, viewport, isMobile] of [['desktop', { width: 1440, height: 1000 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
      const context = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, reducedMotion: 'reduce', timezoneId: 'Asia/Kolkata' });
      await context.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
      const page = await context.newPage(), pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(origin + '/my-teams?before=1');
      await expect(page.getByRole('link', { name: 'QA Existing Team', exact: true })).toBeVisible();
      await expect(page.getByText('Pending applications', { exact: true })).toHaveCount(0);
      await page.screenshot({ path: path.join(evidence, `before-${name}.png`), fullPage: true });
      await page.goto(origin + '/my-teams');
      const apps = page.locator('#pending-applications'), members = page.locator('#your-memberships');
      await expect(apps.getByRole('listitem')).toHaveCount(3);
      await expect(page.locator('header')).toContainText("You're on 1 team");
      await expect(apps.getByText('Pending', { exact: true })).toHaveCount(3);
      await expect(apps.locator('time').first()).toHaveAttribute('datetime', '2026-10-18T10:00:00Z');
      await expect(apps.getByRole('link', { name: /Workspace/ })).toHaveCount(0);
      await expect(apps.getByRole('link', { name: 'Team details unavailable', exact: true })).toHaveAttribute('href', '/teams/fixture-hidden');
      await page.screenshot({ path: path.join(evidence, `after-${name}.png`), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
      if (isMobile) for (const link of await apps.getByRole('link', { name: /^View team:/ }).all()) assert((await link.boundingBox()).height >= 44);
      checks.push(`${name}: separate verified membership/application totals, dates, Pending status, safe links, unavailable-team fallback and responsive layout`);
      const target = apps.getByRole('link', { name: 'View team: QA Campus Builders', exact: true });
      await target.focus(); await expect(target).toBeFocused(); await page.keyboard.press('Enter');
      await expect(page).toHaveURL(origin + '/teams/fixture-campus');
      const readsAway = await page.evaluate(() => window.__qa.reads.length);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      assert.equal(await page.evaluate(() => window.__qa.reads.length), readsAway);
      await page.evaluate(() => { history.pushState(null, '', '/my-teams'); window.dispatchEvent(new PopStateEvent('popstate')); });
      await expect(apps.getByRole('listitem')).toHaveCount(3);
      checks.push(`${name}: keyboard team navigation, cleanup away from page, fresh data on remount`);
      await page.evaluate(() => { window.__qa.failApps = true; });
      await apps.getByRole('button', { name: 'Refresh applications' }).click();
      await expect(apps.getByRole('alert')).toContainText("Couldn't load applications");
      await expect(members.getByRole('link', { name: 'QA Existing Team', exact: true })).toBeVisible();
      await expect(apps).toContainText('Showing last loaded applications');
      await expect(apps.getByText('No pending applications', { exact: true })).toHaveCount(0);
      const membershipReads = await page.evaluate(() => window.__qa.reads.filter(q => q.table === 'team_members').length);
      await page.evaluate(() => { window.__qa.failApps = false; }); await apps.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(apps.getByRole('alert')).toHaveCount(0);
      assert.equal(await page.evaluate(() => window.__qa.reads.filter(q => q.table === 'team_members').length), membershipReads);
      checks.push(`${name}: failed read keeps memberships and labeled cached rows; independent Retry recovers`);
      await page.evaluate(() => { window.__qa.holdNext = true; });
      await apps.getByRole('button', { name: 'Refresh applications' }).click();
      await expect.poll(() => page.evaluate(() => window.__qa.releases.length)).toBe(1);
      await page.evaluate(() => window.__qa.setUser('fixture-b'));
      await expect(apps.getByRole('link', { name: 'QA Account B Application', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'QA Existing Team', exact: true })).toHaveCount(0);
      await page.evaluate(() => window.__qa.release());
      await expect(apps.getByRole('listitem')).toHaveCount(1);
      await expect(apps.getByRole('link', { name: 'QA Campus Builders', exact: true })).toHaveCount(0);
      checks.push(`${name}: account switch clears old private data; delayed prior-account response cannot restore it`);
      await page.evaluate(() => window.__qa.setUser(null));
      await expect(apps).toHaveCount(0); await expect(page.getByText(/QA Account B/)).toHaveCount(0);
      assert.deepEqual(await page.evaluate(() => window.__qa.writes), []);
      checks.push(`${name}: logout clears private rows with zero mutations`);
      await page.goto(origin + '/my-teams?scenario=teamless');
      await expect(page.locator('header')).toContainText("You're on 0 teams"); await expect(apps.getByRole('listitem')).toHaveCount(3);
      await expect(members).toContainText('No teams yet'); checks.push(`${name}: pending applications never become memberships`);
      await page.goto(origin + '/my-teams?scenario=empty'); await expect(apps).toContainText('No pending applications');
      await expect(members.getByRole('link', { name: 'QA Existing Team', exact: true })).toBeVisible(); checks.push(`${name}: useful verified-empty state retains memberships`);
      await page.goto(origin + '/my-teams?scenario=error'); await expect(apps.getByRole('alert')).toBeVisible();
      await expect(apps.getByText('No pending applications', { exact: true })).toHaveCount(0);
      await expect(members.getByRole('link', { name: 'QA Existing Team', exact: true })).toBeVisible(); checks.push(`${name}: initial application failure never claims zero or hides memberships`);
      assert.deepEqual(pageErrors, []); await context.close();
    }
    assert.deepEqual(external, []);
    await writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify({ baseline: BASE, checks, externalRequests: 0, mutations: 0,
      limitations: 'Real page, hook, views and CSS with synthetic Supabase/navigation/AuthGuard adapters; system fonts substitute Next Google fonts. No production service, actual RLS, live OAuth or Next middleware verification.' }, null, 2) + '\n');
    console.log(`${checks.length} desktop/mobile browser checks passed; four screenshots saved; zero external requests or mutations.`);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
