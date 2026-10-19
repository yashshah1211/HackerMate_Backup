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
const ROOT = path.resolve(__dirname, '..'), BASE = 'fb3fd3df89836cc782f3123ef296cbc5600a1768';
const evidence = path.join(ROOT, 'docs/qa/team-request-reliability');
const adapters = {
  'next/link': `import React from 'react';export default function Link({href,children,...props}){return <a {...props} href={href} onClick={event=>{event.preventDefault();history.pushState(null,'',href);window.dispatchEvent(new PopStateEvent('popstate'))}}>{children}</a>}`,
  'next/navigation': `import{useState,useEffect}from'react';function useRoute(){const[path,setPath]=useState(location.pathname);useEffect(()=>{const change=()=>setPath(location.pathname);window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change)},[]);return path}export const useParams=()=>({id:useRoute().split('/')[2]});export const useRouter=()=>({push(href){history.pushState(null,'',href);window.dispatchEvent(new PopStateEvent('popstate'))}});export const useSearchParams=()=>new URLSearchParams(location.search);`,
  '@/lib/posthog': `export const trackEvent=(name,properties)=>window.__qa.events.push({name,properties});`,
  '@/context/NotificationContext': `const notice={showToast:(...args)=>window.__qa.toasts.push(args),confirm:options=>window.__qa.confirmations.push(options)};export const useNotification=()=>notice;`,
  '@/lib/supabase': `
    const listeners=new Set();const qa=window.__qa={user:'fixture-a',pending:{'fixture-a':true,'fixture-b':false},member:false,fail:new URLSearchParams(location.search).has('error'),reads:[],writes:[],events:[],toasts:[],confirmations:[],hold:false,releases:[],
      setUser(user){qa.user=user;for(const listener of listeners)listener(user?'SIGNED_IN':'SIGNED_OUT',user?{user:{id:user}}:null)},release(){for(const fn of qa.releases.splice(0))fn()},listenerCount:()=>listeners.size};
    export const supabase={auth:{getUser:async()=>({data:{user:qa.user?{id:qa.user}:null},error:null}),onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}},
      from(table){const query={table,filters:{}};return{select(columns){query.columns=columns;return this},eq(key,value){query.filters[key]=value;return this},single(){query.single=true;return this},maybeSingle(){query.single=true;return this},
      then(resolve,reject){qa.reads.push(query);let data=null;
        if(table==='teams')data={id:query.filters.id,name:'QA Campus Builders',description:'Building accessible tools for students on campus. Looking for teammates who enjoy practical problems and thoughtful design.',owner_id:'fixture-owner',max_members:4,skills:['React','TypeScript','UI/UX'],roles_needed:['Frontend Developer','UI/UX Designer'],college:'Multi-college',team_hackathons:[]};
        if(table==='profiles')data={skills:['React']};if(table==='team_hackathons')data=[];
        if(table==='team_members')data=query.single?(qa.member?{id:'fixture-member'}:null):[];
        if(table==='team_join_requests')data=qa.pending[query.filters.user_id]?{id:'fixture-request'}:null;
        const error=table==='team_join_requests'&&qa.fail?{code:'42501',message:'Synthetic read failure'}:null;const result={data:error?null:data,error};
        const gate=table==='team_join_requests'&&qa.hold?(qa.hold=false,new Promise(done=>qa.releases.push(done))):Promise.resolve();return gate.then(()=>result).then(resolve,reject)}}},
      async rpc(name,args){if(name!=='request_to_join_team')throw Error('Unexpected fixture RPC');qa.writes.push({name,args});qa.pending[qa.user]=true;return{data:'fixture-new-request',error:null}}};`,
};
const entry = `import React,{useState,useEffect}from'react';import{createRoot}from'react-dom/client';import TeamPage from '@/app/teams/[id]/page';
  function App(){const[route,setRoute]=useState(location.pathname);useEffect(()=>{const change=()=>setRoute(location.pathname);window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change)},[]);return route.startsWith('/teams/')?<TeamPage/>:<p>Fixture destination</p>}
  createRoot(document.getElementById('root')).render(<App/>);`;
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
      if (before) builder.onLoad({ filter: /(?:teams[\\/]\[id\][\\/]page|components[\\/]TeamOverviewView)\.tsx$/ }, args => ({ contents: baseline(path.relative(ROOT, args.path).replaceAll('\\', '/')), loader: 'tsx', resolveDir: path.dirname(args.path) }));
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
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
      const button = label => page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first();
      await page.goto(origin + '/teams/fixture-team?before=1&error=1');
      await expect(button('Request to join')).toBeEnabled();
      await page.screenshot({ path: path.join(evidence, `before-${name}.png`), fullPage: true });
      checks.push(`${name}: baseline reproduces enabled Request to join after failed status read`);
      await page.goto(origin + '/teams/fixture-team?error=1');
      await expect(page.getByRole('alert')).toContainText("couldn't verify your current request status");
      await expect(button('Retry status check')).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Request to join', exact: true })).toHaveCount(0);
      await page.screenshot({ path: path.join(evidence, `after-${name}.png`), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (isMobile) assert((await button('Retry status check').boundingBox()).height >= 44);
      await button('Retry status check').focus(); await expect(button('Retry status check')).toBeFocused();
      await page.evaluate(() => { window.__qa.fail = false; }); await page.keyboard.press('Enter');
      await expect(button('Request sent')).toBeDisabled(); assert.deepEqual(await page.evaluate(() => window.__qa.writes), []);
      checks.push(`${name}: unknown status, keyboard read-only Retry, responsive error and 44px mobile retry target`);
      await page.evaluate(() => { window.__qa.pending['fixture-a'] = false; window.dispatchEvent(new Event('focus')); });
      await expect(button('Request to join')).toBeEnabled(); assert.deepEqual(await page.evaluate(() => window.__qa.writes), []);
      checks.push(`${name}: removed pending row clears Request sent on focus without automatic submission`);
      await page.evaluate(() => { window.__qa.hold = true; window.dispatchEvent(new Event('focus')); });
      await expect(button('Checking request')).toBeDisabled();
      await expect.poll(() => page.evaluate(() => window.__qa.releases.length)).toBe(1);
      await page.evaluate(() => window.__qa.setUser('fixture-b')); await expect(button('Request to join')).toBeEnabled();
      await page.evaluate(() => window.__qa.release()); await expect(button('Request to join')).toBeEnabled();
      checks.push(`${name}: checking blocks actions; account change ignores delayed old response`);
      await button('Request to join').click(); await expect(button('Request sent')).toBeDisabled();
      assert.deepEqual(await page.evaluate(() => window.__qa.writes), [{ name: 'request_to_join_team', args: { p_team_id: 'fixture-team' } }]);
      assert.deepEqual(await page.evaluate(() => window.__qa.events), [{ name: 'team_join_request_sent', properties: { source: 'team_detail' } }]);
      checks.push(`${name}: explicit submission calls existing RPC once and records one content-free success event`);
      await page.evaluate(() => { window.__qa.pending['fixture-b'] = false; window.__qa.member = true; window.dispatchEvent(new Event('hm:teams-changed')); });
      await expect(page.getByRole('link', { name: 'Open workspace', exact: true }).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Request sent', exact: true })).toHaveCount(0);
      checks.push(`${name}: verified membership replaces pending action after team-change event`);
      await page.evaluate(() => window.__qa.setUser(null));
      await expect(page.getByRole('link', { name: 'Sign in to join', exact: true }).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open workspace', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Share team', exact: true })).toHaveCount(0);
      checks.push(`${name}: logout clears private status and internal controls`);
      await page.evaluate(() => { history.pushState(null, '', '/away'); window.dispatchEvent(new PopStateEvent('popstate')); });
      await expect(page.getByText('Fixture destination', { exact: true })).toBeVisible();
      const reads = await page.evaluate(() => window.__qa.reads.length);
      await page.evaluate(() => window.dispatchEvent(new Event('focus'))); assert.equal(await page.evaluate(() => window.__qa.reads.length), reads);
      assert.equal(await page.evaluate(() => window.__qa.listenerCount()), 0);
      await page.evaluate(() => { window.__qa.member = false; window.__qa.setUser('fixture-a'); history.pushState(null, '', '/teams/fixture-team'); window.dispatchEvent(new PopStateEvent('popstate')); });
      await expect(button('Request to join')).toBeEnabled(); await page.reload(); await expect(button('Request sent')).toBeDisabled();
      checks.push(`${name}: navigation cleanup, fresh remount and reload read current fixture state`);
      assert.deepEqual(errors, []); await context.close();
    }
    assert.deepEqual(external, []);
    await writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify({ baseline: BASE, checks, externalRequests: 0, syntheticRequestRPCs: 2,
      limitations: 'Real page/view/components/CSS; mocked Supabase, notification and Next navigation. System fonts replace Next fonts. No live Supabase, RLS, middleware, real OAuth or production writes.' }, null, 2) + '\n');
    console.log(`${checks.length} desktop/mobile checks passed; four screenshots; zero external requests; two explicitly initiated synthetic RPCs.`);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
