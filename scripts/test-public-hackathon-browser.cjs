/* eslint-disable @typescript-eslint/no-require-imports -- Actual pages/components in a network-isolated browser fixture. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const mock = `
import React, {useSyncExternalStore} from 'react';
export default function Link({href,children,...props}) { return <a href={href} {...props}>{children}</a>; }
const original = history.replaceState.bind(history);
history.replaceState = (...args) => { original(...args); window.dispatchEvent(new Event('popstate')); };
const subscribe = fn => { window.addEventListener('popstate',fn); return () => window.removeEventListener('popstate',fn); };
export function useSearchParams(){ const query = useSyncExternalStore(subscribe,()=>location.search); return new URLSearchParams(query); }
export const useParams = () => ({id:'synthetic-event'});
export const useRouter = () => ({push: href => location.assign(href), replace: href => location.replace(href)});
export const useNotification = () => ({showToast(){},confirm(){throw new Error('Guest must not confirm mutations');}});
window.fixtureReads=[]; window.fixtureWrites=[];
const row={id:'synthetic-event',name:'Public browser fixture',description:'<p>Build useful tools</p>',status:'approved',archived:false,type:'external',tags:['React'],start_date:'2028-01-01',end_date:'2028-01-03',registration_end:'2027-12-30',location:'Mumbai',mode:'hybrid',prize_pool:'INR 10000',currency:'INR',website_url:'https://example.invalid/event'};
export const supabase={auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:{name:'AuthSessionMissingError'}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(table){
 if(table!=='hackathons')throw new Error('Guest private query');
 let filters=[],columns='',cursor=null,batchSize=Infinity;
 const result=()=>{window.fixtureReads.push({table,columns,filters}); if(columns.includes('*'))throw new Error('Wildcard');return {data:filters.some(([key])=>key==='id')?row:[row].filter(event=>cursor===null||event.id>cursor).slice(0,batchSize),error:null};};
 return {select(value){columns=value;return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;},gt(key,value){cursor=value;return this;},limit(value){batchSize=value;return this;},abortSignal(){return this;},maybeSingle:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);},insert(){window.fixtureWrites.push(table);throw new Error('Guest mutation');}};
}};
`;
const assets = (async () => {
  const bundle = await esbuild.build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Directory from './src/app/hackathons/page'; import Detail from './src/app/hackathons/[id]/page'; createRoot(document.getElementById('root')).render(location.pathname==='/hackathons'?<Directory/>:<Detail/>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'offline-boundaries', setup(build) {
      build.onResolve({ filter: /^(next\/(link|navigation)|@\/lib\/supabase|@\/context\/NotificationContext)$/ }, () => ({ path: 'fixture', namespace: 'offline' }));
      build.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: mock, loader: 'jsx', resolveDir: root }));
    } }],
  });
  const css = await postcss([tailwind()]).process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') });
  return { js: bundle.outputFiles[0].text, css: css.css };
})();
for (const [name, viewport] of [['desktop', { width: 1440, height: 950 }], ['mobile', { width: 390, height: 844 }]]) {
  test(`offline actual guest directory and detail: ${name}`, async () => {
    const { js, css } = await assets;
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [], unexpected = [];
    try {
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://fixture.invalid') { unexpected.push(url.origin); return route.abort(); }
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: js });
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css });
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>' });
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://fixture.invalid/hackathons?q=Public&mode=hybrid');
      await page.getByRole('link', { name: 'Public browser fixture', exact: true }).waitFor();
      assert(await page.getByRole('tab', { name: 'Discover' }).isVisible());
      if (name === 'mobile') {
        await page.getByRole('button', { name: 'Filters', exact: true }).click();
        const sheet = page.getByRole('dialog'); await sheet.waitFor();
        await sheet.getByRole('button', { name: /^Topic \/ domain:/ }).click();
        await page.getByRole('option', { name: 'React', exact: true }).click();
        await sheet.getByRole('button', { name: 'Show 1 event' }).click();
        await sheet.waitFor({ state: 'hidden' });
        assert.equal(new URL(page.url()).searchParams.get('topic'), 'react');
      } else {
        await page.locator('summary').filter({hasText:'Registration, dates and more filters'}).click();
        await page.getByRole('button', { name: 'Topic / domain: Any listed topic', exact: true }).click();
        await page.getByRole('option', { name: 'React', exact: true }).click();
      }
      // Rehydrate the real directory from its persisted filters, not component memory.
      const filteredUrl = page.url();
      await page.reload();
      await page.getByRole('link', { name: 'Public browser fixture', exact: true }).waitFor();
      assert.equal(page.url(), filteredUrl);
      assert.equal(new URL(page.url()).searchParams.get('topic'), 'react');
      await page.getByRole('button', { name: 'Save hackathon', exact: true }).click();
      const signIn = page.getByRole('link', { name: 'Sign in', exact: true }); await signIn.waitFor();
      const destination = new URL(await signIn.getAttribute('href'), page.url()).searchParams.get('next');
      assert(destination.startsWith('/hackathons?q=Public&mode=hybrid'));
      assert.equal(await page.evaluate(() => window.fixtureWrites.length), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.goto('http://fixture.invalid/hackathons/synthetic-event?tab=builders');
      await page.getByRole('heading', { name: 'Public browser fixture', exact: true }).waitFor();
      assert(await page.getByText('Build useful tools', { exact: true }).isVisible());
      assert(await page.getByRole('link', { name: 'Sign in to save', exact: true }).isVisible());
      assert(await page.evaluate(() => window.fixtureReads.every(read => read.table === 'hackathons' && !read.columns.includes('*'))));
      assert.equal(await page.evaluate(() => window.fixtureWrites.length), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    } finally { await context.close(); await browser.close(); }
  });
}
