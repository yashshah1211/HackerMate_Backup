/* eslint-disable @typescript-eslint/no-require-imports -- Real local Next routes and the existing synthetic dashboard gallery. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const axe = require('axe-core');
const { ROOT, freePort } = require('./hustle-phase2-local-db.cjs');
const { HUSTLE_CARNIVAL: event } = require('./hustle-carnival-harness.cjs').load('src/lib/partners/hustleCarnival.ts');
const out = path.join(ROOT, 'test-results/hustle-partnership');
const portal = '/partners/hustle-carnival';
const evidence = { mode: 'Unmodified Next routes + existing development-only dashboard fixtures; loopback only; offline fonts', checks: 0, screens: [], pageErrors: [], unexpectedRequests: [], blockedExternalOrigins: [] };
const check = (value, message) => { assert(value, message); evidence.checks++; };

async function main() {
  fs.mkdirSync(out, { recursive: true });
  assert(!fs.existsSync(path.join(ROOT, '.env')) && !fs.existsSync(path.join(ROOT, '.env.local')), 'No real environment files');
  const fonts = path.join(ROOT, 'test-results/hustle-phase2-production/font-mock.cjs');
  assert(fs.existsSync(fonts), 'Run test-hustle-phase2-production.cjs first to create offline font responses');
  const port = await freePort();
  const dbPort = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const dbOrigin = `http://127.0.0.1:${dbPort}`;
  const reads = [];
  const stub = http.createServer((req, res) => {
    const url = new URL(req.url, dbOrigin);
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && url.pathname === '/rest/v1/hackathons' && url.searchParams.get('id') === `eq.${event.eventId}`) {
      reads.push(url.pathname);
      return res.end(JSON.stringify([{ id: event.eventId, status: 'approved', archived: false, type: 'external',
        start_date: '2026-10-22', end_date: '2026-10-24', mode: 'hybrid', location: 'G.L. Bajaj Mathura',
        min_team_size: 1, max_team_size: 2, website_url: event.registrationUrl }]));
    }
    evidence.unexpectedRequests.push({ method: req.method, pathname: url.pathname });
    res.statusCode = 403;
    res.end('{}');
  });
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/SUPABASE|DATABASE_URL|RESEND|SENTRY|VERCEL|HUSTLE|TOKEN|SECRET|API_KEY|NEXT_PUBLIC_GA|POSTHOG/.test(key)) delete env[key];
  Object.assign(env, { NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: dbOrigin,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'partnership-offline-fixture', HUSTLE_PHASE2_ENABLED: 'false',
    HUSTLE_PHASE2_RELEASE_APPROVED: 'false', NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fonts });
  let next, browser;
  const log = fs.createWriteStream(path.join(out, 'next-development.txt'));
  try {
    await new Promise(resolve => stub.listen(dbPort, '127.0.0.1', resolve));
    next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '-H', '127.0.0.1', '-p', String(port)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    next.stdout.pipe(log); next.stderr.pipe(log);
    for (let n = 0; n < 180; n++) {
      if (next.exitCode !== null) throw Error('Local Next server exited; see next-development.txt');
      try { if ((await fetch(origin + portal + '/workshops')).ok) break; } catch { /* wait for local server */ }
      if (n === 179) throw Error('Local Next server readiness timeout');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true });
    for (const width of [1440, 768, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 1100 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin && ['GET', 'HEAD'].includes(route.request().method())) return route.continue();
        evidence.blockedExternalOrigins.push(url.origin);
        return route.abort();
      });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date('2026-10-24T15:00:00+05:30'));
      page.on('pageerror', error => evidence.pageErrors.push(error.message));
      const dashboardResponse = await page.goto(origin + '/dev/v2/dashboard', { waitUntil: 'domcontentloaded', timeout: 90000 });
      check(dashboardResponse.status() === 200, 'Existing dashboard fixture route returns 200');
      const banner = page.getByRole('region', { name: 'Hustle Carnival 2026' });
      await banner.waitFor({ timeout: 60000 });
      check(await banner.getByRole('link', { name: 'Explore the carnival' }).getAttribute('href') === portal, 'Dashboard public portal destination');
      check(await banner.getByRole('link', { name: 'Explore public workshops' }).getAttribute('href') === portal + '/workshops', 'Dashboard public workshop destination');
      check(await banner.getByText('Both rounds free').isVisible(), 'Free participation visible');
      check(await banner.getByText(/Private invitations follow verification/).isVisible(), 'Shortlist-dependent invitations explained');
      check(await page.locator('a[href*="/phase-2"]').count() === 0, 'No private Round 2 entry point');
      const primary = page.locator('nav[aria-label="Primary"]:visible');
      check(await primary.count() === 1, 'Only one primary navigation visible');
      check(await primary.locator('a').count() === (width >= 768 ? 6 : 5), 'Six desktop destinations / five mobile tabs preserved');
      for (const link of await banner.locator('a').all()) {
        await link.focus();
        check(await link.evaluate(el => getComputedStyle(el).outlineStyle !== 'none'), 'Visible banner keyboard focus');
        check((await link.boundingBox()).height >= 44, '44px banner links');
      }
      await page.locator('#hm-scroll').evaluate(el => { el.scrollTop = 0; });
      check(await banner.evaluate(el => el.scrollWidth <= el.clientWidth), 'Banner content does not overflow');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Dashboard has no page overflow');
      await page.evaluate(axe.source);
      const scan = await page.evaluate(() => axe.run('section[aria-labelledby="hustle-partnership-title"]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
      check(scan.violations.length === 0, 'Banner axe violations: ' + JSON.stringify(scan.violations.map(v => v.id)));
      await page.screenshot({ path: path.join(out, `dashboard-${width}.png`) });
      evidence.screens.push({ screen: 'dashboard', width, axeViolations: scan.violations.length });
      // Exercise the real Next Link from the existing fixture dashboard to both public routes.
      await banner.getByRole('link', { name: 'Explore the carnival' }).click();
      await page.waitForURL(origin + portal);
      const nav = page.getByRole('navigation', { name: 'Carnival navigation' });
      await nav.waitFor();
      check(await nav.getByRole('link', { name: 'Public workshops' }).isVisible(), 'Workshop navigation remains visible on mobile and desktop');
      check(await nav.getByRole('link', { name: 'The journey' }).isVisible(), 'Journey navigation retained');
      check(await page.getByText(/Both rounds are free\. Registration closes/).isVisible(), 'Portal states both rounds are free');
      check(await page.locator('a[href*="?tab="], a[href*="/phase-2"]').count() === 0, 'Correct public metadata cannot enable private participation');
      await page.keyboard.press('Tab');
      await nav.getByRole('link', { name: 'Public workshops' }).focus();
      check(await nav.getByRole('link', { name: 'Public workshops' }).evaluate(el => getComputedStyle(el).outlineStyle !== 'none'), 'Portal workshop link keyboard focus');
      await page.evaluate(axe.source);
      const portalScan = await page.evaluate(() => axe.run('main', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
      check(portalScan.violations.length === 0, 'Portal axe violations: ' + JSON.stringify(portalScan.violations.map(v => v.id)));
      evidence.screens.push({ screen: 'portal', width, axeViolations: portalScan.violations.length });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Portal has no horizontal overflow');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, `portal-${width}.png`) });
      await nav.getByRole('link', { name: 'Public workshops' }).click();
      await page.waitForURL(origin + portal + '/workshops');
      await page.getByRole('heading', { name: 'Introduction to AI Tools', exact: true }).waitFor();
      check(await page.locator('main article').count() === 2, 'Two actual workshop cards');
      check(await page.locator('main time[datetime="2026-10-24T14:00:00+05:30"]').textContent() === '2:00 PM', 'Confirmed workshop start time');
      for (const card of await page.locator('main article').all()) check((await card.textContent()).includes('2:00 PM–4:00 PM IST'), 'Workshop card uses confirmed schedule');
      check(await page.locator('main button:disabled').count() === 4, 'Missing organizer URLs stay disabled');
      check(await page.locator('main form, main input, main iframe').count() === 0, 'No workshop registration or certificate collection');
      check(!(await page.locator('main').textContent()).includes('2:20'), 'No stale workshop time');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Workshop has no horizontal overflow');
      await page.evaluate(axe.source);
      const workshopScan = await page.evaluate(() => axe.run('main', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
      check(workshopScan.violations.length === 0, 'Workshop axe violations: ' + JSON.stringify(workshopScan.violations.map(v => v.id)));
      evidence.screens.push({ screen: 'workshops', width, axeViolations: workshopScan.violations.length });
      await page.screenshot({ path: path.join(out, `workshops-${width}.png`) });
      await page.getByRole('link', { name: 'Carnival portal', exact: true }).click();
      await page.waitForURL(origin + portal);
      await nav.waitFor();
      check(await nav.isVisible(), 'Workshop returns to portal');
      await page.goto(origin + '/dev/v2/dashboard?theme=light');
      await banner.waitFor();
      check(await page.locator('html').evaluate(el => el.classList.contains('light')), 'Existing light theme remains available');
      if (width === 1440) await page.screenshot({ path: path.join(out, 'dashboard-light-1440.png') });
      await banner.getByRole('link', { name: 'Explore public workshops' }).click();
      await page.waitForURL(origin + portal + '/workshops');
      await page.getByRole('heading', { name: 'Introduction to AI Tools', exact: true }).waitFor();
      check(await page.locator('main article').count() === 2, 'Dashboard workshop link navigates directly');
      await page.clock.setFixedTime(new Date('2026-10-25T00:00:00+05:30'));
      await page.goto(origin + '/dev/v2/dashboard');
      await page.locator('#needs-you').waitFor();
      check(await banner.count() === 0, 'Banner absent at the exact IST expiry');
      check(await page.locator('nav[aria-label="Primary"]:visible a').count() === (width >= 768 ? 6 : 5), 'App navigation remains available after banner expiry');
      const portalAfterExpiry = await page.goto(origin + portal);
      await nav.waitFor();
      check(portalAfterExpiry.status() === 200, 'Public portal remains available after banner expiry');
      await nav.getByRole('link', { name: 'Public workshops' }).click();
      await page.getByRole('heading', { name: 'Introduction to AI Tools', exact: true }).waitFor();
      check(await page.locator('main article').count() === 2, 'Public workshops remain available after banner expiry');
      await context.close();
    }
    // Existing real authenticated route still redirects a verified guest; no auth stubs are bypassed.
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin && ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(origin + '/dashboard');
    await page.waitForURL(/\/login\?next=/, { timeout: 60000 });
    check(page.url().includes('next=%2Fdashboard'), 'Guest dashboard authentication redirect preserved');
    await context.close();
    const before = reads.length;
    for (const route of [portal + '/phase-2', portal + '/phase-2/invite', '/api' + portal + '/phase-2/organizer']) {
      const response = await fetch(origin + route);
      check(response.status === (route.startsWith('/api') ? 503 : 200), 'Disabled Round 2 status');
      check((await response.text()).includes('not available yet'), 'Disabled Round 2 unavailable copy');
      check(response.headers.get('cache-control').includes('no-store'), 'Private disabled response not cached');
    }
    check(reads.length === before, 'Disabled Round 2 makes no database requests');
    check(evidence.pageErrors.length === 0, 'No page errors: ' + JSON.stringify(evidence.pageErrors));
    check(evidence.unexpectedRequests.length === 0, 'Only the public event metadata was read');
    fs.writeFileSync(path.join(out, 'browser-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(`PASS: ${evidence.checks} partnership browser checks at 1440/768/390/320px; zero scoped axe violations or page errors; synthetic data only.`);
  } finally {
    if (browser) await browser.close();
    if (next && next.exitCode === null) {
      const closed = new Promise(resolve => next.once('close', resolve));
      next.kill(); await closed;
    }
    log.end();
    await new Promise(resolve => stub.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
