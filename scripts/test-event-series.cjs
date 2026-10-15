/* eslint-disable @typescript-eslint/no-require-imports -- Offline runtime regressions. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ROOT, load, series, config, fixture, renderPath } = require('./event-series-harness.cjs');
const api = load('src/lib/partners/eventSeriesPublic.ts');
const expected = {
  karnataka: '48578e2f-0012-4357-b610-d6a4af17f961',
  'west-bengal': '52d447ef-f574-4538-b6c1-2e5d9a2e33d6',
  chhattisgarh: '7050f4bd-df55-49d0-a399-1c4393a140f7',
  delhi: 'bd07369c-ff56-4cff-953b-6d550372f415',
  haryana: '2f8e6f49-fcbf-422d-b572-81be3d0197ea',
  telangana: '7df25627-896f-404b-8fa0-a8925ecc5aa2',
  'tamil-nadu': '5fef2bf8-ceb5-4ec8-b037-4a8a9b41f231',
};

test('reviewed mapping has seven distinct existing events, not tracks', () => {
  assert.deepEqual(Object.fromEntries(series.qualifiers.map(q => [q.slug, q.eventId])), expected);
  assert.equal(new Set(series.qualifiers.map(q => q.eventId)).size, 7);
  assert.equal(series.officialHub, 'https://unstop.com/college-fests/d3-2026-tech-fest-iiit-bhubaneswar-international-institute-of-information-technology-iiit-bhubaneswar-496201');
});

test('hub performs one narrow bounded anonymous read and no private reads/writes', async () => {
  const f = fixture();
  const result = await api.resolvePublicSeries(f.client, series);
  assert.equal(result.kind, 'ready'); assert.equal(result.events.length, 7);
  assert.equal(f.queries.length, 1);
  assert.deepEqual(f.queries[0], { table: 'hackathons', columns: 'id,name,website_url,mode,location,status,archived',
    filters: [['id', Object.values(expected)], ['status', 'approved'], ['archived', false]], limit: 7 });
});

for (const qualifier of series.qualifiers) {
  test(`${qualifier.slug}: exact row, registration, isolated discovery and organizer rules`, async () => {
    const { html, queries, status, rows } = await renderPath(`/partners/craftncode/${qualifier.slug}`);
    assert.equal(status, 200);
    assert(html.includes(qualifier.state));
    assert(html.includes(`href="${rows.find(row => row.id === qualifier.eventId).website_url}"`));
    assert(html.includes(`href="/hackathons/${qualifier.eventId}?tab=looking_for_teams"`));
    for (const other of series.qualifiers.filter(q => q !== qualifier)) assert(!html.includes(other.eventId));
    assert.deepEqual(queries[0].filters, [['id', qualifier.eventId], ['status', 'approved'], ['archived', false]]);
    assert.match(html, /2–4 members per team/); assert.match(html, /all participating colleges are located within the same qualifier state/);
    assert.match(html, /does not verify college locations or certify eligibility/);
    assert.match(html, /does not register your team on Unstop/);
    assert.match(html, /Sign in and complete onboarding when prompted/);
    assert.match(html, /No schedule is confirmed/);
    assert(!html.includes('Venue in India')); assert(!html.includes('<form')); assert(!html.includes('<button'));
  });
}

for (const state of ['unknown', 'Karnataka', '__proto__', 'constructor', '../delhi', '', 'organizer']) {
  test(`unknown state ${state} is rejected before querying`, async () => {
    const f = fixture();
    assert.equal((await api.resolvePublicQualifier(f.client, series, state)).kind, 'missing');
    assert.equal(f.queries.length, 0);
  });
}

for (const change of [{ status: 'pending' }, { status: 'rejected' }, { status: null }, { status: undefined },
  { archived: true }, { archived: null }, { archived: undefined }, { id: expected.delhi }]) {
  test(`defensive public visibility rejects ${JSON.stringify(change)}`, async () => {
    const row = { ...fixture().rows[0], ...change, type: 'external', approval_status: 'approved' };
    const f = fixture({ rows: [row], ignoreFilters: true });
    const result = await api.resolvePublicQualifier(f.client, series, 'karnataka');
    assert.equal(result.kind, 'missing');
    const listing = await api.resolvePublicSeries(f.client, series);
    assert(!listing.events.some(event => event.id === expected.karnataka));
  });
}

for (const type of ['native', 'external', null]) {
  test(`explicitly approved ${type} event is eligible`, () => {
    assert(config.normalizeQualifierEvent({ ...fixture().rows[0], type }, series.qualifiers[0]));
  });
}

test('hub only links publicly resolved events, empty is distinct from query failure', async () => {
  const rows = fixture().rows;
  const hidden = await renderPath('/partners/craftncode', { rows: [{ ...rows[0], status: 'pending', name: 'PRIVATE PENDING TITLE' }, rows[1]] });
  assert(!hidden.html.includes('/craftncode/karnataka')); assert(!hidden.html.includes('PRIVATE PENDING TITLE'));
  assert(hidden.html.includes('/craftncode/west-bengal'));
  const empty = await renderPath('/partners/craftncode', { rows: [] });
  assert.match(empty.html, /No qualifier details are available/); assert(!empty.html.includes('Retry'));
  const missing = await renderPath('/partners/craftncode/karnataka', { rows: [] });
  assert.equal(missing.status, 404); assert.match(missing.html, /Qualifier not found/);
});

for (const options of [{ error: { code: '42501' } }, { throwError: new Error('offline') }]) {
  test(`query errors logged; safe unavailable and Retry: ${JSON.stringify(options)}`, async () => {
    const errors = [];
    const local = load('src/lib/partners/eventSeriesPublic.ts', {}, { errors });
    const f = fixture(options);
    assert.equal((await local.resolvePublicSeries(f.client, series)).kind, 'unavailable');
    assert.equal((await local.resolvePublicQualifier(f.client, series, 'delhi')).kind, 'unavailable');
    assert.equal(errors.length, 2);
    for (const pathname of ['/partners/craftncode', '/partners/craftncode/delhi']) {
      const { html } = await renderPath(pathname, options);
      assert.match(html, /temporarily unavailable/); assert(html.includes(`href="${pathname}">Retry`));
      assert(!html.includes('42501')); assert(!html.includes('/hackathons/'));
    }
    assert.equal((await renderPath('/partners/craftncode')).status, 200);
  });
}

test('duplicate database rows fail explicitly, without publishing incomplete results', async () => {
  const row = fixture().rows[0];
  assert.equal((await api.resolvePublicSeries(fixture({ rows: [row, row] }).client, series)).kind, 'unavailable');
});

for (const value of ['javascript:alert(1)', '//unstop.com/hackathons/abc', 'http://unstop.com/hackathons/abc',
  'https://unstop.com.evil.invalid/hackathons/abc', 'https://evil.invalid/hackathons/abc',
  'https://api.unstop.com/hackathons/abc', 'https://user:secret@unstop.com/hackathons/abc',
  'https://unstop.com:444/hackathons/abc', 'https://unstop.com/college-fests/older-272871',
  'https://unstop.com/hackathons/', 'https://unstop.com/\\evil', 'https://unstop.com/hackathons/abc\n', null]) {
  test(`reject unsafe or non-qualifier registration URL: ${String(value)}`, async () => {
    assert.equal(config.qualifierRegistrationUrl(value), null);
    const row = { ...fixture().rows[0], website_url: value };
    const { html } = await renderPath('/partners/craftncode/karnataka', { rows: [row] });
    assert(!html.includes('Register on Unstop')); assert.match(html, /registration link is currently unavailable/);
    assert(html.includes(expected.karnataka));
  });
}

for (const value of ['https://unstop.com/hackathons/existing-row-123', 'https://www.unstop.com/hackathons/existing-row-123?ref=partner']) {
  test(`preserve safe exact row registration URL ${value}`, () => assert.equal(config.qualifierRegistrationUrl(value), value));
}

test('untrusted event text is escaped and generic locations are not confirmed venues', async () => {
  const row = { ...fixture().rows[0], name: '<script>bad()</script>', location: '<img src=x onerror=bad()>' };
  const { html } = await renderPath('/partners/craftncode/karnataka', { rows: [row] });
  assert(!html.includes('<script>')); assert(!html.includes('<img')); assert(html.includes('&lt;script&gt;'));
  for (const location of ['Venue in India', 'India', 'TBA', 'Online', null]) {
    assert.equal(config.normalizeQualifierEvent({ ...row, location }, series.qualifiers[0]).listedLocation, null);
  }
  assert.equal(config.normalizeQualifierEvent({ ...row, location: 'Listed campus' }, series.qualifiers[0]).listedLocation, 'Listed campus');
});

test('missing configuration fails closed and anonymous client disables session persistence', async () => {
  const errors = [];
  const missing = load('src/lib/partners/eventSeriesPublic.ts', {}, { errors });
  assert.equal((await missing.loadCraftSeries()).kind, 'unavailable');
  assert.equal((await missing.loadCraftQualifier('delhi')).kind, 'unavailable');
  assert.equal(errors.length, 2);
  let calls = 0;
  const f = fixture();
  const configured = load('src/lib/partners/eventSeriesPublic.ts', {
    '@supabase/supabase-js': { createClient(url, key, options) {
      calls++; assert.equal(url, 'https://fixture.invalid'); assert.equal(key, 'synthetic-anon');
      assert.equal(options.auth.persistSession, false); assert.equal(options.auth.autoRefreshToken, false);
      assert.equal(options.auth.detectSessionInUrl, false); assert.equal(typeof options.global.fetch, 'function');
      return f.client;
    } },
  }, { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon' } });
  assert.equal((await configured.loadCraftQualifier('unknown')).kind, 'missing'); assert.equal(calls, 0);
  assert.equal((await configured.loadCraftSeries()).kind, 'ready'); assert.equal(calls, 1);
});

test('metadata never exposes hidden titles and uses exact canonical state route', async () => {
  const props = { params: Promise.resolve({ state: 'karnataka' }) };
  for (const kind of ['missing', 'unavailable']) {
    const route = load('src/app/partners/craftncode/[state]/page.tsx', {
      '@/lib/partners/eventSeriesPublic': { loadCraftQualifier: async () => ({ kind }) },
    });
    assert.equal((await route.generateMetadata(props)).robots.index, false);
  }
  const route = load('src/app/partners/craftncode/[state]/page.tsx', {
    '@/lib/partners/eventSeriesPublic': { loadCraftQualifier: async state => api.resolvePublicQualifier(fixture().client, series, state) },
  });
  assert.equal((await route.generateMetadata(props)).alternates.canonical, '/partners/craftncode/karnataka');
});

test('loading state is accessible and no unavailable metadata claims a successful listing', async () => {
  const html = renderToStaticMarkup(React.createElement(load('src/app/partners/craftncode/loading.tsx').default));
  assert.match(html, /aria-busy="true"/); assert.match(html, /Loading qualifier details/);
  const page = load('src/app/partners/craftncode/page.tsx', {
    '@/lib/partners/eventSeriesPublic': { loadCraftSeries: async () => ({ kind: 'unavailable' }) },
  });
  assert.equal((await page.generateMetadata()).robots.index, false);
});

test('hub metadata noindexes empty and failed listings but preserves visible listing indexing', async () => {
  for (const result of [{ kind: 'ready', events: [] }, { kind: 'unavailable' },
    { kind: 'ready', events: [config.normalizeQualifierEvent(fixture().rows[0], series.qualifiers[0])] }]) {
    const page = load('src/app/partners/craftncode/page.tsx', {
      '@/lib/partners/eventSeriesPublic': { loadCraftSeries: async () => result },
    });
    const metadata = await page.generateMetadata();
    if (result.kind === 'ready' && result.events.length > 0) assert.equal(metadata.robots, undefined);
    else { assert.equal(metadata.robots.index, false); assert.equal(metadata.robots.follow, false); }
  }
});

test('online format is scoped to the listed qualifier, not the national competition or finale', async () => {
  const row = { ...fixture().rows[0], mode: 'online' };
  const { html } = await renderPath('/partners/craftncode/karnataka', { rows: [row] });
  assert.match(html, /<dt>Listed qualifier format<\/dt><dd>Online<\/dd>/);
  assert(!html.includes('exclusively online')); assert(!html.includes('online finale'));
  assert.match(html, /No schedule is confirmed on this page/);
});

test('real Next route sorter preserves generic partner and organizer paths', () => {
  const { getSortedRoutes } = require('next/dist/shared/lib/router/utils/sorted-routes');
  const { getRouteRegex } = require('next/dist/shared/lib/router/utils/route-regex');
  const { getRouteMatcher } = require('next/dist/shared/lib/router/utils/route-matcher');
  const routes = ['/partners/[slug]', '/partners/[slug]/organizer', '/partners/craftncode', '/partners/craftncode/[state]'];
  for (const route of routes) assert(fs.existsSync(path.join(ROOT, 'src/app', route, 'page.tsx')));
  const sorted = getSortedRoutes(routes);
  const match = pathname => sorted.find(route => getRouteMatcher(getRouteRegex(route))(pathname));
  assert.equal(match('/partners/craftncode'), '/partners/craftncode');
  assert.equal(match('/partners/craftncode/delhi'), '/partners/craftncode/[state]');
  assert.equal(match('/partners/another-event'), '/partners/[slug]');
  assert.equal(match('/partners/another-event/organizer'), '/partners/[slug]/organizer');
  assert(fs.existsSync(path.join(ROOT, 'src/app/hackathons/[id]/page.tsx')));
  assert(fs.existsSync(path.join(ROOT, 'src/app/page.tsx')));
});
