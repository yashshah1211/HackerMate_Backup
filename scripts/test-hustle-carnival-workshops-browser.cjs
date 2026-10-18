/* eslint-disable @typescript-eslint/no-require-imports -- Local browser checks with offline configured-link fixtures. */
// Start the real app separately using the synthetic configuration documented in docs/hustle-carnival-workshops.md.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const axe = require('axe-core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ROOT, load } = require('./event-series-harness.cjs');
const Component = load('src/components/partners/HustleCarnivalWorkshops.tsx').default;
const { HUSTLE_WORKSHOPS } = load('src/lib/partners/hustleCarnivalWorkshops.ts');
const output = path.resolve(process.env.HUSTLE_WORKSHOPS_QA_OUTPUT || path.join(ROOT, 'work/workshops-qa'));
const origin = 'http://127.0.0.1:4287';
const fixtureOrigin = 'http://127.0.0.1:4288';
const routePath = '/partners/hustle-carnival/workshops';
const approved = url => ({ url, organizerApproved: true });
const fixtures = http.createServer((req, res) => {
  const configured = req.url === '/configured';
  const workshops = HUSTLE_WORKSHOPS.map(w => ({ ...w,
    livestream: approved(configured ? 'https://youtube.com/watch?v=abcdefghijk' : 'https://youtube.com.evil.test/watch?v=abcdefghijk'),
    certificateForm: { url: 'https://forms.gle/fixture123', organizerApproved: configured },
  }));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Workshop link fixtures</title><style>body{margin:0} ' + fs.readFileSync(path.join(ROOT, 'src/components/partners/HustleCarnivalWorkshops.module.css'), 'utf8') + '</style></head><body>' + renderToStaticMarkup(React.createElement(Component, { workshops })) + '</body></html>');
});
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => fixtures.listen(4288, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true });
  const evidence = { checks: 0, viewports: [], blockedExternal: [], pageErrors: [] };
  const check = (value, message) => { assert(value, message); evidence.checks++; };
  try {
    for (const width of [1440, 768, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.route('**/*', route => {
        const request = route.request();
        const url = new URL(request.url());
        if ([origin, fixtureOrigin].includes(url.origin) && ['GET', 'HEAD'].includes(request.method())) return route.continue();
        evidence.blockedExternal.push(url.origin + url.pathname);
        return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => evidence.pageErrors.push(error.message));
      const response = await page.goto(origin + routePath, { waitUntil: 'networkidle', timeout: 120000 });
      check(response.status() === 200 && page.url() === origin + routePath, 'Anonymous route returns 200 without login redirect');
      check((await page.title()).startsWith('Public Workshops'), 'Workshop-specific title');
      check(await page.locator('main article').count() === 2, 'Two workshops');
      check(await page.locator('main button:disabled').count() === 4, 'Four unavailable actions');
      check(await page.locator('main form, main input, main iframe').count() === 0, 'No registration or certificate collection');
      check(await page.getByText('No sign-in or registration required.').isVisible(), 'Public attendance explained');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      await page.getByRole('link', { name: 'Skip to workshop details' }).focus();
      check(await page.getByRole('link', { name: 'Skip to workshop details' }).isVisible(), 'Visible keyboard skip link');
      await page.keyboard.press('Enter');
      check(await page.locator('#workshop-content').evaluate(el => el === document.activeElement), 'Skip link moves keyboard focus');
      const question = page.getByText('How will certificates be handled?', { exact: true });
      await question.focus();
      await page.keyboard.press('Enter');
      check(await page.getByText(/HackerMate does not generate certificates/).isVisible(), 'Certificate FAQ works with keyboard after hydration');
      check(await question.evaluate(el => getComputedStyle(el).outlineStyle !== 'none'), 'Visible FAQ keyboard focus');
      await page.keyboard.press('Enter');
      for (const el of await page.locator('main button, main summary, main a:not([class*="skip"])').all()) {
        check((await el.boundingBox()).height >= 44, 'Minimum 44px control height');
      }
      await page.evaluate(axe.source);
      const scan = await page.evaluate(() => axe.run('main', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
      fs.writeFileSync(path.join(output, `axe-${width}.json`), JSON.stringify({ violations: scan.violations, incomplete: scan.incomplete, passes: scan.passes.length }, null, 2));
      check(scan.violations.length === 0, JSON.stringify(scan.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, `workshops-${width}.png`), fullPage: true });
      evidence.viewports.push({ width, axeViolations: scan.violations.length });
      // Enabled/unapproved cases use source-rendered offline fixtures, never live destinations.
      for (const state of ['configured', 'invalid']) {
        await page.goto(fixtureOrigin + '/' + state);
        check(await page.locator('main a[target="_blank"]').count() === (state === 'configured' ? 4 : 0), state + ' link count');
        check(await page.locator('main button:disabled').count() === (state === 'configured' ? 0 : 4), state + ' button count');
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), state + ' has no overflow');
        for (const link of await page.locator('main a[target="_blank"]').all()) {
          check(await link.getAttribute('rel') === 'noopener noreferrer', 'Safe external link');
          await link.focus();
          check(await link.evaluate(el => getComputedStyle(el).outlineStyle !== 'none'), 'Enabled link visible keyboard focus');
        }
      }
      await context.close();
    }
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await noJs.route('**/*', route => new URL(route.request().url()).origin === origin && ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    const page = await noJs.newPage();
    await page.goto(origin + routePath);
    check(await page.locator('main article').count() === 2, 'Server-rendered workshops work without JavaScript');
    await noJs.close();
    check(evidence.pageErrors.length === 0, JSON.stringify(evidence.pageErrors));
    fs.writeFileSync(path.join(output, 'browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(`PASS: ${evidence.checks} browser checks at 1440/768/390/320px, zero axe violations or page errors; no live services used.`);
  } finally {
    await browser.close();
    await new Promise(resolve => fixtures.close(resolve));
  }
})().catch(error => { console.error(error); fixtures.close(); process.exitCode = 1; });
