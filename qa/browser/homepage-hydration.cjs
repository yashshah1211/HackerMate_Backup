/* eslint-disable @typescript-eslint/no-require-imports -- Offline production-build Chromium qualification. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');
const OUT = path.resolve('scratch/homepage-hydration');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() {
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value;
}
async function build() {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env: process.env, stdio: 'inherit', timeout: 420000 });
    child.on('error', reject); child.on('exit', value => resolve(value));
  });
  assert.equal(code, 0, 'Default production build must pass');
}
(async () => {
  assert.equal(process.env.EVALUATOR_GENERATION_ENABLED, 'false');
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'synthetic-anonymous');
  assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, '127.0.0.1');
  assert(process.env.NODE_OPTIONS?.includes('rack-network-guard.mjs'));
  fs.mkdirSync(OUT, { recursive: true });
  await build();
  const origin = 'http://127.0.0.1:' + await port();
  const log = fs.createWriteStream(path.join(OUT, 'server.log'));
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', new URL(origin).port],
    { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  let browser; const results = [];
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      if (child.exitCode !== null) throw Error('Local Next server exited before readiness');
      try { const response = await fetch(origin, { signal: AbortSignal.timeout(1500) }); await response.body?.cancel(); if (response.ok) { ready = true; break; } } catch { /* bounded local startup wait */ }
      await delay(500);
    }
    assert(ready, 'Local production server readiness');
    browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
    for (const width of [390, 1440]) for (const reducedMotion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion, serviceWorkers: 'block',
        locale: width === 390 ? 'en-IN' : 'en-US', timezoneId: width === 390 ? 'Asia/Kolkata' : 'UTC', colorScheme: 'light' });
      let releaseScripts; let current;
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== origin || req.method() !== 'GET' || /^\/(?:api|auth|_vercel)\//.test(url.pathname)) {
          current?.blocked.push({ method: req.method(), origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient');
        }
        if (req.resourceType() === 'script' && releaseScripts) await releaseScripts.promise;
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', e => current?.errors.push({ message: e.message, stack: e.stack }));
      page.on('console', message => { if (message.type() === 'error') current?.console.push(message.text()); });
      try {
        for (const navigation of ['fresh', 'reload']) {
          current = { width, reducedMotion, navigation, errors: [], console: [], blocked: [] }; results.push(current);
          let release; releaseScripts = { promise: new Promise(resolve => { release = resolve; }) };
          try {
            const response = navigation === 'fresh' ? await page.goto(origin, { waitUntil: 'commit' }) : await page.reload({ waitUntil: 'commit' });
            assert.equal(response.status(), 200);
            await page.locator('#hero-title').waitFor({ state: 'visible' });
            await page.waitForFunction(() => [...document.querySelectorAll('link[rel="stylesheet"]')].every(link => Boolean(link.sheet)));
            await page.evaluate(() => document.fonts.ready);
            const before = await page.evaluate(() => {
              const heading = document.getElementById('hero-title'), header = document.querySelector('header');
              window.__m16Before = { main: document.querySelector('main'), heading, header };
              window.__m16MissingContent = false;
              new MutationObserver(() => {
                if (!document.querySelector('main #hero-title')) window.__m16MissingContent = true;
              }).observe(document.body, { childList: true, subtree: true });
              const box = heading.getBoundingClientRect();
              return { title: heading.textContent, headingY: box.y, headingHeight: box.height,
                privateShell: Boolean(document.querySelector('[data-shell-root]')), publicHeader: Boolean(header?.className.includes('fixed inset-x-0')) };
            });
            assert.equal(before.privateShell, false); assert.equal(before.publicHeader, true);
            current.server = before;
            await page.screenshot({ path: path.join(OUT, `${width}-${reducedMotion}-${navigation}-server.png`) });
          } finally { release(); releaseScripts = null; }
          await page.waitForLoadState('domcontentloaded');
          await page.waitForFunction(() => Object.keys(document.getElementById('hero-title')).some(key => key.startsWith('__reactFiber$')));
          const hero = page.locator('section[aria-labelledby="hero-title"]');
          if (reducedMotion === 'reduce') await page.waitForFunction(() => document.getElementById('hero-title').closest('section').textContent.includes('passed 5/5'));
          await page.waitForTimeout(150);
          current.client = await page.evaluate(() => {
            const heading = document.getElementById('hero-title'), before = window.__m16Before, box = heading.getBoundingClientRect();
            return { sameMain: document.querySelector('main') === before.main, sameHeading: heading === before.heading,
              sameHeader: document.querySelector('header') === before.header, missingContent: window.__m16MissingContent,
              title: heading.textContent, headingY: box.y, headingHeight: box.height,
              dark: document.documentElement.classList.contains('dark'), overflow: document.documentElement.scrollWidth > innerWidth };
          });
          assert.equal(current.client.sameMain, true); assert.equal(current.client.sameHeading, true); assert.equal(current.client.sameHeader, true);
          assert.equal(current.client.missingContent, false); assert.equal(current.client.overflow, false); assert.equal(current.client.dark, true);
          assert.equal(current.client.title, current.server.title);
          assert(Math.abs(current.client.headingY - current.server.headingY) <= 2, 'No initial heading-position flash');
          assert(Math.abs(current.client.headingHeight - current.server.headingHeight) <= 2, 'No initial heading-size flash');
          assert.equal(await hero.getByRole('link', { name: 'Find teammates', exact: true }).getAttribute('href'), '/login');
          assert.equal(await hero.getByRole('link', { name: 'See how it works', exact: true }).getAttribute('href'), '#how');
          await page.screenshot({ path: path.join(OUT, `${width}-${reducedMotion}-${navigation}-hydrated.png`) });
          const stageButtons = hero.locator('button[aria-expanded]'); assert.equal(await stageButtons.count(), 5);
          if (reducedMotion === 'no-preference') {
            await hero.locator('ol').scrollIntoViewIfNeeded();
            await page.waitForFunction(() => document.querySelector('section[aria-labelledby="hero-title"] ol button[aria-expanded]:nth-of-type(1)') && [...document.querySelectorAll('section[aria-labelledby="hero-title"] ol button[aria-expanded]')].slice(1).some(button => button.getAttribute('aria-expanded') === 'true'), null, { timeout: 8000 });
            current.autoplayAdvanced = true;
          } else { assert.equal(await hero.getByRole('button', { name: /Replay/ }).count(), 0); current.reducedMotionHonored = true; }
          await stageButtons.nth(2).click();
          await page.waitForFunction(() => document.querySelectorAll('section[aria-labelledby="hero-title"] button[aria-expanded]')[2].getAttribute('aria-expanded') === 'true');
          current.manualStageWorks = true;
          assert.deepEqual(current.errors, []);
          assert(!current.console.some(message => /hydrat|#418/i.test(message)), 'No hidden hydration console errors');
          assert(current.blocked.every(request => request.method === 'GET' && (/analytics|google|sentry|posthog/.test(request.origin) || request.path.startsWith('/_vercel/'))), 'No private/data/write requests');
          current.pass = true; console.log('PASS homepage ' + JSON.stringify({ width, reducedMotion, navigation }));
        }
      } finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    child.kill(); await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]); log.end();
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify({ passed: results.filter(row => row.pass).length, failed: results.filter(row => !row.pass).length, realProductionBuild: true, syntheticOnly: true }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
