/* eslint-disable @typescript-eslint/no-require-imports -- Offline browser verification of real server-route output. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { ROOT, series, fixture, renderPath } = require('./event-series-harness.cjs');

async function main() {
  const output = path.join(ROOT, 'scratch/craftncode-qa');
  fs.mkdirSync(output, { recursive: true });
  const css = fs.readFileSync(path.join(ROOT, 'src/components/partners/EventSeriesPage.module.css'), 'utf8');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const evidence = { browser: browser.version(), mode: 'offline SSR fixtures; no live API or authentication', viewports: [], externalRequests: 0 };
  let checks = 0;
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      let options = {};
      const failures = [];
      const queries = [];
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'http://craftncode.test' || route.request().method() !== 'GET') {
          evidence.externalRequests++;
          return route.abort();
        }
        const result = await renderPath(url.pathname, options);
        queries.push(...result.queries);
        await route.fulfill({ status: result.status, contentType: 'text/html; charset=utf-8', body:
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline Craft N Code QA</title><style>body{margin:0} ${css}</style></head><body>${result.html}</body></html>` });
      });
      const page = await context.newPage();
      page.on('pageerror', error => failures.push(error.message));
      const overflow = async () => {
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Overflow at ${viewport.width}`);
        checks++;
      };
      await page.goto('http://craftncode.test/partners/craftncode');
      assert.equal(await page.evaluate(() => document.characterSet), 'UTF-8'); checks++;
      await page.getByRole('heading', { name: 'Currently listed qualifiers' }).waitFor();
      assert.equal(await page.locator('ul a').count(), 7); checks++;
      await overflow();
      await page.screenshot({ path: path.join(output, `hub-${viewport.width}.png`), fullPage: true });
      for (const qualifier of series.qualifiers) {
        const link = page.locator(`a[href="/partners/craftncode/${qualifier.slug}"]`);
        assert((await link.boundingBox()).height >= 44); checks++;
        await link.click();
        await page.getByRole('heading', { level: 1 }).waitFor();
        assert((await page.getByRole('heading', { level: 1 }).innerText()).includes(qualifier.state)); checks++;
        const discovery = page.getByRole('link', { name: `Find teammates in ${qualifier.state}` });
        assert.equal(await discovery.getAttribute('href'), `/hackathons/${qualifier.eventId}?tab=looking_for_teams`); checks++;
        assert((await discovery.boundingBox()).height >= 44); checks++;
        const register = page.getByRole('link', { name: 'Register on Unstop' });
        assert.equal(await register.getAttribute('href'), fixture().rows.find(row => row.id === qualifier.eventId).website_url); checks++;
        assert.equal(await register.getAttribute('rel'), 'noopener noreferrer'); checks++;
        assert.equal(await page.locator('a[href*="/hackathons/"]:not([href^="https://"])').count(), 1); checks++;
        assert((await page.locator('body').innerText()).includes('2–4 members per team')); checks++;
        assert(!(await page.locator('body').innerText()).includes('Venue in India')); checks++;
        await overflow();
        if (qualifier.slug === 'tamil-nadu') {
          await discovery.focus();
          assert.notEqual(await discovery.evaluate(element => getComputedStyle(element).outlineStyle), 'none'); checks++;
          await page.screenshot({ path: path.join(output, `tamil-nadu-${viewport.width}.png`), fullPage: true });
        }
        await page.getByRole('link', { name: /All listed qualifiers/ }).click();
        await page.getByRole('heading', { name: 'Currently listed qualifiers' }).waitFor();
      }
      options = { error: { code: 'OFFLINE_FIXTURE_FAILURE' } };
      await page.goto('http://craftncode.test/partners/craftncode/delhi');
      await page.getByRole('heading', { name: 'Qualifier details temporarily unavailable' }).waitFor();
      options = {};
      await page.getByRole('link', { name: 'Retry', exact: true }).click();
      assert((await page.getByRole('heading', { level: 1 }).innerText()).includes('Delhi')); checks++;
      options = { rows: [] };
      await page.goto('http://craftncode.test/partners/craftncode');
      assert.equal(await page.locator('ul a').count(), 0); checks++;
      await page.getByRole('status').waitFor();
      await overflow();
      const response = await page.goto('http://craftncode.test/partners/craftncode/unknown');
      assert.equal(response.status(), 404); checks++;
      await page.getByRole('heading', { name: 'Qualifier not found' }).waitFor();
      assert.equal(failures.length, 0); checks++;
      for (const query of queries) {
        assert.equal(query.table, 'hackathons'); assert(!query.columns.includes('*'));
      }
      evidence.viewports.push({ ...viewport, statesChecked: series.qualifiers.length, pageErrors: failures.length, requests: queries.length });
      await context.close();
    }
    assert.equal(evidence.externalRequests, 0); checks++;
    evidence.checks = checks;
    fs.writeFileSync(path.join(output, 'browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(`PASS: ${checks} browser assertions; desktop 1440, mobile 390 and 320; seven qualifiers each; zero external requests.`);
    console.log(`Evidence: ${output}`);
  } finally {
    await browser.close();
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
