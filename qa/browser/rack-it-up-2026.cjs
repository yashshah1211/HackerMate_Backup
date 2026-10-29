// Founder-approved local synthetic browser acceptance. No HTTP server or live data.
(async () => {
  const { default: assert } = await import('node:assert/strict');
  const { default: fs } = await import('node:fs');
  const { default: path } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { chromium } = await import('@playwright/test');
  const root = process.cwd(), directory = path.join(root, 'scratch/rack-it-up-preview');
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'TEMP', 'TMP', 'COMSPEC', 'NODE_OPTIONS']) if (process.env[key]) env[key] = process.env[key];
  const generated = spawnSync(process.execPath, ['scripts/test-rack-it-up-2026.cjs', '--preview'], { env, stdio: 'inherit', timeout: 30000 });
  if (generated.status !== 0) throw Error('Synthetic preview generation failed');
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, env,
    ...(process.platform === 'linux' ? { channel: 'chrome' } : {}),
    args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
  console.log('QUALIFICATION_BROWSER=' + browser.version());
  const results = [], requests = [];
  const check = async (name, fn) => { try { await fn(); results.push({ name, pass: true }); } catch (error) { results.push({ name, pass: false, error: error.message }); } };
  const official = 'https://unstop.com/hackathons/rack-it-up-2026-48-hour-online-hackathon-by-rackem-karma-enterprises-1777639';
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      await context.route('**/*', route => { requests.push(route.request().url()); return route.abort('blockedbyclient'); });
      const page = await context.newPage();
      try {
        await page.setContent(fs.readFileSync(path.join(directory, 'active.html'), 'utf8'));
        await check(width + ': event identity', async () => assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Rack It Up 2026'));
        await check(width + ': distinct correct CTAs', async () => {
          assert.equal(await page.getByRole('link', { name: 'Find teammates', exact: true }).getAttribute('href'), '/hackathons/00000000-0000-4000-8000-000000000006?tab=looking_for_teams');
          const registration = page.getByRole('link', { name: /Register on Unstop/ });
          assert.equal(await registration.getAttribute('href'), official); assert.equal(await registration.getAttribute('target'), '_blank');
          assert.equal(await registration.getAttribute('rel'), 'noopener noreferrer');
        });
        await check(width + ': no horizontal overflow', async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)));
        await check(width + ': responsive facts grid', async () => assert.equal(await page.locator('dl').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), width < 600 ? 2 : 4));
        await check(width + ': accessible facts and landmarks', async () => {
          assert.equal(await page.getByRole('main').count(), 1); assert.equal(await page.locator('dl dt').count(), 8);
          assert.equal(await page.locator('time[datetime="2026-12-09T23:59:00+05:30"]').count(), 1);
        });
        await check(width + ': keyboard focus reaches both CTAs', async () => {
          await page.keyboard.press('Tab'); assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'HackerMate home');
          await page.keyboard.press('Tab'); assert.equal(await page.locator(':focus').textContent(), 'Find teammates');
          assert.equal(await page.locator(':focus').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
          await page.keyboard.press('Tab'); assert((await page.locator(':focus').textContent()).includes('Register on Unstop'));
        });
        await page.screenshot({ path: path.join(directory, 'rack-' + width + '.png'), fullPage: true });
        await page.setContent(fs.readFileSync(path.join(directory, 'pending.html'), 'utf8'));
        await check(width + ': missing event never targets a generic event', async () => {
          assert.equal(await page.getByRole('link', { name: 'Find teammates', exact: true }).count(), 0);
          assert.equal(await page.locator('a[href^="/hackathons/"]').count(), 0);
          assert(await page.getByText(/Teammate matching is not available yet/).isVisible());
        });
        await check(width + ': missing event retains official registration', async () => assert.equal(await page.getByRole('link', { name: /Register on Unstop/ }).getAttribute('href'), official));
      } finally { await context.close(); }
    }
    await check('zero external requests', () => assert.deepEqual(requests, []));
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(directory, 'browser-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results }));
  if (results.some(r => !r.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
