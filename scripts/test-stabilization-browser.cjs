/* eslint-disable @typescript-eslint/no-require-imports -- Loopback Chromium execution of the actual guard, synthetic auth only. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require('@playwright/test');
const { expect } = require('@playwright/test');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const ROOT = path.resolve(__dirname, '..');

test('AuthGuard Chromium: errors, sign-out ordering, suspension and recovery at desktop/mobile', async () => {
  const client = `
    const user = {id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.invalid'};
    const listeners = new Set(), pending = [], navigation = [];
    window.fixture = {pending,navigation,
      resolve(index, kind) { pending[index]({data: kind === 'error' ? null : {...user,role:'user',onboarding_completed:true,is_banned:kind==='banned'},error:kind==='error'?{code:'42501',message:'Synthetic permission denied'}:null}); },
      emit(event) { listeners.forEach(fn => fn(event,event==='SIGNED_OUT'?null:{user})); }
    };
    export const router = {replace(value){navigation.push(value)}};
    export const supabase = {auth:{async getSession(){return {data:{session:{user}},error:null}},async getUser(){return {data:{user},error:null}},
      onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}},
      from(){return {select(){return this},eq(){return this},maybeSingle(){return new Promise(resolve=>pending.push(resolve))}}}};
    export function identifyUser(){}
  `;
  const result = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Guard from './src/components/AuthGuard';createRoot(document.getElementById('root')).render(<Guard><button>Protected fixture action</button></Guard>);`, resolveDir: ROOT, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'synthetic-auth', setup(builder) {
      builder.onResolve({ filter: /^(@\/lib\/(supabase|posthog)|next\/navigation)$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: client + '\nexport const useRouter = () => router;', loader: 'js' }));
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'navigation' }));
      builder.onLoad({ filter: /.*/, namespace: 'navigation' }, () => ({ contents: "import React from 'react';export default ({href,children,...props})=><a href={href} {...props}>{children}</a>;", loader: 'jsx', resolveDir: ROOT }));
    } }],
  });
  const css = await postcss([tailwind({ base: ROOT })]).process(fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), { from: path.join(ROOT, 'src/app/globals.css') });
  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); res.end(result.outputFiles[0].text); }
    else if (req.url === '/style.css') { res.setHeader('content-type', 'text/css'); res.end(css.css); }
    else { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
    const output = path.join(ROOT, 'scratch/stabilization/browser'); fs.mkdirSync(output, { recursive: true });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      try {
        const external = [], errors = [];
        await context.route('**/*', route => {
          const request = route.request();
          if (new URL(request.url()).origin === origin && request.method() === 'GET') return route.continue();
          external.push(request.url()); return route.abort();
        });
        const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + '/dashboard');
        await page.waitForFunction(() => window.fixture.pending.length === 1);
        await page.evaluate(() => window.fixture.resolve(0, 'error'));
        await expect(page.getByRole('heading', { name: 'Verification unavailable' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Protected fixture action' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, `verification-${width}.png`) });

        await page.reload(); await page.waitForFunction(() => window.fixture.pending.length === 1);
        await page.evaluate(() => { window.fixture.emit('SIGNED_OUT'); window.fixture.resolve(0, 'active'); });
        await page.waitForFunction(() => window.fixture.navigation.length === 1);
        await expect(page.getByRole('button', { name: 'Protected fixture action' })).toHaveCount(0);

        await page.evaluate(() => window.fixture.emit('SIGNED_IN'));
        await page.waitForFunction(() => window.fixture.pending.length === 2);
        await page.evaluate(() => window.fixture.resolve(1, 'banned'));
        await expect(page.getByRole('heading', { name: 'Account suspended' })).toBeVisible();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, `suspended-${width}.png`) });

        await page.evaluate(() => window.fixture.emit('SIGNED_IN'));
        await page.waitForFunction(() => window.fixture.pending.length === 3);
        await page.evaluate(() => window.fixture.resolve(2, 'active'));
        await expect(page.getByRole('button', { name: 'Protected fixture action' })).toBeVisible();
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        console.log(`PASS ${width}px: verification error, sign-out race, suspension, recovery, no overflow or external requests`);
      } finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
