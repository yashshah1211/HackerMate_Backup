/* eslint-disable @typescript-eslint/no-require-imports -- Actual local Next UI and offline synthetic email preview. */
// Start Next on 127.0.0.1:4307 with ONLY the synthetic settings documented in docs/hustle-communications-pr-c.md.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const axe = require('axe-core');
const { ROOT, load } = require('./hustle-communications-harness.cjs');
const templates = load('src/lib/hustle-communications/templates.ts', { env: { NEXT_PUBLIC_SITE_URL: 'https://example.invalid' } });
const { COMMUNICATION_EVENT_ID } = load('src/lib/hustle-communications/contracts.ts');
const now = Date.parse('2026-10-22T12:00:00Z');
const email = templates.prepareInvitationEmail({ eventId: COMMUNICATION_EVENT_ID, teamId: '11111111-1111-4111-8111-111111111111', teamName: 'Synthetic Orbit', leaderName: 'Synthetic Leader', email: 'leader@example.invalid', whatsapp: null, activeShortlist: true, registration: 'pending', checkedAt: new Date(now).toISOString() }, { confirmationUrl: 'https://example.invalid/opaque-pr-a-fixture', expiresAt: '2026-10-23T17:30:00Z' }, { organizerApproved: true, version: 'round2-invitation-v1', allowedOrigins: ['https://example.invalid'] }, 'noreply@example.invalid', now);
const output = path.resolve(process.env.HUSTLE_COMMS_QA_OUTPUT || path.join(ROOT, 'work/communications-qa'));
const origin = 'http://127.0.0.1:4307';
const emailOrigin = 'http://127.0.0.1:4308';
const server = http.createServer((req, res) => {
  if (req.url !== '/email') { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(email.html);
});
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(4308, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true });
  const evidence = { checks: 0, viewports: [], pageErrors: [], blockedRequests: [] };
  const check = (condition, label) => { assert(condition, label); evidence.checks++; };
  try {
    for (const width of [1440, 768, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.route('**/*', route => {
        const req = route.request(); const url = new URL(req.url());
        if ([origin, emailOrigin].includes(url.origin) && ['GET', 'HEAD'].includes(req.method())) return route.continue();
        evidence.blockedRequests.push(url.origin + url.pathname); return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', error => evidence.pageErrors.push({ width, url: page.url(), message: error.message, stack: error.stack }));
      const response = await page.goto(origin + '/dev/hustle-communications', { waitUntil: 'networkidle', timeout: 120000 });
      check(response.status() === 200, 'Development-only fixture returns 200');
      await page.getByRole('heading', { name: /Keep every leader/ }).waitFor();
      check(await page.getByText('Synthetic preview', { exact: true }).isVisible(), 'Fixture is clearly labelled');
      check(await page.locator('main tbody tr').count() === 6, 'Synthetic roster rendered');
      check(await page.locator('main button:disabled').count() === 2, 'All communication actions disabled');
      check(await page.locator('main a[href*="wa.me"], main form, main input, main iframe').count() === 0, 'No real contact links, messaging forms or embeds');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No page-level horizontal overflow');
      const skip = page.getByRole('link', { name: 'Skip to communication roster' });
      await skip.focus(); check(await skip.isVisible(), 'Skip link visible with keyboard'); await page.keyboard.press('Enter');
      check(await page.locator('#communications-content').evaluate(el => el === document.activeElement), 'Skip moves focus');
      const scroll = page.getByRole('region', { name: /Communication roster, horizontally scrollable/ });
      await scroll.focus(); check(await scroll.evaluate(el => getComputedStyle(el).outlineStyle !== 'none'), 'Roster has keyboard focus indicator');
      if (width < 1020) { await page.keyboard.press('End'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120); check(await scroll.evaluate(el => el.scrollWidth > el.clientWidth && el.scrollLeft > 0), 'Mobile roster scrolls with keyboard'); }
      const faq = page.getByText('How should an organizer follow up safely?', { exact: true });
      await faq.focus(); await page.keyboard.press('Enter');
      check(await page.getByText(/Phone syntax does not prove contact ownership/).isVisible(), 'Manual workflow expands with keyboard');
      check(await faq.evaluate(el => getComputedStyle(el).outlineStyle !== 'none'), 'FAQ focus visible');
      await page.keyboard.press('Enter');
      for (const element of await page.locator('main button, main summary').all()) check((await element.boundingBox()).height >= 44, '44px control heights');
      await page.evaluate(axe.source);
      const scan = await page.evaluate(() => axe.run('main', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
      fs.writeFileSync(path.join(output, `axe-${width}.json`), JSON.stringify({ violations: scan.violations, incomplete: scan.incomplete, passes: scan.passes.length }, null, 2));
      check(scan.violations.length === 0, JSON.stringify(scan.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, `dashboard-${width}.png`), fullPage: true });
      await page.goto(emailOrigin + '/email');
      check(await page.getByRole('heading', { name: 'You’re through to Round 2.' }).isVisible(), 'Co-branded email renders');
      check(await page.getByRole('link', { name: /Confirm or decline securely/ }).getAttribute('href') === 'https://example.invalid/opaque-pr-a-fixture', 'Synthetic private URL preserved');
      check(await page.locator('script, img, iframe').count() === 0, 'Email has no trackers/scripts/remote assets');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Email has no horizontal overflow');
      await page.screenshot({ path: path.join(output, `email-${width}.png`), fullPage: true });
      evidence.viewports.push({ width, axeViolations: scan.violations.length });
      console.log(`Verified ${width}px dashboard and email fixture.`);
      await context.close();
    }
    check(evidence.pageErrors.length === 0, JSON.stringify(evidence.pageErrors));
    fs.writeFileSync(path.join(output, 'browser-evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(`PASS: ${evidence.checks} browser checks; four viewports, zero dashboard axe violations/page errors; no real contacts or writes.`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.message); server.close(); process.exitCode = 1; });
