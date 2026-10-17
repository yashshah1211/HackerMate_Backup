/* eslint-disable @typescript-eslint/no-require-imports -- Network-isolated Chromium checks of actual route SSR output. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const axe = require('axe-core');
const { ROOT, event, renderPortal } = require('./hustle-carnival-harness.cjs');

async function main() {
  const output = path.resolve(process.env.HUSTLE_QA_OUTPUT || path.join(ROOT, 'scratch/hustle-carnival-qa'));
  fs.mkdirSync(output, { recursive: true });
  const css = fs.readFileSync(path.join(ROOT, 'src/components/partners/HustleCarnivalPage.module.css'), 'utf8');
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true });
  const evidence = { mode: 'offline actual route SSR with local assets and real component CSS; not Next hydration or live RLS',
    browser: browser.version(), externalRequests: 0, viewports: [], checks: 0 };
  const check = (condition, message) => { assert(condition, message); evidence.checks++; };
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
      let options = { row: { start_date: '2026-10-12', end_date: '2026-10-22', mode: 'online', location: 'Venue in India', max_team_size: 4 } };
      const errors = [];
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://hustle.test' || route.request().method() !== 'GET') {
          evidence.externalRequests++;
          return route.abort();
        }
        if (url.pathname.endsWith('.jpeg')) {
          assert(url.pathname.startsWith('/partners/hustle-carnival/'));
          return route.fulfill({ contentType: 'image/jpeg', body: fs.readFileSync(path.join(ROOT, 'public', url.pathname)) });
        }
        assert.equal(url.pathname, '/partners/hustle-carnival');
        const { html } = await renderPortal(options);
        await route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hustle Carnival offline review</title><style>body{margin:0} ${css}</style></head><body>${html}</body></html>` });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      const noOverflow = async () => check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${viewport.width}`);
      const scan = async state => {
        await page.evaluate(axe.source);
        const result = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }));
        fs.writeFileSync(path.join(output, `axe-${state}-${viewport.width}.json`), JSON.stringify({ violations: result.violations, incomplete: result.incomplete, passes: result.passes.length }, null, 2));
        check(result.violations.length === 0, JSON.stringify(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))));
        return { violations: result.violations.length, incomplete: result.incomplete.map(item => item.id), passes: result.passes.length };
      };
      await page.goto('http://hustle.test/partners/hustle-carnival');
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
      check(await page.locator('img').count() === 2, 'Both supplied posters render');
      check(await page.locator('a[href*="?tab="]').count() === 0, 'Stale metadata suppresses matchmaking');
      await page.getByText('Teammate discovery is awaiting an event details update.').waitFor();
      await noOverflow();
      await page.keyboard.press('Tab');
      check(await page.locator(':focus').innerText() === 'Skip to event details', 'Skip link is first in tab order');
      await page.keyboard.press('Enter');
      check(await page.locator(':focus').getAttribute('id') === 'hustle-content', 'Skip target receives focus');
      await page.getByRole('link', { name: /Team matching status/ }).click();
      check(new URL(page.url()).hash === '#community', 'Community anchor works');
      const summary = page.getByText('Who can take part?', { exact: true });
      await summary.focus();
      await page.keyboard.press('Enter');
      check(await page.locator('details').first().getAttribute('open') !== null, 'FAQ opens with keyboard');
      check(await page.getByText(/as well as MBA students/).isVisible(), 'Eligibility conflict is available');
      const a11y = await scan('pending');
      await page.keyboard.press('Enter');
      for (const target of await page.locator('a:visible, summary').all()) {
        const box = await target.boundingBox();
        check(box.height >= 44 && box.width >= 24, 'Interactive targets have sufficient size');
      }
      for (const link of await page.locator('a[target="_blank"]').all()) {
        check(await link.getAttribute('rel') === 'noopener noreferrer', 'Safe external links');
      }
      await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `portal-${viewport.width}.png`), fullPage: true });
      await page.getByRole('link', { name: 'Register on Unstop (opens in a new tab)', exact: true }).first().focus();
      check(await page.locator(':focus').evaluate(el => getComputedStyle(el).outlineStyle) !== 'none', 'Visible keyboard focus');
      await page.screenshot({ path: path.join(output, `keyboard-${viewport.width}.png`) });

      options = {};
      await page.goto('http://hustle.test/partners/hustle-carnival');
      check(await page.locator('a[href*="?tab="]').count() === 0, 'Corrected metadata still cannot enable participation');
      await page.getByText('HackerMate team matching is not enabled for this event yet.').waitFor();
      await noOverflow();
      const readyA11y = await scan('ready');
      options = { error: { message: 'offline unavailable fixture' } };
      await page.goto('http://hustle.test/partners/hustle-carnival');
      await page.getByText('Teammate discovery is temporarily unavailable.').waitFor();
      check(await page.getByRole('link', { name: /Register on Unstop/ }).count() === 2, 'Official registration survives lookup errors');
      await noOverflow();
      check(errors.length === 0, 'No browser page errors');
      evidence.viewports.push({ ...viewport, pageErrors: errors.length, pendingA11y: a11y, readyA11y });
      await context.close();
    }
    check(evidence.externalRequests === 0, 'No external requests');
    fs.writeFileSync(path.join(output, 'browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(`PASS: ${evidence.checks} browser assertions; 1440/390/320px, keyboard and axe, no external requests. Evidence: ${output}`);
  } finally { await browser.close(); }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
