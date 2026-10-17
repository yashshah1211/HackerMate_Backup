/* eslint-disable @typescript-eslint/no-require-imports -- Local Next.js integration with a synthetic loopback database. */
// Start Next on 127.0.0.1:4275 with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4276
// and NEXT_PUBLIC_SUPABASE_ANON_KEY=hustle-offline-fixture. No real credentials.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '..');
const requireApp = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = requireApp('playwright');
const axe = requireApp('axe-core');
const output = path.resolve(process.env.HUSTLE_QA_OUTPUT || path.join(ROOT, 'scratch/hustle-carnival-qa'));
const id = '0da43cba-90dc-449c-a126-a2fc8be8a379';
const registration = 'https://unstop.com/hackathons/hustle-carnival-gl-bajaj-group-of-institutions-1763514';
let state = 'pending';
const queries = [], unexpectedServer = [];
const stub = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4276');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4275');
  if (req.method === 'GET' && url.pathname === '/rest/v1/hackathons') {
    queries.push({ path: url.pathname, method: req.method, query: [...url.searchParams] });
    assert.equal(url.searchParams.get('id'), 'eq.' + id);
    assert.equal(url.searchParams.get('status'), 'eq.approved');
    assert.equal(url.searchParams.get('archived'), 'eq.false');
    if (state === 'unavailable') { res.statusCode = 503; return res.end(JSON.stringify({ message: 'Synthetic fixture outage' })); }
    return res.end(JSON.stringify([{ id, status: 'approved', archived: false, type: 'external',
      start_date: state === 'pending' ? '2026-10-12' : '2026-10-22', end_date: state === 'pending' ? '2026-10-22' : '2026-10-24',
      mode: state === 'pending' ? 'online' : 'hybrid', location: state === 'pending' ? 'Venue in India' : 'Block A & B, G.L. Bajaj Group of Institutions, Mathura',
      min_team_size: 1, max_team_size: state === 'pending' ? 4 : 2, website_url: registration }]));
  }
  unexpectedServer.push({ method: req.method, path: url.pathname });
  res.statusCode = 403; res.end('{}');
});
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => stub.listen(4276, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
  const evidence = { mode: 'real local Next.js webpack route + app shell + hydration; synthetic loopback Supabase, no production', viewports: [], blockedExternal: [], queries, unexpectedServer, checks: 0 };
  const check = (value, message) => { assert(value, message); evidence.checks++; };
  try {
    for (const width of [1440, 390, 320]) {
      state = 'pending';
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const errors = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (['http://127.0.0.1:4275','http://127.0.0.1:4276'].includes(url.origin) && ['GET','HEAD'].includes(route.request().method())) return route.continue();
        evidence.blockedExternal.push(url.origin + url.pathname);
        return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.stack || error.message));
      const response = await page.goto('http://127.0.0.1:4275/partners/hustle-carnival', { waitUntil: 'domcontentloaded', timeout: 90000 });
      check(response.status() === 200, 'Real Next route returns 200');
      await page.getByRole('heading', { name: /Hustle.*Carnival/, level: 1 }).waitFor({ timeout: 60000 });
      await page.locator('main img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
      await page.evaluate(() => document.fonts.ready);
      check(await page.title() === 'Hustle Carnival 2026 × HackerMate', 'Page title');
      check(await page.locator('a[href*="?tab="]').count() === 0, 'Pending metadata blocks matchmaking');
      check(await page.getByText('Teammate discovery is awaiting an event details update.').isVisible(), 'Pending state');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page overflow');
      check(await page.getByRole('link', { name: 'Register on Unstop (opens in a new tab)', exact: true }).first().getAttribute('href') === registration, 'Registration URL');
      await page.getByText('Who can take part?', { exact: true }).focus();
      await page.keyboard.press('Enter');
      check(await page.getByText(/as well as MBA students/).isVisible(), 'Native keyboard FAQ after hydration');
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { level: 1 }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/next-portal-${width}.png`, fullPage: true });
      await page.screenshot({ path: `${output}/next-hero-${width}.png` });
      await page.evaluate(axe.source);
      const scan = await page.evaluate(() => axe.run('main', { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } }));
      fs.writeFileSync(`${output}/next-axe-${width}.json`, JSON.stringify({ violations: scan.violations, incomplete: scan.incomplete, passes: scan.passes.length }, null, 2));
      check(scan.violations.length === 0, JSON.stringify(scan.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))));
      if (width === 390) {
        state = 'ready';
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
        check(await page.locator('a[href*="?tab="]').count() === 0, 'Corrected metadata still cannot enable participation');
        await page.getByText('HackerMate team matching is not enabled for this event yet.').waitFor();
        await page.getByRole('heading', { name: 'Big ideas. The right teammate.' }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/next-community-ready-390.png` });
        state = 'unavailable';
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.getByText('Teammate discovery is temporarily unavailable.').waitFor({ timeout: 15000 });
        check(await page.getByText('Teammate discovery is temporarily unavailable.').isVisible(), 'Unavailable state after fresh server request');
      }
      check(errors.length === 0, JSON.stringify(errors));
      evidence.viewports.push({ width, pageErrors: errors.length, axeViolations: scan.violations.length, axeIncomplete: scan.incomplete.map(v => v.id) });
      await context.close();
    }
    check(unexpectedServer.length === 0, 'No unexpected server-side database routes or writes');
    fs.writeFileSync(`${output}/next-browser-evidence.json`, JSON.stringify(evidence, null, 2) + '\n');
    console.log(`PASS: ${evidence.checks} real Next.js browser checks at 1440/390/320px; no page errors, no axe violations, no live database.`);
  } finally { await browser.close(); await new Promise(resolve => stub.close(resolve)); }
})().catch(error => { console.error(error); stub.close(); process.exitCode = 1; });
