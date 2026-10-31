/* eslint-disable @typescript-eslint/no-require-imports -- Isolated real production route qualification. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium, expect } = require('@playwright/test');
const OUT = path.resolve('scratch/feature-retirement');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const removed = ['/evaluator', '/evaluator/legacy', '/tools/pitch-evaluator', '/challenges',
  '/challenges/synthetic', '/challenges/synthetic/submissions/synthetic',
  '/api/evaluator/evaluate', '/api/evaluator/history', '/api/challenges',
  '/api/challenges/leaderboard', '/api/challenges/synthetic', '/api/challenges/synthetic/evaluate',
  '/api/challenges/synthetic/submissions', '/api/challenges/synthetic/submissions/synthetic',
  '/api/admin/challenges', '/api/admin/challenges/synthetic'];
(async () => {
  assert.equal(process.env.EVALUATOR_GENERATION_ENABLED, 'false');
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'synthetic-anonymous');
  assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, '127.0.0.1');
  assert(process.env.NODE_OPTIONS?.includes('rack-network-guard.mjs'));
  fs.mkdirSync(OUT, { recursive: true });
  const buildCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env: process.env, stdio: 'inherit', timeout: 420000 });
    child.once('error', reject); child.once('exit', resolve);
  });
  assert.equal(buildCode, 0, 'Production build must pass before route checks');
  const manifests = JSON.parse(fs.readFileSync('.next/server/app-paths-manifest.json', 'utf8'));
  for (const route of Object.keys(manifests)) assert(!/^\/(?:api\/)?(?:admin\/)?(?:evaluator|challenges)(?:\/|$)|^\/tools\/pitch-evaluator\//.test(route), route);
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const origin = 'http://127.0.0.1:' + port;
  const log = fs.createWriteStream(path.join(OUT, 'server.log'));
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(log); server.stderr.pipe(log);
  let browser; const results = { routes: [], browsers: [] };
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      if (server.exitCode !== null) throw Error('Local server exited');
      try { const r = await fetch(origin, { signal: AbortSignal.timeout(1500) }); await r.body?.cancel(); if (r.ok) { ready = true; break; } } catch { /* bounded readiness */ }
      await delay(500);
    }
    assert(ready);
    for (const route of removed) for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await fetch(origin + route + '?legacy=synthetic', { method, redirect: 'manual', signal: AbortSignal.timeout(10000),
        ...(['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {}) });
      await response.arrayBuffer();
      results.routes.push({ route, method, status: response.status });
      // The preserved /api/admin namespace middleware denies guests before route lookup.
      // Absence from app-paths-manifest above independently proves no admin handler exists.
      assert.equal(response.status, route.startsWith('/api/admin/') ? 401 : 404, method + ' ' + route + ' must be unavailable');
    }
    const alias = await fetch(origin + '/tools/ppt-evaluator', { redirect: 'manual' });
    assert.equal(alias.status, 307); assert.equal(new URL(alias.headers.get('location'), origin).pathname, '/my-teams'); await alias.body?.cancel();
    browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const blocked = [];
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin || request.method() !== 'GET' || /^\/(?:api|auth|_vercel)\//.test(url.pathname)) {
          blocked.push({ method: request.method(), origin: url.origin, path: url.pathname }); return route.abort('blockedbyclient');
        }
        return route.continue();
      });
      const page = await context.newPage();
      try {
        const response = await page.goto(origin + '/challenges', { waitUntil: 'networkidle' });
        assert.equal(response.status(), 404);
        await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
        await expect(page.getByText('Error 404', { exact: true })).toBeVisible();
        assert.equal(await page.locator('a[href^="/challenges"], a[href^="/evaluator"], a[href^="/tools/pitch-evaluator"]').count(), 0);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(OUT, 'retired-404-' + width + '.png') });
        // Public discovery and Expo still resolve in the actual production server.
        for (const route of ['/leaderboard', '/hackathons', '/expo/printables/challenges', '/partners/rack-it-up-2026']) {
          const r = await page.goto(origin + route, { waitUntil: 'networkidle' });
          assert.equal(r.status(), 200, route);
          if (route.startsWith('/partners/')) {
            await page.screenshot({ path: path.join(OUT, 'partner-empty-' + width + '.png') });
            // Next streams the async missing-config page with HTTP 200. Check the
            // actual not-found UI and noindex, rather than treating 200 as a portal pass.
            await expect(page.getByRole('heading', { name: 'Partner event not found', exact: true })).toBeVisible();
            await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
            await expect(page.locator('main').getByRole('link', { name: 'Find teammates', exact: true })).toHaveCount(0);
          }
          assert.equal(await page.locator('a[href^="/challenges"], a[href^="/evaluator"], a[href^="/tools/pitch-evaluator"]').count(), 0);
        }
        results.browsers.push({ width, retired404: true, noRetiredLinks: true, preservedRoutes: true, blocked });
      } finally { await context.close(); }
    }
    console.log(JSON.stringify({ negativeRoutes: results.routes.length, browsers: results.browsers.length, standalonePptAlias: '/my-teams', syntheticOnly: true }));
  } finally {
    if (browser) await browser.close();
    server.kill(); await Promise.race([new Promise(resolve => server.once('exit', resolve)), delay(5000)]); log.end();
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
