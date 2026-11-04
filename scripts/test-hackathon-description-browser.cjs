/* eslint-disable @typescript-eslint/no-require-imports -- Actual page components, offline transport and denied network/writes. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require('@playwright/test');
const fixtures = require('../qa/fixtures/descriptions/cases.cjs');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/evidence/hackathon-description');
const BASE = 'http://fixture.invalid';
const ID = '00000000-0000-4000-8000-000000000002';
const words = value => value.match(/[\p{L}\p{N}]+/gu) || [];
let prepared;
async function assets() {
  const adapter = path.join(ROOT, 'qa/fixtures/description-browser.jsx');
  const bundle = await esbuild.build({
    stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Detail from './src/app/hackathons/[id]/page';import{parseHackathonDescription,descriptionText}from'./src/lib/hackathons/description';window.descriptionModel={parseHackathonDescription,descriptionText};createRoot(document.getElementById('root')).render(<Detail/>);`, resolveDir: ROOT, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'isolated-description-transport', setup(build) {
      build.onResolve({ filter: /^(next\/(link|navigation)|@\/lib\/supabase|@\/context\/NotificationContext)$/ }, () => ({ path: adapter }));
    } }],
  });
  const css = await postcss([tailwind()]).process(fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), { from: path.join(ROOT, 'src/app/globals.css') });
  return { js: bundle.outputFiles[0].text, css: css.css + '\nhtml{--font-ui:Arial;--font-display-face:Arial;--font-code:monospace}' };
}

for (const width of [390, 768, 1440]) for (const theme of ['dark', 'light']) {
  test(`organizer guide on real public/member pages: ${width}px ${theme}`, { timeout: 120000 }, async () => {
    prepared ||= assets();
    const { js, css } = await prepared;
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND'] });
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const unexpected = [], errors = [], consoleErrors = [];
    try {
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== BASE || !['GET', 'HEAD'].includes(request.method())) { unexpected.push(url.origin + ':' + request.method()); return route.abort(); }
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: js });
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css });
        if (request.resourceType() !== 'document') { unexpected.push(url.pathname); return route.abort(); }
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="${theme}" lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>` });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      await page.clock.install({ time: new Date('2026-11-04T12:00:00+05:30') });
      for (const role of ['guest', 'member']) for (const [name, fixture] of Object.entries(fixtures)) {
        const query = `?role=${role}&description=${name}${name === 'rack' ? '&tab=looking_for_teams' : ''}`;
        await page.goto(`${BASE}/hackathons/${ID}${query}`);
        await page.getByRole('heading', { name: fixture.name, exact: true }).waitFor();
        const about = page.locator('section').filter({ has: page.getByRole('heading', { name: 'About this hackathon', exact: true }) });
        await about.waitFor();
        const guide = about.locator(':scope > div').first().locator(':scope > div').first();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${role}/${name}: no horizontal page overflow`);
        assert.equal(await page.evaluate(() => window.fixtureWrites.length), 0);
        if (role === 'guest') assert(await page.evaluate(() => window.fixtureReads.every(read => read.table === 'hackathons')), 'guest reads remain public only');
        assert.equal(await about.locator('script,img,iframe,object,embed').count(), 0, 'organizer markup is never mounted');
        assert.equal(await page.evaluate(() => window.organizerExecuted), undefined);
        const links = await about.locator('a').evaluateAll(nodes => nodes.map(node => ({ href: node.href, rel: node.rel, target: node.target })));
        for (const link of links) { const url = new URL(link.href); assert(['http:', 'https:'].includes(url.protocol)); assert.equal(url.username, ''); assert.equal(url.password, ''); assert.equal(link.target, '_blank'); assert.match(link.rel, /noopener/); assert.match(link.rel, /noreferrer/); }

        if (name === 'nasa') {
          const literal = await guide.evaluate(node => {
            const clone = node.cloneNode(true); clone.querySelectorAll('.sr-only').forEach(n => n.remove()); return clone.textContent;
          });
          const expected = await page.evaluate(raw => window.descriptionModel.descriptionText(raw), fixture.description);
          // textContent joins adjacent block text; add spaces via the DOM walker.
          const visibleWords = await guide.evaluate(node => {
            const clone = node.cloneNode(true); clone.querySelectorAll('.sr-only').forEach(n => n.remove());
            clone.querySelectorAll('p,h3,dt,dd,li').forEach(n => n.append(' ')); return clone.textContent;
          });
          assert.deepEqual(words(visibleWords), words(expected), 'all NASA words/numbers preserved in DOM order');
          assert(!/&(?:times|rarr|amp|ndash|ldquo|rdquo);/.test(literal));
          assert(await about.getByRole('heading', { name: 'Two Registrations Are Mandatory' }).isVisible());
          assert(await about.getByText(/Unstop registration alone is NOT sufficient/).isVisible());
          assert.equal(await about.locator('details:not([open])').count(), 0, 'no NASA instructions hidden');
          assert.equal(links.length, 3);
          await page.screenshot({ path: path.join(OUT, `nasa-${role}-${theme}-${width}.png`), fullPage: true });
          await about.screenshot({ path: path.join(OUT, `nasa-about-${role}-${theme}-${width}.png`) });
          assert(await page.getByRole('region', { name: 'Hackathon overview' }).isVisible());
          if (role === 'guest') {
            assert.equal(await page.getByRole('link', { name: 'View official event site', exact: true }).getAttribute('href'), fixture.website_url);
            const signIn = page.getByRole('link', { name: 'Sign in to participate', exact: true }).first();
            assert.equal(new URL(await signIn.getAttribute('href'), BASE).searchParams.get('next'), `/hackathons/${ID}${query}`);
          } else {
            assert(await page.getByRole('button', { name: 'Join community', exact: true }).isVisible());
            assert(await page.getByRole('button', { name: 'View official event site', exact: true }).first().isVisible());
          }
        }
        if (name === 'moderate') {
          assert.equal(await about.locator('ol li').count(), 2);
          assert.equal(await about.locator('ul li').count(), 2);
          assert.deepEqual(await about.locator('dt').allTextContents(), ['Dates', 'Venue']);
        }
        if (name === 'short' || name === 'empty' || name === 'malformed') {
          assert.equal(await about.locator('details').count(), 0);
          if (name === 'short') assert(await about.getByText(fixture.description, { exact: true }).isVisible());
          if (name === 'empty') assert(await about.getByText('The organizer hasn’t provided a detailed description yet.').isVisible());
          if (name === 'malformed') assert(await about.getByText('Eligibility is reviewed by the organizer, please ask questions.').isVisible());
        }
        if (name === 'entities') assert.equal(links.length, 2);
        if (name === 'entities') {
          const link = about.getByRole('link').first();
          await page.keyboard.press('Tab');
          await link.focus();
          assert(await link.evaluate(node => node.matches(':focus-visible')), 'keyboard focus is visible');
          // Chrome can expose the native outline until the next focus-style
          // recalculation. Wait for the actual author style, not a fixed delay.
          await page.waitForFunction(expected => {
            const node = document.activeElement;
            if (!node?.matches('a:focus-visible')) return false;
            const style = getComputedStyle(node);
            return style.outlineWidth === '2px' && style.outlineColor === expected;
          }, theme === 'light' ? 'rgb(61, 105, 10)' : 'rgb(180, 244, 97)', { timeout: 2000 });
          const outline = await link.evaluate(node => ({ width: getComputedStyle(node).outlineWidth, style: getComputedStyle(node).outlineStyle, color: getComputedStyle(node).outlineColor, focus: getComputedStyle(document.documentElement).getPropertyValue('--hm-focus').trim(), offset: getComputedStyle(node).outlineOffset, classes: node.className }));
          assert.equal(outline.width, '2px', JSON.stringify(outline));
          assert.equal(outline.color, theme === 'light' ? 'rgb(61, 105, 10)' : 'rgb(180, 244, 97)');
          await page.keyboard.press('Tab');
          assert(await about.getByRole('link').nth(1).evaluate(node => node === document.activeElement));
        }
        if (name === 'native') assert.deepEqual(await about.locator('ol li').evaluateAll(nodes => nodes.map(n => n.value)), [3, 7]);
        if (name === 'long') {
          const details = about.locator('details');
          assert.equal(await details.count(), 2);
          assert.equal(await about.locator('details[open]').count(), 0);
          for (const title of ['Registration', 'Eligibility', 'Important Notes']) assert(await about.getByRole('heading', { name: title, exact: true }).isVisible());
          assert(await about.getByText(/must complete both registrations/).isVisible());
          const summary = details.first().locator('summary');
          await summary.focus(); await page.keyboard.press('Enter');
          assert.equal(await details.first().getAttribute('open'), '');
          assert(await summary.evaluate(node => node === document.activeElement));
          await page.keyboard.press('Space'); assert.equal(await details.first().getAttribute('open'), null);
          await details.nth(1).locator('summary').click(); assert.equal(await details.nth(1).getAttribute('open'), '');
          assert.equal(await details.first().getAttribute('open'), null, 'disclosures are independent and preserve source positions');
          await page.screenshot({ path: path.join(OUT, `secondary-${role}-${theme}-${width}.png`), fullPage: true });
        }
        if (name === 'hiddenWarning') assert.equal(await about.locator('details').filter({ has: page.getByRole('heading', { name: 'Judging Criteria' }) }).count(), 0);
        if (name === 'rack') {
          if (role === 'guest') assert(await page.getByText('Find teammates for Rack It Up', { exact: true }).isVisible());
          assert(await about.getByText(/Joining this community does not register your team/).isVisible());
        }
      }
      assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(unexpected, []);
    } finally { await context.close(); await browser.close(); }
  });
}
