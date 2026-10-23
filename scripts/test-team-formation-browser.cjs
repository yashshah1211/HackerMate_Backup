/* eslint-disable @typescript-eslint/no-require-imports -- Loopback-only synthetic team-detail verification. */
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { existsSync, statSync } = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const { build } = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium, expect } = require('@playwright/test');
const ROOT = path.resolve(__dirname, '..'), BASE = '51af1f0d2ed8faa0fed7fb28e699f230496a98be';
const evidence = path.join(ROOT, 'docs/qa/team-formation-outcomes');
const fixture = JSON.parse(require('node:fs').readFileSync(path.join(ROOT,'docs/qa/team-formation-outcomes/report-fixture.json'),'utf8'));
const adapters={
 'next/link':`import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`,
 '@/lib/supabase':`const listeners=new Set();export const supabase={auth:{getUser:async()=>({data:{user:{id:'synthetic-admin'}},error:null}),onAuthStateChange(fn){listeners.add(fn);window.__switchFormationUser=user=>{for(const fn of listeners)fn('SIGNED_IN',{user:{id:user}})};return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}}};`,
 '@/components/AuthGuard':`export default function AuthGuard({children}){return children}`,
};
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Page from '@/app/admin/attention/page';
 const fixture=${JSON.stringify(fixture)};const qa=window.__qa={mode:new URLSearchParams(location.search).get('mode')||'partial',calls:[],release:null};
 window.fetch=async(url,options)=>{qa.calls.push({url,method:options?.method||'GET'});if(url.startsWith('/api/admin/attention'))return new Response(JSON.stringify({error:'Synthetic attention queue unavailable'}),{status:503});if(url!=='/api/admin/team-formation')throw Error('Unexpected fixture request');if(qa.mode==='loading')await new Promise(done=>qa.release=done);if(qa.mode==='error')return new Response('{}',{status:503});return new Response(JSON.stringify({...fixture,coverage:qa.mode==='complete'?'complete':'partial'}),{status:200})};
 createRoot(document.getElementById('root')).render(<Page/>);`;

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
      if (before) builder.onLoad({ filter: /admin[\\/]attention[\\/]page\.tsx$/ }, args => ({ contents: baseline(path.relative(ROOT, args.path).replaceAll('\\', '/')), loader: 'tsx', resolveDir: path.dirname(args.path) }));
    } }] });
  return result.outputFiles[0].text;
}
async function main() {
  await mkdir(evidence, { recursive: true });
  const [before, after, source] = await Promise.all([bundle(true), bundle(false), readFile(path.join(ROOT, 'src/app/globals.css'), 'utf8')]);
  const css = (await postcss([tailwind()]).process(source, { from: path.join(ROOT, 'src/app/globals.css') })).css;
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/rest/v1/')) {
      res.setHeader('Content-Type','application/json');
      if (!['GET','HEAD'].includes(req.method) || req.headers.apikey!=='hustle-offline-fixture') { res.statusCode=403; return res.end('{}'); }
      const people=[1,2,3].map(n=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,full_name:`Synthetic builder ${n}`,skills:[]}));
      if(req.method==='HEAD'){res.setHeader('Content-Range','0-2/3');return res.end();}
      if(url.pathname==='/rest/v1/profiles')return res.end(JSON.stringify(url.searchParams.has('id')?people.find(p=>'eq.'+p.id===url.searchParams.get('id')):people));
      if(url.pathname==='/rest/v1/team_members')return res.end(JSON.stringify([{id:'00000000-0000-4000-8000-000000000090',role:'owner',project_role:'Developer',profiles:people[0]}]));
      if(['/rest/v1/user_badges','/rest/v1/team_ppt_evaluations'].includes(url.pathname))return res.end('[]');
      res.statusCode=403;return res.end('{}');
    }
    if (url.pathname === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(url.searchParams.has('before') ? before : after); }
    else if (url.pathname === '/app.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>:root{--font-ui:Arial;--font-display-face:Arial;--font-code:monospace}*{animation:none!important;transition:none!important}</style></head><body><div id="root"></div><script src="/app.js' + (url.searchParams.has('before') ? '?before=1' : '') + '"></script></body></html>'); }
  });
  let browser; const checks = [], external = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const smokeEnv={...process.env};for(const key of Object.keys(smokeEnv))if(/SUPABASE|DATABASE_URL|TOKEN|SECRET|API_KEY/.test(key))delete smokeEnv[key];
    Object.assign(smokeEnv,{HM_SMOKE_SYNTHETIC:'true',NEXT_PUBLIC_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:'hustle-offline-fixture'});
    const smoke=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/smoke-test-core-pages.js'],{cwd:ROOT,env:smokeEnv,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>resolve({code,output}));});
    await writeFile(path.join(evidence,'core-smoke.txt'),smoke.output);assert.equal(smoke.code,0,'Required core query smoke must pass against the read-only local fixture');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for(const width of [320,390,768,1440]){
      const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(external.push(route.request().url()),route.abort()));
      const page=await context.newPage(),errors=[];page.on('pageerror',err=>errors.push(err.message));
      await page.goto(origin+'/admin/attention?before=1');await expect(page.getByRole('heading',{name:'Founder Attention Queue'})).toBeVisible();
      await expect(page.getByText('Synthetic attention queue unavailable',{exact:true})).toBeVisible();
      await page.screenshot({path:path.join(evidence,`before-${width}.png`),fullPage:true});
      await page.goto(origin+'/admin/attention?mode=loading');await expect(page.getByText(/Loading formation outcomes/)).toBeVisible();
      await page.evaluate(()=>{window.__qa.mode='partial';window.__qa.release()});await expect(page.getByRole('status').filter({hasText:'Partial measurement'})).toBeVisible();
      const section=page.getByRole('region',{name:'Team formation outcomes'});await expect(section.getByText(/4 \/ 10.*rate unavailable/).first()).toBeVisible();
      await page.screenshot({path:path.join(evidence,`after-${width}.png`),fullPage:true});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.evaluate(()=>{window.__qa.mode='complete'});const refresh=page.getByRole('button',{name:'Refresh',exact:true});await refresh.focus();await expect(refresh).toBeFocused();await page.keyboard.press('Enter');
      await expect(section.getByText('4 / 10 (40.0%)',{exact:true}).first()).toBeVisible();
      await page.evaluate(()=>{window.__qa.mode='error'});await refresh.click();await expect(section.getByRole('alert')).toContainText('unavailable');await expect(section.getByRole('table')).toHaveCount(0);
      await page.evaluate(()=>{window.__qa.mode='loading'});await refresh.click();await expect(section.getByText(/Loading formation outcomes/)).toBeVisible();
      await page.evaluate(()=>window.__switchFormationUser('different-account'));await expect(section.getByRole('alert')).toContainText('Account changed');
      await page.evaluate(()=>{window.__qa.mode='complete';window.__qa.release()});await expect(section.getByRole('table')).toHaveCount(0);
      assert((await page.evaluate(()=>window.__qa.calls)).every(c=>c.method==='GET'));assert.deepEqual(errors,[]);
      checks.push(`${width}: baseline, loading, partial coverage/rates unavailable, keyboard Refresh, verified aggregates, unavailable response and account switching clear numbers, late response ignored, no overflow, GET only`);
      await context.close();
    }
    assert.deepEqual(external, []);
    await writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify({ baseline: BASE, checks, externalRequests: 0, syntheticRequestRPCs: 0,
      limitations: 'Real admin page/components/CSS and DTO validation; AuthGuard and same-origin report APIs use synthetic adapters. Backend authorization and SQL are tested separately. System fonts replace Next fonts. No live Supabase, RLS, middleware, real OAuth or production writes.' }, null, 2) + '\n');
    console.log(`${checks.length} viewport checks passed; eight screenshots; zero external requests; GET-only synthetic reporting APIs.`);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
