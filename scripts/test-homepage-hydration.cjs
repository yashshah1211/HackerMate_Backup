/* eslint-disable @typescript-eslint/no-require-imports -- Offline SSR/browser-realm hydration regression. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require('esbuild');
const { renderToString } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const ROOT = path.resolve(__dirname, '..');
const data = { builderCount: 1234, teamCount: 42, hackathonCount: 11, upcoming: [
  { id: 'synthetic-event', name: 'Synthetic Event', mode: 'online', start_date: '2026-12-11', end_date: '2026-12-13' },
] };
const normalize = harness().load('src/components/shell/navConfig.tsx').normalizeShellPathname;

test('only the captured ISR /index alias normalizes; all other route identities are preserved', () => {
  assert.equal(typeof normalize, 'function');
  assert.equal(normalize('/index'), '/');
  for (const route of [null, '', '/', '/index/', '/index/child', '/INDEX', '/index?next=/dashboard', '/dashboard', '/login', '/onboarding',
    '/partners/rack-it-up-2026', '/partners/example/organizer', '/hackathons/synthetic-event', '/teams/create', '/verify/123']) assert.equal(normalize(route), route);
});

async function fixture(t, serverPath, reduced) {
  const boundary = `import React from 'react';
    export const supabase={auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(){throw Error('Unexpected database query')}};
    export function subscribeWithRetry(){throw Error('Unexpected realtime request')}
    export const useRouter=()=>({push(){throw Error('Unexpected navigation')}});
    export const usePathname=()=>typeof window==='undefined'?${JSON.stringify(serverPath)}:location.pathname;
    export const useSearchParams=()=>new URLSearchParams();export const useParams=()=>({});
    export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`;
  const plugin = { name: 'synthetic-boundaries', setup(build) {
    build.onResolve({ filter: /^(next\/(navigation|link)|@\/lib\/supabase)$/ }, args => ({ path: args.path, namespace: 'boundary' }));
    build.onLoad({ filter: /.*/, namespace: 'boundary' }, () => ({ contents: boundary, loader: 'jsx', resolveDir: ROOT }));
  } };
  const entry = `import React from 'react';import AppShell from './src/components/shell/AppShell';import {LandingPageClient} from './src/app/LandingPageClient';import {NotificationProvider} from './src/context/NotificationContext';
    export const element=React.createElement(NotificationProvider,null,React.createElement(AppShell,null,React.createElement(LandingPageClient,{initialData:${JSON.stringify(data)}})));`;
  const options = { bundle: true, write: false, plugins: [plugin], define: { 'process.env.NODE_ENV': '"development"' } };
  const server = await esbuild.build({ ...options, stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx' }, platform: 'node', format: 'cjs', packages: 'external' });
  const moduleFile = path.join(ROOT, 'scratch', 'hydration-server.cjs'), compiled = new Module(moduleFile, module);
  compiled.paths = Module._nodeModulePaths(ROOT); compiled._compile(server.outputFiles[0].text, moduleFile);
  const html = renderToString(compiled.exports.element);
  const client = await esbuild.build({ ...options, stdin: { contents: entry + `
    import {hydrateRoot} from 'react-dom/client';
    function CommitProbe(){React.useLayoutEffect(()=>{window.__firstCommit=document.getElementById('hero-title').closest('section').textContent;window.__committed=true},[]);return null}
    window.__root=hydrateRoot(document.getElementById('root'),React.createElement(React.Fragment,null,element,React.createElement(CommitProbe)),{onRecoverableError(e,info){window.__recoverable.push({message:e.message,componentStack:info.componentStack})}});`, resolveDir: ROOT, loader: 'tsx' }, platform: 'browser', format: 'iife' });
  const dom = new JSDOM(`<!doctype html><html class="dark"><head><meta charset="utf-8"></head><body><div id="root">${html}</div></body></html>`,
    { url: 'https://offline.invalid/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, listeners = new Set(), legacyListeners = new Set(), errors = [], warnings = [], mql = { matches: reduced,
    addEventListener(type, fn) { assert.equal(type, 'change'); listeners.add(fn); }, removeEventListener(type, fn) { assert.equal(type, 'change'); listeners.delete(fn); },
    addListener(fn) { legacyListeners.add(fn); }, removeListener(fn) { legacyListeners.delete(fn); } };
  w.matchMedia = query => query.includes('prefers-reduced-motion') ? mql : {
    matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  };
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  // JSDOM lacks scrolling; production Chromium coverage verifies actual layout/scroll behavior.
  w.HTMLElement.prototype.scrollTo = function(options) { this.scrollLeft = options.left ?? this.scrollLeft; this.scrollTop = options.top ?? this.scrollTop; };
  w.fetch = async () => { throw Error('Unexpected external request'); };
  w.console.error = (...args) => errors.push(args.map(String).join(' '));
  w.console.warn = (...args) => warnings.push(args.map(String).join(' '));
  w.__recoverable = [];
  const main = w.document.querySelector('main'), header = w.document.querySelector('header');
  t.after(() => { w.__root?.unmount(); dom.window.close(); });
  w.eval(client.outputFiles[0].text);
  for (let i = 0; i < 50 && !w.__committed; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(w.__committed, true, 'Real React hydration must commit');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert(warnings.every(message => message.includes('Reduced Motion enabled')), 'Unexpected runtime warnings');
  return { w, html, main, header, listeners, legacyListeners, errors, mql };
}

for (const serverPath of ['/', '/index']) for (const reduced of [false, true]) {
  test(`real shell + landing hydrate without replacement: server=${serverPath}, reduced=${reduced}`, async t => {
    const v = await fixture(t, serverPath, reduced);
    assert.deepEqual(v.w.__recoverable, []);
    assert.deepEqual(v.errors, []);
    assert(v.header, 'Public header must be present in server HTML');
    assert.equal(v.w.document.querySelector('header'), v.header, 'Server header must survive hydration');
    assert.equal(v.w.document.querySelector('main'), v.main, 'No blank/replacement landing tree');
    assert(!v.html.includes('data-shell-root'), 'Never prerender private app chrome for the homepage alias');
    assert.match(v.html, /running <!-- -->1<!-- -->\/<!-- -->5|running 1\/5/);
    assert.match(v.w.__firstCommit, /running 1\/5/, 'First client commit must use the server motion snapshot');
    assert.match(v.w.document.getElementById('hero-title').closest('section').textContent, reduced ? /passed 5\/5/ : /running 1\/5/);
    assert.equal(v.w.document.querySelector('#hero-title').textContent, 'Find teammateswho actually ship.');
    assert.equal(v.w.document.querySelector('a[href="/login"]').getAttribute('href'), '/login');
  });
}

test('motion preference changes are honored after hydration and subscriptions are cleaned up', async t => {
  const v = await fixture(t, '/', false);
  assert(v.listeners.size > 0);
  v.mql.matches = true; for (const notify of [...v.listeners, ...v.legacyListeners]) notify({ matches: true });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.match(v.w.document.getElementById('hero-title').closest('section').textContent, /passed 5\/5/);
  assert.deepEqual(v.w.__recoverable, []);
  v.w.__root.unmount(); v.w.__root = null;
  assert.equal(v.listeners.size, 0);
});
