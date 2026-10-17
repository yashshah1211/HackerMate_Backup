/* eslint-disable @typescript-eslint/no-require-imports -- Actual components in a network-isolated browser fixture. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const fixture = `
import React,{useCallback,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import AppShell from './src/components/shell/AppShell';
import {DiscoveryDropdown} from './src/components/hackathons/DiscoveryDropdown';
import {Sheet} from './src/components/system';
function View(){
 const pathname=usePathname();
 const [value,setValue]=useState('topic-060'),[open,setOpen]=useState(false);
 const closeFilters=useCallback(()=>setOpen(false),[]);
 const options=Array.from({length:120},(_,i)=>({value:'topic-'+String(i).padStart(3,'0'),label:'Topic '+String(i).padStart(3,'0')}));
 const dropdown=<DiscoveryDropdown id="topic-choice" label="Topic / domain" value={value} options={options} onChange={v=>{setValue(v);history.replaceState(null,'','/hackathons?q=fixture&topic='+v);}}/>;
 return <AppShell><div style={{padding:20,paddingTop:30}}><h1>{pathname.endsWith('/synthetic-event')?'Synthetic event detail':'Synthetic discovery'}</h1>
  <Link href="/hackathons/synthetic-event?tab=builders">View synthetic event</Link><output data-selected>{value}</output>
  <button type="button" onClick={()=>setOpen(true)}>Filters</button>
  <div data-desktop-dropdown style={{marginTop:20,width:280}}>{!open&&dropdown}</div>
  <button type="button" id="after-desktop-filter">After desktop filter</button>
  <Sheet open={open} onClose={closeFilters} title="Filters" label="Filters"><div style={{padding:16}}><p>Listed filters</p>{dropdown}<button type="button">After filter</button></div></Sheet>
 </div></AppShell>;
}
createRoot(document.getElementById('root')).render(<View/>);
`;
const mock = `
import React from 'react';
export default function Link({href,children,...props}){return <a href={href} {...props} onClick={event=>{event.preventDefault();history.pushState(null,'',href);window.dispatchEvent(new Event('popstate'));}}>{children}</a>;}
const subscribe=fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);};
export const usePathname=()=>React.useSyncExternalStore(subscribe,()=>location.pathname);
export const useSearchParams=()=>new URLSearchParams(location.search);
export const useRouter=()=>({push:href=>location.assign(href)});
export const useNotification=()=>({showToast(){},confirm(){throw new Error('Unexpected confirmation');}});
window.privateShellInitializations=0;window.privateReads=[];window.privateWrites=[];
export function useShellSession(){window.privateShellInitializations++;throw new Error('Guest initialized private shell');}
export function subscribeWithRetry(){throw new Error('Guest initialized private subscription');}
export const supabase={auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:{name:'AuthSessionMissingError'}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(table){window.privateReads.push(table);throw new Error('Guest private read');},channel(){throw new Error('Guest channel');}};
`;
const assets = (async () => {
  const bundle = await esbuild.build({ stdin: { contents: fixture, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'offline-shell-boundaries', setup(build) {
      build.onResolve({ filter: /^(next\/(link|navigation)|@\/lib\/supabase|@\/context\/NotificationContext|\.\/useShellSession)$/ }, () => ({ path: 'fixture', namespace: 'offline' }));
      build.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: mock, loader: 'jsx', resolveDir: root }));
    } }],
  });
  const css = await postcss([tailwind()]).process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') });
  return { js: bundle.outputFiles[0].text, css: css.css };
})();
async function withPage(viewport, run) {
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
    const page = await context.newPage(); page.setDefaultTimeout(5000); page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://fixture.invalid/hackathons?q=fixture&mode=online#filters');
    await page.locator('[data-public-discovery-shell]').waitFor();
    await run(page);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    assert.equal(await page.evaluate(() => window.privateShellInitializations), 0);
    assert.deepEqual(await page.evaluate(() => window.privateReads), []);
    assert.deepEqual(await page.evaluate(() => window.privateWrites), []);
  } finally { await context.close(); await browser.close(); }
}
for (const width of [320, 390, 1440]) {
  test(`offline guest shell, full return path and event navigation: ${width}`, () => withPage({ width, height: 844 }, async page => {
    const header = page.getByRole('navigation', { name: 'Public discovery' });
    assert(await header.getByRole('link', { name: 'Hackathons', exact: true }).isVisible());
    const signIn = header.getByRole('link', { name: 'Sign in', exact: true });
    const destination = new URL(await signIn.getAttribute('href'), page.url()).searchParams.get('next');
    assert.equal(destination, '/hackathons?q=fixture&mode=online#filters');
    assert.equal(await page.locator('[data-shell-content]').count(), 0);
    await page.evaluate(() => { window.sameDocumentMarker = 'preserved'; });
    await page.getByRole('link', { name: 'View synthetic event' }).click();
    await page.getByRole('heading', { name: 'Synthetic event detail' }).waitFor();
    assert(await page.locator('[data-public-discovery-shell]').isVisible());
    assert.equal(await page.evaluate(() => window.sameDocumentMarker), 'preserved');
    assert.equal(new URL(await page.getByRole('link', { name: 'Sign in', exact: true }).getAttribute('href'), page.url()).searchParams.get('next'), '/hackathons/synthetic-event?tab=builders');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }));
  test(`dropdown keyboard, selection and bounded long menu: ${width}`, () => withPage({ width, height: 844 }, async page => {
    const trigger = page.getByRole('button', { name: 'Topic / domain: Topic 060' });
    await trigger.focus(); await page.keyboard.press('Enter');
    const list = page.getByRole('listbox'); await list.waitFor({ timeout: 2000 });
    assert.equal(await page.getByRole('option', { name: 'Topic 060', exact: true }).getAttribute('aria-selected'), 'true');
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'option');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Topic 060');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Topic 119');
    await page.keyboard.press('Enter'); await list.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('[data-selected]').textContent(), 'topic-119');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'topic-choice');
    await page.keyboard.press('Space'); await list.waitFor();
    await page.keyboard.press('Tab'); await list.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'after-desktop-filter');
    await page.getByRole('button', { name: 'Topic / domain: Topic 119' }).click(); await list.waitFor();
    await page.getByRole('heading', { name: 'Synthetic discovery', exact: true }).click();
    await list.waitFor({ state: 'hidden' });
    await page.evaluate(() => { const node=document.querySelector('[data-desktop-dropdown]'); node.style.position='fixed';node.style.bottom='8px';node.style.right='8px'; });
    await page.getByRole('button', { name: 'Topic / domain: Topic 119' }).click(); await list.waitFor();
    const box = await list.boundingBox(); assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 844, JSON.stringify(box));
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Topic 000');
    await page.keyboard.press('Escape'); await list.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'topic-choice');
  }));
}
test('mobile filter Sheet retains focus and stays open when its dropdown dismisses', () => withPage({ width: 390, height: 844 }, async page => {
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' }); await sheet.waitFor();
  await sheet.getByRole('button', { name: 'Topic / domain: Topic 060' }).click();
  const list = page.getByRole('listbox'); await list.waitFor({ timeout: 2000 });
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape'); await list.waitFor({ state: 'hidden' });
  assert.equal(await sheet.waitFor({ state: 'hidden', timeout: 500 }).then(() => true, () => false), false, 'Escape dismissed the parent Sheet');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'topic-choice');
  await page.keyboard.press('Enter'); await list.waitFor();
  await page.keyboard.press('End'); await page.keyboard.press('Enter'); await list.waitFor({ state: 'hidden' });
  assert(await sheet.isVisible());
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'topic-choice');
  assert.equal(await page.locator('[data-selected]').textContent(), 'topic-119');
}));
test('selection restores the trigger rather than losing keyboard focus', () => withPage({ width: 390, height: 844 }, async page => {
  await page.getByRole('button', { name: 'Topic / domain: Topic 060' }).click();
  const choice = page.getByRole('option', { name: 'Topic 061', exact: true }).or(page.getByRole('menuitem', { name: 'Topic 061', exact: true }));
  await choice.click(); await choice.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'topic-choice');
}));
test('one Escape dismisses only the nested choice popup', () => withPage({ width: 390, height: 844 }, async page => {
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' }); await sheet.waitFor();
  await sheet.getByRole('button', { name: 'Topic / domain: Topic 060' }).click();
  const popup = page.getByRole('listbox').or(page.getByRole('menu')); await popup.waitFor();
  await page.keyboard.press('Escape'); await popup.waitFor({ state: 'hidden' });
  assert.equal(await sheet.waitFor({ state: 'hidden', timeout: 500 }).then(() => true, () => false), false, 'Escape dismissed the parent Sheet');
}));
