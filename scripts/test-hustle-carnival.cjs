/* eslint-disable @typescript-eslint/no-require-imports -- Offline partner-route regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const { ROOT, load, event, fixture, renderPortal } = require('./hustle-carnival-harness.cjs');
const { hustleCommunityState } = load('src/lib/partners/hustleCarnival.ts');
const { resolveHustleCommunity, loadHustleCommunity } = load('src/lib/partners/hustleCarnivalPublic.ts');

test('exact approved corrected event enables existing discovery with the reviewed ID', async () => {
  const result = await renderPortal();
  const doc = new JSDOM(result.html).window.document;
  const link = doc.querySelector('a[href*="?tab="]');
  assert.equal(link.getAttribute('href'), `/hackathons/${event.eventId}?tab=looking_for_teams`);
  assert.equal(doc.querySelectorAll('a[href*="/hackathons/"]:not([href^="https://"])').length, 1);
  assert.equal(result.queries.length, 1);
  assert.equal(result.queries[0].columns, 'id,status,archived,type,start_date,end_date,mode,location,min_team_size,max_team_size,website_url');
  assert.deepEqual(JSON.parse(JSON.stringify(result.queries[0].filters)), [['id', event.eventId], ['status', 'approved'], ['archived', false]]);
});

test('stale production-like facts never reach portal copy or native team actions', async () => {
  const result = await renderPortal({ row: { name: 'UNTRUSTED EVENT NAME', start_date: '2026-10-12', end_date: '2026-10-22',
    mode: 'online', location: 'Venue in India', max_team_size: 4 } });
  const doc = new JSDOM(result.html).window.document;
  assert.match(doc.body.textContent, /Hybrid buildathon/);
  assert.match(doc.body.textContent, /1–2 members/);
  assert.match(doc.body.textContent, /Block A & B, G.L. Bajaj Group of Institutions, Mathura/);
  assert.match(doc.body.textContent, /awaiting an event details update/);
  assert(!/UNTRUSTED EVENT NAME|Venue in India|2026-10-12|1–4/.test(result.html));
  assert.equal(doc.querySelectorAll('a[href*="?tab="], a[href*="teams/create"]').length, 0);
  assert.equal(doc.querySelector('a[href="' + event.registrationUrl + '"]').target, '_blank');
});

for (const [field, value] of [['mode', 'online'], ['start_date', '2026-10-12'], ['end_date', '2026-10-22'],
  ['location', 'Venue in India'], ['max_team_size', 4], ['min_team_size', 2], ['website_url', 'javascript:alert(1)']]) {
  test(`unreviewed ${field} holds back participation link`, () => {
    assert.equal(hustleCommunityState(fixture({ row: { [field]: value } }).row), 'metadata-pending');
  });
}

for (const [name, options] of [['missing', { missing: true }], ['error', { error: { message: 'synthetic' } }],
  ['throws', { throws: true }], ['archived', { row: { archived: true } }], ['unapproved', { row: { status: 'pending' } }],
  ['foreign ID', { row: { id: '00000000-0000-4000-8000-000000000001' } }], ['internal', { row: { type: 'internal' } }]]) {
  test(`${name}: official facts persist; discovery fails closed`, async () => {
    const f = fixture(options);
    assert.equal(await resolveHustleCommunity(f.client), 'unavailable');
    const result = await renderPortal(options);
    assert.match(result.html, /Teammate discovery is temporarily unavailable/);
    assert.match(result.html, /Register on Unstop/);
    assert(!result.html.includes('?tab='));
  });
}

test('no public environment configuration returns unavailable without a real client', async () => {
  assert.equal(await loadHustleCommunity(), 'unavailable');
});

test('precise phase times, eligibility conflict, separation and safe official links', async () => {
  const { html, metadata } = await renderPortal();
  const doc = new JSDOM(html).window.document;
  for (const stamp of ['2026-10-22T14:00:00+05:30', '2026-10-23T10:00:00+05:30',
    '2026-10-23T23:00:00+05:30', '2026-10-24T09:20:00+05:30', '2026-10-24T16:30:00+05:30']) {
    assert(doc.querySelector(`time[datetime="${stamp}"]`));
  }
  assert.match(doc.body.textContent, /summary says “All”/);
  assert.match(doc.body.textContent, /as well as MBA students/);
  assert.match(doc.body.textContent, /Official registration is separate from HackerMate community participation/);
  assert.match(doc.body.textContent, /does not register you for the event or secure a finale place/);
  for (const link of doc.querySelectorAll('a[target="_blank"]')) {
    assert.equal(link.rel, 'noopener noreferrer');
    assert([event.registrationUrl, event.whatsappUrl].includes(link.href));
    assert.match(link.textContent, /opens in a new tab/);
  }
  assert.equal(doc.querySelectorAll('h1').length, 1);
  assert.equal(doc.querySelectorAll('details').length, 4);
  assert.equal(metadata.alternates.canonical, '/partners/hustle-carnival');
  assert.equal(metadata.robots.index, false);
  for (const image of doc.querySelectorAll('img')) {
    assert(image.alt.length > 20);
    assert(fs.existsSync(path.join(ROOT, 'public', image.src)));
  }
});

test('anonymous client stays sessionless and its reads have a timeout and no-store cache', async () => {
  const f = fixture();
  let options, request, timeoutMs;
  const signal = new AbortController().signal;
  const exports = {};
  const filename = path.join(ROOT, 'src/lib/partners/hustleCarnivalPublic.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture' } },
    AbortSignal: { timeout(ms) { timeoutMs = ms; return signal; } },
    fetch: async (input, init) => { request = { input, init }; return new Response('[]'); },
    require(name) {
      if (name === 'server-only') return {};
      if (name === 'react') return { cache: fn => fn };
      if (name === '@supabase/supabase-js') return { createClient(url, key, opts) {
        assert.equal(url, 'https://fixture.invalid'); assert.equal(key, 'fixture'); options = opts; return f.client;
      } };
      if (name === './hustleCarnival') return load('src/lib/partners/hustleCarnival.ts');
      throw new Error('Unexpected test import');
    },
  }, { filename });
  assert.equal(await exports.loadHustleCommunity(), 'ready');
  assert.equal(options.auth.persistSession, false);
  assert.equal(options.auth.autoRefreshToken, false);
  assert.equal(options.auth.detectSessionInUrl, false);
  await options.global.fetch('https://fixture.invalid/rest/v1/hackathons', { method: 'GET', headers: { 'x-fixture': 'synthetic' }, cache: 'force-cache' });
  assert.equal(request.input, 'https://fixture.invalid/rest/v1/hackathons');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.headers['x-fixture'], 'synthetic');
  assert.equal(request.init.cache, 'no-store');
  assert.equal(request.init.signal, signal);
  assert.equal(timeoutMs, 4000);
});
