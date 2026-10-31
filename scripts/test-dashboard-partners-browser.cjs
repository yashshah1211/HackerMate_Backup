/* eslint-disable @typescript-eslint/no-require-imports -- Real dashboard/CSS with loopback-only synthetic data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createServer } = require('node:http');
const { build } = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium, expect } = require('@playwright/test');
const ROOT = path.resolve(__dirname, '..');
const BASE = '64aa18786f7035b830cd9d8f1095a533b5b2ac7b';
const OUT = path.join(ROOT, 'scratch/mission19');
const entry = `import React from 'react'; import {hydrateRoot} from 'react-dom/client'; import {renderToString} from 'react-dom/server';
import {DashboardView} from '@/app/dashboard/DashboardView'; import {selectPartnerEvents} from '@/app/dashboard/partnerSpotlight';
window.__qa={events:[],actions:[],errors:[]};const scenario=new URLSearchParams(location.search).get('scenario')||'one';
const event=(slug,name,endDate='2027-01-20',logoUrl=null)=>({slug,name,eventName:name,endDate,logoUrl});
const rack=event('rack-it-up-2026','Rack It Up 2026','2026-12-13','/partners/rack-it-up-2026/RackItUp-mark.png');
const other=event('synthetic-community','Synthetic Community Buildathon for Accessible Cities and Connected Campuses');
const undated=event('synthetic-undated','Synthetic Independent Builders Weekend',null,'/broken-logo.png');
const rows=scenario==='zero'||scenario==='unavailable'?[]:scenario==='two'?[rack,other]:scenario==='three'?[rack,other,undated]:scenario==='expired'?[event('expired','Expired synthetic event','2026-10-01')]:[rack];
const data={loading:scenario==='loading',teamsRefreshing:false,redirecting:false,
profile:{id:'fixture',full_name:'Aarav Builder',college:'Synthetic Campus',skills:['React'],bio:'Builder',github_url:null,linkedin_url:null,avatar_url:null,onboarding_completed:true,current_streak:4,longest_streak:7},
completeness:{percent:80,missing:[]},nextStep:'Link your GitHub so teammates can see your work.',
bestFit:[{id:'builder',full_name:'Synthetic Builder',college:'Synthetic Campus',skills:['React','TypeScript'],avatar_url:null,compatibility:82,shared_skills:['React']}],campus:[],matchError:null,connectionStates:{},
teams:[{id:'fixture-team',name:'Campus Atlas',category:'project',tag:'PROJECT',eventName:'',memberCount:2,maxMembers:4,members:[],isOwner:true,firstHackathonId:null}],
queue:[{kind:'invite',id:'invite-1',teamId:'inviting-team',teamName:'Open Source Crew',teamDescription:'Build together.',inviterName:'Synthetic Teammate'}],
stats:{builders:120,teams:23,hackathons:4,closingSoon:1,campusCount:8},activity:[{id:'activity-1',message:'Your team workspace is ready.',link:'/teams/fixture-team/workspace',createdAt:'2026-10-30T12:00:00Z'}],
partners:selectPartnerEvents(rows,'2026-10-31'),year:{visible:false,value:'2nd Year',saving:false},busyId:null,joinBusyId:null,joinError:null};
const handlers=Object.fromEntries(['onConfirmYear','onYearChange','onOpenProfileSetup','onAcceptInvite','onDeclineInvite','onAcceptConnection','onDeclineConnection','onAcceptJoin','onDeclineJoin','onReload','onOpenInbox'].map(name=>[name,(...args)=>window.__qa.actions.push({name,args})]));
const app=<DashboardView data={data} unreadMessages={0} handlers={handlers}/>;
document.getElementById('root').innerHTML=renderToString(app);window.__qa.serverMain=document.querySelector('main');
hydrateRoot(document.getElementById('root'),app,{onRecoverableError:error=>window.__qa.errors.push(error.message)});`;
const adapters = {
  'next/link': `import React from 'react';export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}`,
  '@/lib/supabase': `export const supabase={auth:{getUser:async()=>({data:{user:null},error:null}),getSession:async()=>({data:{session:null},error:null})}};`,
  '@/lib/posthog': `export const trackEvent=(...args)=>window.__qa.events.push(args);`,
  '@/components/partners/HustlePartnershipBanner': `export default function Banner(){return null;}`,
};
async function bundle(before) {
  const baseline = before ? execFileSync('git', ['show', BASE + ':src/app/dashboard/DashboardView.tsx'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) : null;
  const result = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: ROOT }, bundle: true, write: false, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'synthetic-dashboard', setup(builder) {
      builder.onResolve({ filter: /^(@\/|next\/)/ }, args => {
        if (adapters[args.path]) return { path: args.path, namespace: 'fixture' };
        const target = path.join(ROOT, 'src', args.path.slice(2));
        return { path: [target, target + '.ts', target + '.tsx', target + '/index.ts'].find(file => fs.existsSync(file) && fs.statSync(file).isFile()) };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: adapters[args.path], loader: 'tsx', resolveDir: ROOT }));
      builder.onLoad({ filter: /\.module\.css$/ }, args => {
        const names = [...fs.readFileSync(args.path, 'utf8').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => match[1]);
        return { contents: 'export default ' + JSON.stringify(Object.fromEntries(names.map(name => [name, 'm19_' + name]))), loader: 'js' };
      });
      if (before) builder.onLoad({ filter: /dashboard[\\/]DashboardView\.tsx$/ }, () => ({ contents: baseline, loader: 'tsx', resolveDir: path.join(ROOT, 'src/app/dashboard') }));
    } }] });
  return result.outputFiles[0].text;
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const [before, after] = await Promise.all([bundle(true), bundle(false)]);
  const global = (await postcss([tailwind()]).process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.join(ROOT, 'src/app/globals.css') })).css;
  const css = global + '\n' + fs.readFileSync('src/app/dashboard/FeaturedPartnerEvents.module.css', 'utf8').replace(/\.([a-zA-Z][\w-]*)/g, '.m19_$1');
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/app.js') { res.setHeader('content-type', 'text/javascript'); return res.end(url.searchParams.has('before') ? before : after); }
    if (url.pathname === '/app.css') { res.setHeader('content-type', 'text/css'); return res.end(css); }
    if (url.pathname === '/partners/rack-it-up-2026/RackItUp-mark.png') { res.setHeader('content-type', 'image/png'); return res.end(fs.readFileSync('public' + url.pathname)); }
    if (url.pathname === '/broken-logo.png') { res.statusCode = 404; return res.end(); }
    if (url.pathname.startsWith('/api/')) throw Error('Unexpected backend request');
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>:root{--font-ui:Arial;--font-display-face:Arial;--font-code:monospace}body{background:#0f0f0e}</style></head><body><div id="root"></div><script src="/app.js' + (url.searchParams.has('before') ? '?before' : '') + '"></script></body></html>');
  });
  let browser; const checks = [], blocked = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    // Disposable synthetic-only process: this cloud image's setuid helper is not root-owned.
    browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin !== origin) { blocked.push(route.request().url()); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/dashboard?before', { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(OUT, 'before-' + width + '.png'), fullPage: true });
      for (const [scenario, count] of [['one', 1], ['two', 2], ['three', 3], ['zero', 0], ['expired', 0], ['unavailable', 0], ['loading', 0]]) {
        await page.goto(origin + '/dashboard?scenario=' + scenario, { waitUntil: 'networkidle' });
        const spotlight = page.locator('section[aria-labelledby="featured-partner-title"]');
        assert.equal(await spotlight.locator('a').count(), count);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(await page.evaluate(() => window.__qa.errors), []);
        assert(await page.evaluate(() => document.querySelector('main') === window.__qa.serverMain));
        assert.deepEqual(await page.evaluate(() => window.__qa.events), []);
        if (scenario !== 'loading') {
          await expect(page.getByRole('heading', { name: 'Pending', exact: true })).toBeVisible();
          await expect(page.getByRole('heading', { name: 'Your teams', exact: true })).toBeVisible();
          await expect(page.getByRole('heading', { name: 'Builders for you', exact: true })).toBeVisible();
          assert.equal(await page.getByRole('link', { name: /Campus Atlas/ }).getAttribute('href'), '/teams/fixture-team/workspace');
          await page.getByRole('button', { name: 'Accept', exact: true }).click();
          assert.equal(await page.evaluate(() => window.__qa.actions.at(-1).name), 'onAcceptInvite');
        }
        if (count) {
          assert.equal(await page.getByRole('heading', { name: 'Partner events', exact: true }).count(), 1);
          assert(await spotlight.evaluate(el => el.getBoundingClientRect().bottom < document.getElementById('needs-you').getBoundingClientRect().top));
          for (const link of await spotlight.locator('a').all()) {
            assert((await link.boundingBox()).height >= 44);
            await link.focus();
            await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
            await expect(link).toBeFocused();
            assert.equal(await link.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
          }
          for (const title of await spotlight.locator('h3').all()) assert(await title.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight));
          const logo = spotlight.locator('img').first();
          await logo.evaluate(el => el.decode());
          assert.equal(await logo.evaluate(el => getComputedStyle(el).objectFit), 'contain');
          if (scenario === 'one') {
            await expect(spotlight.getByRole('link', { name: 'Explore event: Rack It Up 2026', exact: true })).toHaveAttribute('href', '/partners/rack-it-up-2026');
            assert((await spotlight.boundingBox()).height < (width === 390 ? 370 : 270));
            await page.locator(':focus').evaluate(el => el.blur());
            await page.screenshot({ path: path.join(OUT, 'after-' + width + '.png'), fullPage: true });
          }
          if (scenario === 'three') {
            await expect(spotlight.getByText('Dates to be confirmed', { exact: true })).toBeVisible();
            assert.equal(await spotlight.locator('img[src="/broken-logo.png"]').count(), 0);
            await page.locator(':focus').evaluate(el => el.blur());
            await page.screenshot({ path: path.join(OUT, 'three-' + width + '.png'), fullPage: true });
          }
        }
        checks.push({ width, scenario, passed: true });
      }
      assert.deepEqual(errors, []); await context.close();
    }
    assert.deepEqual(blocked, []);
    fs.writeFileSync(path.join(OUT, 'browser-results.json'), JSON.stringify({ base: BASE, checks, externalRequests: blocked.length, actualBackendWrites: 0, note: 'Real DashboardView/CSS, synthetic props and handlers; client-side SSR/hydration simulation, not live Auth or database acceptance.' }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, widths: [390, 768, 1440], externalRequests: blocked.length }));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
