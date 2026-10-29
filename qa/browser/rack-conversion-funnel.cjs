/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic browser acceptance; no live services. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require('@playwright/test');
const ROOT = process.cwd(), OUT = path.join(ROOT, 'scratch/rack-funnel');
const EVENT = '00000000-0000-4000-8000-000000000006';
const DESTINATION = `/hackathons/${EVENT}?tab=looking_for_teams`;
const BASE = 'http://fixture.invalid';
const PORTAL = '/partners/rack-it-up-2026';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const fixture = path.join(ROOT, 'qa/fixtures/rack-funnel-browser.jsx');
  const bundle = await esbuild.build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {App} from './qa/fixtures/rack-funnel-browser.jsx';createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: ROOT, loader: 'jsx' },
    bundle: true, write: false, outdir: OUT, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SITE_URL': JSON.stringify(BASE) }, plugins: [{ name: 'synthetic-only-adapters', setup(build) {
      build.onResolve({ filter: /^(next\/(link|navigation)|@\/lib\/(supabase|posthog)|@\/context\/NotificationContext|@vercel\/analytics)$/ }, () => ({ path: fixture }));
    } }],
  });
  const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
  const moduleCss = bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text || '';
  const globalCss = await postcss([tailwind()]).process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
  const css = globalCss.css + moduleCss + '\nhtml{--font-ui:Arial;--font-display-face:Arial;--font-code:monospace}body{margin:0}';
  if (process.argv.includes('--prepare-only')) { console.log(JSON.stringify({ prepared: true, javascriptBytes: js.length, cssBytes: css.length })); return; }
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, channel: 'chrome', args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
  const results = [];
  const check = async (name, fn) => { await fn(); results.push({ name, pass: true }); console.log('PASS ' + name); };
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      const unexpected = [], errors = [], consoleErrors = [];
      let page;
      try {
        await context.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.origin !== BASE) { unexpected.push(url.origin); return route.abort('blockedbyclient'); }
          if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: js });
          if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css });
          if (['RackItUp-mark.png', 'karma-logo.png'].some(file => url.pathname === '/partners/rack-it-up-2026/' + file)) return route.fulfill({ contentType: 'image/png', body: fs.readFileSync(path.join(ROOT, 'public', url.pathname)) });
          if (route.request().resourceType() !== 'document') { unexpected.push(url.pathname); return route.abort(); }
          return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><p style="padding:12px">Synthetic isolated journey — no live accounts or records.</p><div id="root"></div><script src="/fixture.js"></script></body></html>' });
        });
        page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
        page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        await page.goto(BASE + PORTAL);
        await page.getByText('Browse public builder profiles first.', { exact: false }).waitFor();
        await check(width + ': portal branding, reassurance and distinct registration', async () => {
          assert(await page.getByText('Organised by Karma Enterprises', { exact: true }).isVisible());
          assert.equal(await page.getByRole('link', { name: /Register on Unstop/ }).getAttribute('href'), 'https://unstop.com/hackathons/rack-it-up-2026-48-hour-online-hackathon-by-rackem-karma-enterprises-1777639');
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({ path: path.join(OUT, `portal-${width}.png`), fullPage: true });
        });
        await page.getByRole('link', { name: 'Find teammates', exact: true }).focus();
        await page.keyboard.press('Enter');
        await page.getByText('Synthetic Public Builder', { exact: true }).waitFor();
        await check(width + ': guest sees real component projection before login', async () => {
          assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, DESTINATION);
          assert.equal(await page.evaluate(() => window.__qa.writes.length), 0);
          assert(await page.evaluate(() => window.__qa.reads.every(read => read.table === 'hackathons')));
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.screenshot({ path: path.join(OUT, `guest-${width}.png`), fullPage: true });
        });
        await page.goBack(); await page.getByRole('heading', { name: 'Rack It Up 2026', exact: true }).waitFor();
        await page.goForward(); await page.getByText('Synthetic Public Builder', { exact: true }).waitFor();
        await page.reload(); await page.getByText('Synthetic Public Builder', { exact: true }).waitFor();
        await check(width + ': history and refresh preserve event and tab', async () => assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, DESTINATION));
        await page.getByRole('link', { name: 'Sign in to list your profile', exact: true }).click();
        await page.getByRole('button', { name: 'Continue with Google', exact: true }).waitFor();
        await check(width + ': login retains context and required consent', async () => {
          assert.equal(new URL(page.url()).searchParams.get('next'), DESTINATION);
          assert(await page.getByRole('button', { name: 'Continue with Google', exact: true }).isDisabled());
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        });
        await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
        await page.getByRole('button', { name: 'Finish setup', exact: true }).first().waitFor();
        await check(width + ': synthetic OAuth handoff retains onboarding return', async () => {
          assert.equal(new URL(page.url()).pathname, '/onboarding'); assert.equal(new URL(page.url()).searchParams.get('next'), DESTINATION);
          const callback = await page.evaluate(() => window.__qa.callbacks[0]); assert.equal(new URL(callback).searchParams.get('next'), DESTINATION);
          assert.equal(await page.evaluate(() => window.__qa.writes.length), 0);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        });
        await page.getByRole('button', { name: 'Finish setup', exact: true }).filter({ visible: true }).first().click();
        await page.getByRole('button', { name: 'List my profile', exact: true }).waitFor();
        await check(width + ': actual onboarding returns to the requested member tab without auto listing', async () => {
          assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, DESTINATION);
          assert.equal(await page.evaluate(() => window.__qa.writes.filter(w => w.table === 'hackathon_registrations').length), 0);
          assert.equal(await page.getByRole('link', { name: 'Create a team', exact: true }).first().getAttribute('href'), `/teams/create?hackathon=${EVENT}`);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        });
        await page.getByRole('button', { name: 'List my profile', exact: true }).click();
        await page.getByRole('button', { name: 'Stop listing profile', exact: true }).waitFor();
        await check(width + ': first team-building action requires explicit authenticated intent', async () => {
          const writes = await page.evaluate(() => window.__qa.writes.filter(w => w.table === 'hackathon_registrations'));
          assert.equal(writes.length, 1); assert.equal(writes[0].payload.hackathon_id, EVENT);
          assert.equal(writes[0].payload.user_id, '00000000-0000-4000-8000-000000000007');
          assert.equal(writes[0].payload.looking_for_team, true);
        });
        await check(width + ': fixed-slug metrics are observations only', async () => {
          const events = await page.evaluate(() => window.__qa.events);
          for (const name of ['rack_portal_view', 'rack_find_teammates_click', 'rack_login_entry', 'rack_onboarding_entry']) assert(events.some(e => e.name === name), name);
          for (const event of events) assert.deepEqual(event.properties, { event_slug: 'rack-it-up-2026' });
          assert(events.every(e => !/completed|registered|signup/.test(e.name)));
        });
        // Start another public journey with analytics deliberately unavailable.
        await page.evaluate(() => { window.__qa.signedIn = false; window.__qa.analyticsFailure = true; sessionStorage.setItem('m09_synthetic_fixture', JSON.stringify(window.__qa)); });
        await page.goto(BASE + PORTAL); await page.getByRole('link', { name: 'Find teammates', exact: true }).click();
        await page.getByText('Synthetic Public Builder', { exact: true }).waitFor();
        await check(width + ': analytics failure does not break navigation; no external requests', async () => {
          assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, DESTINATION);
          assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
        });
        await page.evaluate(() => { window.__qa.empty = true; window.__qa.discoveryFailure = true; sessionStorage.setItem('m09_synthetic_fixture', JSON.stringify(window.__qa)); });
        await page.reload(); await page.getByText("Couldn't load public builder listings", { exact: true }).waitFor();
        await check(width + ': failed discovery is not an empty list; retry shows truthful public empty state', async () => {
          assert.equal(await page.getByText('No public builder listings yet', { exact: true }).count(), 0);
          await page.evaluate(() => { window.__qa.discoveryFailure = false; });
          await page.getByRole('button', { name: 'Retry', exact: true }).click();
          await page.getByText('No public builder listings yet', { exact: true }).waitFor();
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
        });
      } catch (error) {
        if (page) {
          const diagnostics = await page.evaluate(() => ({ pathname: location.pathname, tables: window.__qa?.reads.map(read => ({ table: read.table, columns: read.columns })), operations: window.__qa?.writes.map(write => ({ table: write.table, operation: write.operation })) }));
          fs.writeFileSync(path.join(OUT, `failure-${width}.json`), JSON.stringify({ error: error.message, errors, consoleErrors, diagnostics }, null, 2));
          await page.screenshot({ path: path.join(OUT, `failure-${width}.png`), fullPage: true });
        }
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2)); }
  console.log(JSON.stringify({ passed: results.length, failed: 0, syntheticOnly: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
