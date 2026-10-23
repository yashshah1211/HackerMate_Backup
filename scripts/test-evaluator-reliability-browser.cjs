/* eslint-disable @typescript-eslint/no-require-imports -- Existing esbuild/Edge/loopback tooling, no live services. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync, statSync } = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const { build } = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium, expect } = require('@playwright/test');
const ROOT = path.resolve(__dirname, '..'), evidence = path.join(ROOT, 'docs/qa/evaluator-reliability');
const USER_A = '00000000-0000-4000-8000-000000000001', USER_B = '00000000-0000-4000-8000-000000000002';
const result = { trackId: 'generic', totalScore: 72, grade: 'Strong Contender ✅', subScores: { novelty: 18, tech: 18, uiUxOrFeasibility: 18, impactOrTeam: 18 },
  categoryLabels: { novelty: 'Problem clarity', tech: 'Architecture', uiUxOrFeasibility: 'Impact', impactOrTeam: 'Communication' },
  strengths: [], redFlags: ['Validation is planned, not measured.'], architectureSuggestions: ['Test the held-out examples.'], recommendedRoles: [], usedAiEngine: true,
  evaluationTimestamp: '2026-10-23T12:00:00Z', evaluationMetadata: { schemaVersion: 'evaluator-v1', rubricVersion: 'idea-v1', mode: 'text_only', trackId: 'generic', attempts: 1, providerAttempts: [], evidence: {} } };
const legacy = { ...result, totalScore: 42, grade: 'Needs Iteration ⚠️', subScores: { novelty: 10, tech: 12, uiUxOrFeasibility: 10, impactOrTeam: 10 }, usedAiEngine: false, evaluationMetadata: undefined, fallbackReason: 'gemini_api_error' };
const adapters = {
  'next/link': `import React from 'react';export default function Link({href,children,...props}){return <a {...props} href={href}>{children}</a>}`,
  'next/navigation': `export const useSearchParams=()=>new URLSearchParams(location.search);`,
  '@/lib/supabase': `
    const params=new URLSearchParams(location.search);let actor=params.has('guest')?null:{id:'${USER_A}',email:'fixture@example.invalid'};
    const callbacks=new Set();const session=()=>actor?{user:actor,access_token:'offline-token-'+actor.id}:null;
    let rejectInitial;const pending=new Promise((_resolve,reject)=>{rejectInitial=reject});
    window.__qa={failInitial(){rejectInitial(Error('Old initial identity failure'))},switchUser(id){actor=id?{id,email:'fixture@example.invalid'}:null;for(const cb of callbacks)cb('SIGNED_IN',session())}};
    export const supabase={auth:{getUser:()=>params.has('initial-auth-reject')?pending:Promise.resolve({data:{user:actor},error:null}),getSession:async()=>({data:{session:session()},error:null}),
      onAuthStateChange(cb){callbacks.add(cb);queueMicrotask(()=>{if(callbacks.has(cb))cb('INITIAL_SESSION',session())});return{data:{subscription:{unsubscribe(){callbacks.delete(cb)}}}}}},
      from(table){const q={select(){return this},eq(){return this},order(){return this},then(resolve,reject){if(!['team_members','hackathons'].includes(table))throw Error('Unexpected fixture table');return Promise.resolve({data:[],error:null}).then(resolve,reject)}};return q;}};`,
};
async function bundle() {
  const output = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Pitch from'@/components/PitchEvaluatorClient';createRoot(document.getElementById('root')).render(<React.StrictMode><Pitch initialTrack="generic"/></React.StrictMode>);`, loader: 'tsx', resolveDir: ROOT }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'offline-evaluator', setup(builder) {
      builder.onResolve({ filter: /^(@\/|next\/)/ }, args => {
        if (adapters[args.path]) return { path: args.path, namespace: 'fixture' };
        const target = path.join(ROOT, 'src', args.path.slice(2));
        const file = [target, target + '.ts', target + '.tsx', target + '/index.ts'].find(f => existsSync(f) && statSync(f).isFile());
        assert(file, 'Unresolved source: ' + args.path); return { path: file };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: adapters[args.path], loader: 'tsx', resolveDir: ROOT }));
    } }] });
  return output.outputFiles[0].text;
}
(async () => {
  await fs.mkdir(evidence, { recursive: true });
  const javascript = await bundle();
  const css = (await postcss([tailwind()]).process(await fs.readFile(path.join(ROOT, 'src/app/globals.css'), 'utf8'), { from: path.join(ROOT, 'src/app/globals.css') })).css;
  const server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('content-type', 'text/javascript'); return res.end(javascript); }
    if (req.url === '/app.css') { res.setHeader('content-type', 'text/css'); return res.end(css); }
    if (req.url.startsWith('/api/')) { res.statusCode = 500; return res.end('Unexpected unmocked API request'); }
    res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>:root{--font-ui:Arial;--font-display-face:Arial;--font-code:monospace}*{animation:none!important;transition:none!important}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  let browser; const checks = [], external = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch(process.env.QA_CHROMIUM_PATH ? { executablePath: process.env.QA_CHROMIUM_PATH, headless: true } : process.platform === 'win32' ? { channel: 'msedge', headless: true } : { headless: true });
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
      let mode = 'failure', showLegacy = false, legacyTrack = 'generic', legacyAI = false, release, started; const posts = [], errors = [];
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
        if (url.pathname === '/api/evaluator/history') return route.fulfill({ json: { success: true, history: showLegacy ? [{ id: 'legacy-fixture', ps_title: 'Legacy proposal', created_at: '2026-10-01', track_id: legacyTrack || undefined, total_score: 42, grade: legacy.grade, evaluation_result: { ...legacy, usedAiEngine: legacyAI, trackId: legacyTrack || undefined } }] : [] } });
        if (url.pathname === '/api/evaluator/evaluate') {
          posts.push({ headers: request.headers(), body: request.postDataJSON() });
          if (mode === 'lost') return route.abort();
          if (mode === 'deferred') { started = true; await new Promise(resolve => { release = resolve; }); }
          const success = mode === 'success' || mode === 'deferred';
          return route.fulfill({ status: success ? 200 : ['duplicate', 'cooldown'].includes(mode) ? 409 : 503, json: success ? { success: true, result, persistence: 'saved', savedEvaluationId: '00000000-0000-4000-8000-000000000003' } : { success: false, result: null, requestId: '00000000-0000-4000-8000-000000000004', retryable: true, code: mode === 'duplicate' ? 'duplicate_request' : mode === 'cooldown' ? 'cooldown' : 'provider_unavailable', error: 'AI evaluation is unavailable. No score was generated.' } }).catch(() => {});
        }
        return route.continue();
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      const fill = async (title = 'Offline proposal') => { await page.getByLabel('Project or pitch title').fill(title); await page.getByLabel('Problem and proposed solution').fill('We propose a classifier with a held-out validation set.'); };
      const submit = () => page.locator('button[type=submit]').click();
      await page.goto(origin + '/tools/pitch-evaluator'); await expect(page.locator('button[type=submit]')).toBeEnabled(); await fill();
      await submit(); await expect(page.getByRole('alert')).toContainText('No score was generated'); await expect(page.getByRole('heading', { name: 'Offline proposal', exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Project or pitch title')).toHaveValue('Offline proposal'); await expect(page.getByRole('button', { name: 'Copy summary' })).toHaveCount(0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 390) await page.screenshot({ path: path.join(evidence, 'idea-failure-390.png'), fullPage: true });
      mode = 'lost'; await submit(); await expect(page.getByRole('alert')).toContainText('retry token are preserved'); const lostToken = posts.at(-1).headers['idempotency-key'];
      mode = 'cooldown'; await submit(); await expect(page.getByRole('alert')).toContainText('No score was generated'); assert.equal(posts.at(-1).headers['idempotency-key'], lostToken);
      mode = 'duplicate'; await submit(); await expect(page.getByRole('alert')).toContainText('No score was generated'); assert.equal(posts.at(-1).headers['idempotency-key'], lostToken);
      mode = 'success'; await submit(); await expect(page.getByRole('heading', { name: 'Offline proposal', exact: true })).toBeVisible(); await expect(page.getByText('AI · Text only', { exact: true })).toBeVisible(); assert.notEqual(posts.at(-1).headers['idempotency-key'], lostToken);
      assert(posts.every(p => p.headers.authorization === `Bearer offline-token-${USER_A}` && !Object.hasOwn(p.body, 'userId')));
      await page.getByLabel('Project or pitch title').fill('Edited proposal'); await expect(page.getByRole('button', { name: 'Copy summary' })).toHaveCount(0);
      mode = 'deferred'; started = false; await fill('Account A private proposal'); await submit(); await expect.poll(() => started).toBe(true);
      await expect(page.getByLabel('Project or pitch title')).toBeDisabled(); await expect(page.getByText(/Step \d of/)).toHaveCount(0);
      await page.evaluate(id => window.__qa.switchUser(id), USER_B); await expect(page.getByLabel('Project or pitch title')).toHaveValue(''); release();
      await expect(page.locator('button[type=submit]')).toBeEnabled(); await expect(page.getByText('Account A private proposal', { exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Copy summary' })).toHaveCount(0);
      mode = 'success'; await fill('Account B proposal'); await submit(); await expect(page.getByRole('heading', { name: 'Account B proposal', exact: true })).toBeVisible(); assert.equal(posts.at(-1).headers.authorization, `Bearer offline-token-${USER_B}`);
      showLegacy = true; await page.goto(origin + '/tools/pitch-evaluator'); await expect(page.locator('button[type=submit]')).toBeEnabled();
      await page.getByRole('button', { name: /History/ }).click(); await page.getByText('Legacy proposal', { exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByText('Legacy heuristic check', { exact: true })).toBeVisible(); await expect(page.getByText(/Historical score;/)).toBeVisible();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 1440) await page.screenshot({ path: path.join(evidence, 'legacy-mode-1440.png'), fullPage: true });
      legacyTrack = null; legacyAI = true; await page.goto(origin + '/tools/pitch-evaluator'); await expect(page.locator('button[type=submit]')).toBeEnabled();
      await page.getByRole('button', { name: /History/ }).click(); await expect(page.getByText('Unknown historical rubric', { exact: true })).toBeVisible(); await page.getByText('Legacy proposal', { exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByText('Historical rubric unknown', { exact: true })).toBeVisible(); await expect(page.getByText('Legacy AI · mode unrecorded', { exact: true })).toBeVisible();
      await page.goto(origin + '/tools/pitch-evaluator?initial-auth-reject=1'); await expect(page.locator('button[type=submit]')).toBeEnabled();
      await page.evaluate(id => { window.__qa.switchUser(id); window.__qa.failInitial(); }, USER_B); await expect(page.getByRole('alert')).toHaveCount(0); await expect(page.locator('button[type=submit]')).toBeEnabled();
      showLegacy = false; await page.goto(origin + '/tools/pitch-evaluator?engine=heuristic'); await expect(page.locator('button[type=submit]')).toBeEnabled(); await fill(); const before = posts.length;
      await submit(); await expect(page.getByRole('alert')).toContainText('Heuristic scoring is retired'); assert.equal(posts.length, before); await expect(page.getByRole('link', { name: 'Open AI evaluation' })).toHaveAttribute('href', '/tools/pitch-evaluator');
      assert.deepEqual(errors, []);
      checks.push({ width, passed: ['no new score/share on failure', 'draft retained', 'uncertain network and cooldown retain retry token', 'confirmed terminal response permits later explicit token', 'Bearer identity without body userId', 'edited inputs invalidate scorecard', 'account switch discards stale response and private draft', 'new identity used on next explicit request', 'legacy heuristic readable and labelled', 'unknown historical rubric and AI mode never guessed', 'stale initial Auth error ignored after identity switch', 'forced heuristic retired', 'no simulated stage claims', 'no horizontal overflow'] });
      await context.close();
    }
    assert.deepEqual(external, []);
    const file = path.join(evidence, 'results.json'), record = JSON.parse(await fs.readFile(file, 'utf8'));
    record.validation.ideaBrowser = { status: 'passed', checks, externalRequests: 0, liveDatabaseWrites: 0, limitations: 'Actual Idea component/CSS with synthetic Auth/read/API adapters; no live Auth/RLS/provider or production evidence. PPT/Challenge browser work remains pending.' };
    await fs.writeFile(file, JSON.stringify(record, null, 2) + '\n');
    console.log('Idea browser checks passed at 390 and 1440px, including stale-account and uncertain-response regressions.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
