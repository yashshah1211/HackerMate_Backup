/* eslint-disable @typescript-eslint/no-require-imports -- Offline landing visibility and bounded pagination regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness } = require('./ppt-vision-harness.cjs');
const loader = harness();
const api = loader.load('src/lib/hackathons/publicBrowsing.ts');
const discovery = loader.load('src/lib/hackathons/discovery.ts');
const id = index => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
const event = (index, extra = {}) => ({ id: id(index), name: `Synthetic ${index}`, description: 'Build tools', type: 'external', status: 'approved', archived: false,
  start_date: '2028-11-01', end_date: '2028-11-03', registration_end: '2028-10-30', created_at: '2026-10-01',
  mode: 'online', location: 'Mumbai', tags: ['React'], prize_pool: 'INR 1000', currency: 'INR', website_url: null, ...extra });
function paged({ records = [], caps = [], respond } = {}) {
  const calls = [];
  return { calls, from(table) {
    assert.equal(table, 'hackathons');
    const request = { filters: [], cursor: null, signal: undefined, order: null, limit: null };
    return {
      select(columns) { assert.equal(columns, api.PUBLIC_EVENT_COLUMNS); return this; },
      eq(key, value) { request.filters.push([key, value]); return this; },
      order(column, options) { request.order = [column, options.ascending]; return this; },
      limit(value) { request.limit = value; return this; },
      gt(column, value) { assert.equal(column, 'id'); request.cursor = value; return this; },
      abortSignal(signal) { request.signal = signal; return this; },
      then(resolve, reject) {
        const index = calls.length;
        calls.push(request);
        assert.deepEqual(request.filters, [['status', 'approved'], ['archived', false]]);
        assert.deepEqual(request.order, ['id', true]); assert.equal(request.limit, 250);
        const rows = records.filter(row => request.cursor === null || row.id > request.cursor).slice(0, Math.min(request.limit, caps[index] ?? caps.at(-1) ?? Infinity));
        return Promise.resolve().then(() => respond ? respond(request, index, rows) : { data: rows, error: null }).then(resolve, reject);
      },
    };
  } };
}
for (const [name, size, caps, requests] of [
  ['over 1000 events', 1251, [], 7], ['lower server cap', 1001, [17], 60],
  ['exact batch multiple', 500, [], 3], ['empty result', 0, [], 1], ['short non-final batches', 8, [3, 1, 2], 5],
]) test(`complete keyset listing: ${name}`, async () => {
  const records = Array.from({ length: size }, (_, i) => event(i + 1)), client = paged({ records, caps });
  const result = await api.loadPublicEvents(client);
  assert.equal(result.length, size); assert.equal(new Set(result.map(row => row.id)).size, size);
  assert.equal(client.calls.length, requests);
  assert.equal(client.calls.at(-1).cursor, records.at(-1)?.id || null);
  if (size) assert.equal(result.at(-1).id, records.at(-1).id);
});
test('later-page provider failures reject the entire listing; an explicit retry starts at the beginning', async () => {
  let fail = true;
  const client = paged({ records: [event(1), event(2), event(3)], caps: [2], respond: (_request, index, rows) => ({ data: fail && index === 1 ? null : rows, error: fail && index === 1 ? { message: 'offline fixture denial' } : null }) });
  await assert.rejects(api.loadPublicEvents(client), /unavailable/); assert.equal(client.calls.length, 2);
  fail = false; const result = await api.loadPublicEvents(client);
  assert.equal(result.length, 3); assert.equal(client.calls[2].cursor, null);
});
for (const [name, pages] of [
  ['duplicate within a page', [[event(1), event(1)]]],
  ['duplicate previous cursor', [[event(1)], [event(1)]]],
  ['backward cursor', [[event(2)], [event(1)]]],
  ['out-of-order page', [[event(2), event(1)]]],
  ['missing ID', [[{ status: 'approved', archived: false }]]],
]) test(`invalid cursor fails explicitly: ${name}`, async () => {
  const client = paged({ respond: (_request, index) => ({ data: pages[index] || [], error: null }) });
  await assert.rejects(api.loadPublicEvents(client), /pagination did not advance/);
});
test('invalid page shapes fail rather than becoming empty or partial success', async () => {
  for (const data of [null, {}, Array.from({ length: 251 }, (_, i) => event(i + 1))]) {
    await assert.rejects(api.loadPublicEvents(paged({ respond: () => ({ data, error: null }) })), /complete event listing/);
  }
});
test('request safety ceiling is an explicit error after 200 calls, never silent truncation', async () => {
  const client = paged({ records: Array.from({ length: 200 }, (_, i) => event(i + 1)), caps: [1] });
  await assert.rejects(api.loadPublicEvents(client), /request safety limit/); assert.equal(client.calls.length, 200);
});
test('already-cancelled loads make no requests', async () => {
  const controller = new AbortController(); controller.abort(); const client = paged({ records: [event(1)] });
  await assert.rejects(api.loadPublicEvents(client, controller.signal), error => error.name === 'AbortError'); assert.equal(client.calls.length, 0);
});
test('cancellation during a page reaches the query and prevents subsequent pages even if transport ignores abort', async () => {
  const controller = new AbortController(); let finish;
  const delayed = new Promise(resolve => { finish = resolve; });
  const client = paged({ respond: async request => { assert.equal(request.signal, controller.signal); await delayed; return { data: [event(1)], error: null }; } });
  const pending = api.loadPublicEvents(client, controller.signal);
  const rejected = assert.rejects(pending, error => error.name === 'AbortError');
  await new Promise(resolve => setImmediate(resolve)); controller.abort(); finish(); await rejected;
  assert.equal(client.calls.length, 1);
  assert.equal((await api.loadPublicEvents(paged({ records: [event(2)] }), new AbortController().signal))[0].id, id(2));
});
test('search, filters, ranking, Saved and Past operate over completed results across batch boundaries', async () => {
  const records = Array.from({ length: 1002 }, (_, i) => event(i + 1));
  records[1000] = event(1001, { name: 'Rare water energy', tags: ['Climate'], mode: 'hybrid', college: 'Synthetic Campus', min_team_size: 1, max_team_size: 4, prize_pool: 'INR 50000' });
  records[1001] = event(1002, { name: 'Past boundary', start_date: '2025-01-01', end_date: '2025-01-03' });
  const rows = await api.loadPublicEvents(paged({ records })), now = Date.parse('2026-10-15T00:00:00Z');
  const settings = discovery.readDiscoverySettings(new URLSearchParams('q=water+energy&mode=hybrid&topic=climate&participation=solo&registration=recorded'));
  assert.deepEqual(Array.from(discovery.discoverEvents(rows, settings, [], new Set(), now), row => row.id), [id(1001)]);
  assert.equal(discovery.discoverEvents(rows, { ...settings, q: '', mode: '', topic: '', participation: '', registration: '', sort: 'prize-inr' }, [], new Set(), now)[0].id, id(1001));
  for (const [tab, target] of [['saved', id(1001)], ['past', id(1002)]]) {
    const options = discovery.readDiscoverySettings(new URLSearchParams(`tab=${tab}`));
    assert.deepEqual(Array.from(discovery.discoverEvents(rows, options, [], new Set([id(1001)]), now), row => row.id), [target]);
  }
});

class LandingClock extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-15T12:00:00Z'])); } }
function landingFixture(records, options = {}) {
  const reads = [], errors = [];
  const client = { from(table) {
    const read = { table, columns: null, options: null, equals: [], ors: [], orders: [], limit: null, from: null };
    reads.push(read);
    const query = { select(columns, value) { read.columns = columns; read.options = value; return this; },
      eq(key, value) { read.equals.push([key, value]); return this; }, or(value) { read.ors.push(value); return this; },
      gte(key, value) { assert.equal(key, 'start_date'); read.from = value; return this; },
      order(key, value) { read.orders.push([key, value.ascending]); return this; }, limit(value) { read.limit = value; return this; },
      maybeSingle() { return this; }, then(resolve, reject) { return Promise.resolve().then(() => {
        if (options.throwQuery) throw new Error('offline synthetic transport failure');
        if (options.errorTable === table) return { count: null, data: null, error: { message: 'offline denied' } };
        if (table !== 'hackathons') return { count: table === 'profiles' ? 7 : 3, error: null };
        let rows = records.filter(row => read.equals.every(([key, value]) => row[key] === value));
        for (const expression of read.ors) {
          // Supporting the old expression makes the regression expose its external/null-type shortcut.
          if (expression.includes('type.eq.external')) rows = rows.filter(row => row.type === 'external' || row.type === null || row.status === 'approved' || (row.status == null && row.ai_feedback?.status === 'approved'));
          else { assert.equal(expression, 'website_url.is.null,website_url.not.ilike.*unstop.com*'); rows = rows.filter(row => row.website_url == null || !row.website_url.toLowerCase().includes('unstop.com')); }
        }
        if (read.from) rows = rows.filter(row => row.start_date >= read.from);
        if (read.orders.length) rows.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '') || a.name.localeCompare(b.name));
        const count = rows.length;
        if (read.limit) rows = rows.slice(0, read.limit);
        return { count, data: read.options?.head ? null : rows.map(row => Object.fromEntries(read.columns.split(',').map(key => [key.trim(), row[key.trim()]]))), error: null };
      }).then(resolve, reject); },
    };
    return query;
  } };
  const getLandingData = harness({ '@supabase/supabase-js': { createClient: () => client } }, { Date: LandingClock, console: { error: (...args) => errors.push(args) } }).load('src/lib/getLandingData.ts').getLandingData;
  return { reads, errors, getLandingData };
}
for (const type of ['native', 'external', null]) test(`landing visibility and public-detail agreement: ${type}`, async () => {
  const records = [event(1, { type }), ...['pending', 'rejected', null, undefined].map((status, i) => event(i + 2, { type, status, ai_feedback: { status: 'approved' } })), event(9, { type, archived: true }), event(10, { type, archived: null })];
  const fixture = landingFixture(records), result = await fixture.getLandingData();
  assert.equal(result.hackathonCount, 1); assert.deepEqual(Array.from(result.upcoming, row => row.id), [id(1)]);
  assert.equal(result.builderCount, 7); assert.equal(result.teamCount, 3);
  for (const read of fixture.reads.filter(read => read.table === 'hackathons')) {
    assert(read.equals.some(([key, value]) => key === 'status' && value === 'approved'));
    assert(read.equals.some(([key, value]) => key === 'archived' && value === false));
    assert(!read.ors.some(expression => /type\.|ai_feedback/.test(expression)));
  }
  for (const row of result.upcoming) {
    const source = records.find(record => record.id === row.id); assert(api.isPublicEvent(source));
    const client = { from() { const filters = []; return { select(columns) { assert.equal(columns, api.PUBLIC_EVENT_COLUMNS); return this; }, eq(key, value) { filters.push([key, value]); return this; }, async maybeSingle() { return { data: filters.every(([key, value]) => source[key] === value) ? source : null, error: null }; } }; } };
    assert.equal((await api.loadPublicEvent(client, row.id)).id, row.id);
  }
});
test('landing projections, eight-event limit, sorting, date/Unstop exceptions and builder/team counts are preserved', async () => {
  const records = Array.from({ length: 12 }, (_, i) => event(i + 1, { start_date: `2028-11-${String(12 - i).padStart(2, '0')}` }));
  records.push(event(30, { website_url: 'https://UNSTOP.com/synthetic' }), event(31, { start_date: '2025-01-01' }));
  const fixture = landingFixture(records), result = await fixture.getLandingData();
  assert.equal(result.hackathonCount, 14); assert.equal(result.upcoming.length, 8);
  assert(!result.upcoming.some(row => [id(30), id(31)].includes(row.id)));
  assert.deepEqual(Array.from(result.upcoming, row => row.start_date), [...result.upcoming].map(row => row.start_date).sort());
  assert.deepEqual(fixture.reads.map(read => read.columns), ['id', 'id', 'id', 'id, name, mode, start_date, end_date']);
  assert.equal(fixture.reads[3].from, '2026-10-15');
  assert.deepEqual(fixture.reads[3].orders, [['start_date', true], ['name', true]]); assert.equal(fixture.reads[3].limit, 8);
  assert.deepEqual(fixture.reads[0].equals, [['is_banned', false]]); assert.deepEqual(fixture.reads[2].equals, []);
  const Hero = harness({ '@/components/system': { ButtonLink: ({ href, children }) => React.createElement('a', { href }, children) }, './primitives': { Container: ({ children }) => React.createElement('div', null, children) }, 'next/link': ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children), './HeroPipeline': { HeroPipeline: () => null } }).load('src/components/landing/LandingHero.tsx').LandingHero;
  const html = renderToStaticMarkup(React.createElement(Hero, result));
  const links = [...html.matchAll(/href="\/hackathons\/([^"/]+)"/g)].map(match => match[1]);
  assert.deepEqual(links.sort(), Array.from(result.upcoming, row => row.id).sort());
  assert(result.upcoming.every(row => api.isPublicEvent(records.find(source => source.id === row.id))));
});
test('landing existing query-error and thrown-failure fallbacks remain intact and logged', async () => {
  const fixture = landingFixture([event(1)], { errorTable: 'hackathons' }), result = await fixture.getLandingData();
  assert.equal(result.hackathonCount, 0); assert.equal(result.upcoming.length, 0); assert.equal(result.builderCount, 7); assert.equal(result.teamCount, 3); assert.equal(fixture.errors.length, 2);
  const thrown = landingFixture([event(1)], { throwQuery: true }), fallback = await thrown.getLandingData();
  assert.deepEqual(JSON.parse(JSON.stringify(fallback)), { builderCount: 0, hackathonCount: 0, teamCount: 0, upcoming: [] }); assert(thrown.errors.length);
});
