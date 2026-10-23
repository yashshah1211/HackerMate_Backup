/* eslint-disable @typescript-eslint/no-require-imports -- Offline service, authorization and React lifecycle regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { NextRequest } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');

// No .env, live clients, cron calls, email, mutation methods or RPCs are available.
const now = Date.parse('2026-10-15T12:00:00Z'), day = 86_400_000;
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = offset => new Date(now + offset).toISOString();
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const plain = value => JSON.parse(JSON.stringify(value));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const person = (n, offset, complete = false, banned = false) => ({ id: uuid(n), full_name: `Fixture user ${n}`, created_at: offset === null ? null : iso(offset),
  onboarding_completed: complete, is_banned: banned, email: 'private-do-not-return@example.invalid', bio: 'PRIVATE-BIO' });
function fixtures() {
  return {
    profiles: [person(1, -8 * day), person(2, -7 * day, false, true), person(3, -day), person(4, 0), person(5, 1), person(6, null),
      person(7, -2 * day, true), person(8, -1000, null), person(90, -9 * day, true), person(91, -9 * day, true)],
    teams: [{ id: uuid(101), name: 'Fixture team A', owner_id: uuid(90) }, { id: uuid(102), name: 'Fixture team B', owner_id: uuid(91) }],
    team_join_requests: [-8 * day, -7 * day, -day, 0, 1, null].map((offset, i) => ({ id: uuid(201 + i), team_id: uuid(i % 2 ? 102 : 101), user_id: uuid(i + 1), status: 'pending', created_at: offset === null ? null : iso(offset), secret: 'PRIVATE-REQUEST' })),
    team_invites: [-8 * day, -7 * day, 0, null].map((offset, i) => ({ id: uuid(301 + i), team_id: uuid(i % 2 ? 102 : 101), invited_user_id: uuid(i === 1 ? 91 : i + 1), status: 'pending', created_at: offset === null ? null : iso(offset), token: 'PRIVATE-INVITE-TOKEN' })),
  };
}
function split(expression) {
  const result = []; let depth = 0, start = 0;
  for (let i = 0; i < expression.length; i++) {
    if (expression[i] === '(') depth++; if (expression[i] === ')') depth--;
    if (expression[i] === ',' && depth === 0) { result.push(expression.slice(start, i)); start = i + 1; }
  }
  result.push(expression.slice(start)); return result;
}
function scalar(row, column, operator, value) {
  if (operator === 'is') return row[column] === null;
  if (operator === 'eq') return row[column] === value;
  if (row[column] === null || row[column] === undefined) return false;
  const left = row[column], right = value;
  if (operator === 'gt') return left > right; if (operator === 'gte') return left >= right;
  if (operator === 'lt') return left < right; if (operator === 'lte') return left <= right;
  throw new Error(`Unmocked operation ${operator}`);
}
function matches(row, expression) {
  if (expression.startsWith('and(')) return split(expression.slice(4, -1)).every(term => matches(row, term));
  const [, column, op, value] = expression.match(/^(\w+)\.(is|eq|gt|gte|lt|lte)\.(.*)$/) || [];
  assert(column, `Unsupported filter: ${expression}`); return scalar(row, column, op, value);
}
function setup(options = {}) {
  const tables = options.tables || fixtures(), queries = [], events = [];
  let active = 0, maxActive = 0;
  const client = { from(table) {
    assert(Object.hasOwn(tables, table), `Unexpected table ${table}`);
    if (options.throwFrom === table) throw new Error('PRIVATE synchronous DB exception');
    const q = { table, ops: [], orders: [], limit: null, head: false, columns: '', signal: null };
    const builder = {
      select(columns, opts) { assert(!columns.includes('*')); assert(!/email|bio|token|details/.test(columns)); q.columns = columns; q.head = !!opts?.head; if (q.head) assert.equal(opts.count, 'exact'); return builder; },
      order(column, opts) { q.orders.push([column, plain(opts)]); return builder; },
      limit(value) { q.limit = value; return builder; },
      abortSignal(signal) { assert(signal instanceof AbortSignal); q.signal = signal; return builder; },
      in(column, values) { q.ops.push(['in', column, [...values]]); return builder; },
      or(expression) { q.ops.push(['or', expression]); return builder; },
      then(resolve, reject) {
        assert(q.signal); queries.push(q);
        active++; maxActive = Math.max(maxActive, active);
        return new Promise(yes => setImmediate(yes)).then(() => {
          active--;
          if (options.fail?.(q)) return { error: { message: 'PRIVATE DB error with credentials' }, data: null, count: 0 };
          if (options.reject?.(q)) throw new Error('PRIVATE rejected DB query');
          let rows = tables[table].filter(row => q.ops.every(op => op[0] === 'or' ? split(op[1]).some(term => matches(row, term)) :
            op[0] === 'in' ? op[2].includes(row[op[1]]) : scalar(row, op[1], op[0], op[2])));
          rows = [...rows].sort((a, b) => {
            for (const [column, opts] of q.orders) {
              if (a[column] === b[column]) continue;
              if (a[column] === null) return opts.nullsFirst ? -1 : 1;
              if (b[column] === null) return opts.nullsFirst ? 1 : -1;
              const comparison = a[column] < b[column] ? -1 : 1; return opts.ascending ? comparison : -comparison;
            } return 0;
          });
          if (q.head) return { data: null, count: Object.hasOwn(options, 'invalidCount') ? options.invalidCount : rows.length, error: null };
          assert(Number.isInteger(q.limit) && q.limit > 0 && q.limit <= 100, 'Every row download must be bounded');
          return { data: options.missingRows ? null : rows.slice(0, q.limit), count: null, error: null };
        }).then(resolve, reject);
      },
    };
    for (const op of ['eq', 'gt', 'gte', 'lt', 'lte', 'is']) builder[op] = (column, value) => { q.ops.push([op, column, value]); return builder; };
    return builder;
  } };
  const userClient = {
    auth: { getUser: async () => { events.push('verify-user'); return { data: { user: options.noUser ? null : { id: uuid(91), email: options.founder ? 'yashshah7117@gmail.com' : 'actor@example.invalid', user_metadata: { role: 'admin' } } }, error: options.authError ? { message: 'Fixture bad token' } : null }; } },
    from(table) { assert.equal(table, 'profiles'); return { select(columns) { assert.equal(columns, 'role, is_banned'); return this; }, eq(column, value) { assert.equal(column, 'id'); assert.equal(value, uuid(91)); return this; },
      async maybeSingle() { events.push('verify-role'); if (options.roleThrow) throw new Error('PRIVATE lookup error'); return { data: options.noProfile ? null : { role: options.role ?? 'admin', is_banned: Object.hasOwn(options, 'banned') ? options.banned : false }, error: options.roleError ? { message: 'PRIVATE lookup failure' } : null }; } }; },
  };
  const h = harness({
    '@supabase/supabase-js': { createClient(url, key) { if (key === 'offline-service') { events.push('service-client'); return client; } return userClient; } },
    '@supabase/ssr': { createServerClient: () => userClient },
  }, { Date: FixedDate, URLSearchParams, Error });
  Object.assign(h.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-anon', SUPABASE_SERVICE_ROLE_KEY: 'offline-service', ...options.env });
  const lib = h.load('src/lib/admin/attentionQueue.ts'), route = h.load('src/app/api/admin/attention/route.ts');
  const get = async (query = '') => route.GET(new NextRequest(`http://localhost/api/admin/attention${query ? `?${query}` : ''}`, { headers: { Authorization: 'Bearer offline-actor' } }));
  const data = (query = '') => lib.getAttentionQueue(client, uuid(91), lib.parseAttentionOptions(new URLSearchParams(query)));
  return { ...h, lib, route, get, data, queries, events, tables, maxActive: () => maxActive };
}
const allMetrics = response => [...Object.values(response.totals), response.recentIncompleteRegistrations, response.unknownOnboardingState,
  ...Object.values(response.joinRequestAges), response.oldInvitations];

test('exact counts distinguish false from unknown, account age, recent registration and strict seven-day buckets', async () => {
  const h = setup(), data = await h.data();
  assert.equal(data.coverage, 'complete'); assert.equal(data.generatedAt, iso(0));
  assert.deepEqual(plain(Object.fromEntries(Object.entries(data.totals).map(([key, metric]) => [key, metric.value]))), { onboarding: 6, 'join-requests': 6, invitations: 4 });
  assert.equal(data.recentIncompleteRegistrations.value, 2); assert.equal(data.unknownOnboardingState.value, 1);
  assert.deepEqual(plain(Object.values(data.joinRequestAges).map(m => m.value)), [1, 2, 1, 2]); assert.equal(data.oldInvitations.value, 1);
  assert.equal(data.page.items.length, 6); assert(!data.page.items.some(item => item.id === uuid(8)));
  assert.equal(data.page.items[0].age.days, 8); assert.equal(data.page.items[1].suspended, true);
  assert.equal(data.page.items.find(item => item.id === uuid(5)).age.status, 'unknown');
  assert.equal(data.page.items.find(item => item.id === uuid(6)).age.status, 'unknown');
});

test('successful empty database is the only empty/zero state', async () => {
  const tables = Object.fromEntries(Object.keys(fixtures()).map(key => [key, []]));
  const data = await setup({ tables }).data(); assert.equal(data.coverage, 'complete');
  for (const metric of allMetrics(data)) { assert.equal(metric.status, 'verified'); assert.equal(metric.value, 0); }
  assert.deepEqual(plain(data.page.items), []); assert.equal(data.page.hasMore, false);
});

for (let failed = 0; failed < 10; failed++) {
  test(`count failure ${failed} retains null/unavailable and independent successful metrics`, async () => {
    let index = 0;
    const data = await setup({ fail: q => q.head && index++ === failed }).data();
    const metrics = allMetrics(data); assert.equal(data.coverage, 'partial');
    assert.equal(metrics[failed].status, 'unavailable'); assert.equal(metrics[failed].value, null);
    assert.equal(metrics.filter(metric => metric.status === 'verified').length, 9); assert.equal(data.page.status, 'available');
  });
}
for (const invalidCount of [null, undefined, -1, 1.5, NaN, '0']) {
  test(`malformed count ${String(invalidCount)} never becomes a factual zero`, async () => {
    const data = await setup({ invalidCount }).data(); for (const metric of allMetrics(data)) assert.equal(metric.status, 'unavailable');
  });
}

test('total failure, rejected reads and synchronous failures never fabricate empty rows or counts', async () => {
  for (const options of [{ fail: () => true }, { reject: () => true }]) {
    const h = setup(options), response = await h.get('category=join-requests'); assert.equal(response.status, 503);
    const data = await response.json(); assert.equal(data.coverage, 'unavailable'); assert.equal(data.page.items, null); assert.equal(data.page.hasMore, null);
    for (const metric of allMetrics(data)) assert.equal(metric.value, null);
    assert(!JSON.stringify(data).includes('PRIVATE'));
  }
  const partial = await setup({ throwFrom: 'profiles' }).data('category=join-requests');
  assert.equal(partial.coverage, 'partial'); assert.equal(partial.totals.onboarding.value, null); assert.equal(partial.totals['join-requests'].value, 6);
});

test('missing collection data cannot become a confirmed empty list', async () => {
  const data = await setup({ missingRows: true }).data();
  assert.equal(data.page.items, null); assert.equal(data.page.status, 'unavailable'); assert.equal(data.totals.onboarding.value, 6);
});

test('list failure preserves exact aggregates and cannot present a confirmed empty queue', async () => {
  const data = await setup({ fail: q => !q.head && q.table === 'profiles' }).data();
  assert.equal(data.coverage, 'partial'); assert.equal(data.totals.onboarding.value, 6); assert.equal(data.page.status, 'unavailable'); assert.equal(data.page.items, null);
});

test('batched enrichment failures preserve rows and never grant unverifiable ownership links', async () => {
  const data = await setup({ fail: q => q.table === 'teams' }).data('category=join-requests');
  assert.equal(data.page.items.length, 6); assert.equal(data.coverage, 'partial'); assert(data.warnings.length);
  assert(data.page.items.every(item => !item.links.some(link => link.href.endsWith('/requests'))));
  const missing = await setup({ tables: { ...fixtures(), teams: [], profiles: [] } }).data('category=join-requests');
  assert.equal(missing.page.items.length, 6); assert(missing.page.items.every(item => item.team === null && item.links.length === 0));
});

test('row reads, enrichment and concurrency remain bounded without N+1 or unnecessary columns', async () => {
  const h = setup(); await h.data('category=join-requests&limit=2');
  assert.equal(h.queries.length, 13); assert.equal(h.queries.filter(q => q.head).length, 10); assert(h.maxActive() <= 4);
  const downloads = h.queries.filter(q => !q.head); assert.deepEqual(downloads.map(q => q.table), ['team_join_requests', 'teams', 'profiles']);
  assert.equal(downloads[0].limit, 3); assert.equal(downloads[1].limit, 2); assert(downloads[2].limit <= 4);
  assert.equal(new Set(h.queries.map(q => q.signal)).size, 1);
});

test('oldest-first keysets traverse ties and nulls exactly once, separately from full totals', async () => {
  const h = setup();
  h.tables.profiles[1].created_at = h.tables.profiles[0].created_at;
  h.tables.profiles.push(person(9, null));
  const found = []; let cursor = '', iterations = 0;
  do {
    const data = await h.data(`limit=1${cursor ? `&cursor=${cursor}` : ''}`); assert.equal(data.totals.onboarding.value, 7);
    assert.equal(data.page.items.length, 1); found.push(data.page.items[0].id); cursor = data.page.nextCursor;
    assert(++iterations <= 7);
  } while (cursor);
  assert.deepEqual(found, [1, 2, 3, 4, 5, 6, 9].map(uuid)); assert.equal(new Set(found).size, 7);
  const pageQueries = h.queries.filter(q => !q.head);
  assert(pageQueries.every(q => JSON.stringify(q.orders) === JSON.stringify([['created_at', { ascending: true, nullsFirst: false }], ['id', { ascending: true }]])));
});

test('cursor preserves PostgreSQL microseconds and validates null continuation/category/filter', async () => {
  const h = setup(); h.tables.profiles[0].created_at = '2026-10-01T00:00:00.123456Z';
  const first = await h.data('limit=1');
  const encoded = JSON.parse(Buffer.from(first.page.nextCursor, 'base64url').toString()); assert.equal(encoded.at, '2026-10-01T00:00:00.123456Z');
  const next = await h.data(`limit=1&cursor=${first.page.nextCursor}`); assert.equal(next.page.items[0].id, uuid(2));
  assert.throws(() => h.lib.parseAttentionOptions(new URLSearchParams(`category=invitations&cursor=${first.page.nextCursor}`)), /cursor/);
  assert.throws(() => h.lib.parseAttentionOptions(new URLSearchParams(`filter=recent&cursor=${first.page.nextCursor}`)), /cursor/);
});

test('filters constrain rows on the server without redefining global totals', async () => {
  const recent = await setup().data('filter=recent'); assert.equal(recent.totals.onboarding.value, 6); assert.deepEqual(plain(recent.page.items.map(item => item.id)), [uuid(3), uuid(4)]);
  for (const category of ['join-requests', 'invitations']) {
    const old = await setup().data(`category=${category}&filter=over7d`); assert.equal(old.page.items.length, 1); assert.equal(old.page.items[0].age.days, 8);
  }
});

for (const [timestamp, status, days] of [[null, 'unknown'], [undefined, 'unknown'], ['invalid', 'unknown'], ['2026-02-30T00:00:00Z', 'unknown'],
  [iso(1), 'unknown'], [iso(0).replace('.000Z', '.000001Z'), 'unknown'], [iso(-day).replace('.000Z', '.000001Z'), 'known', 0], [iso(0), 'known', 0], [iso(-day + 1), 'known', 0], [iso(-day), 'known', 1], [iso(-7 * day), 'known', 7]]) {
  test(`timestamp ${timestamp} has explicit age semantics`, () => {
    const age = setup().lib.ageAt(timestamp, now); assert.equal(age.status, status); if (status === 'known') assert.equal(age.days, days); else assert(!Object.hasOwn(age, 'days'));
  });
}

test('invalid row timestamps stay explicitly unknown and cannot fabricate a continuation position', async () => {
  const h = setup(); h.tables.profiles[4].created_at = 'invalid';
  const data = await h.data('limit=5'); assert.equal(data.page.items[4].age.status, 'unknown');
  assert.equal(data.page.nextCursor, null); assert.equal(data.page.hasMore, true); assert.equal(data.coverage, 'partial'); assert.match(data.warnings.join(' '), /Pagination is unavailable/);
});

for (const query of ['category=reports', 'filter=over7d', 'category=invitations&filter=recent', 'limit=0', 'limit=51', 'limit=-1', 'limit=1.5',
  'limit=abc', 'limit=1&limit=2', 'offset=100', 'cursor=', 'cursor=bad()', `cursor=${Buffer.from(JSON.stringify({ v: 1, category: 'onboarding', filter: 'all', at: 'x),id.gt.1', id: uuid(1) })).toString('base64url')}`]) {
  test(`invalid parameter cannot reach queue reads: ${query}`, async () => {
    const h = setup(), response = await h.get(query); assert.equal(response.status, 400); assert.equal(h.queries.length, 0);
  });
}

test('maximum supported page size uses bounded lookahead; empty later pages do not erase total', async () => {
  const h = setup(); assert.equal((await h.get('limit=50')).status, 200); assert.equal(h.queries.find(q => !q.head).limit, 51);
  const cursor = Buffer.from(JSON.stringify({ v: 1, category: 'onboarding', filter: 'all', at: null, id: uuid(999) })).toString('base64url');
  const data = await h.data(`cursor=${cursor}`); assert.equal(data.totals.onboarding.value, 6); assert.equal(data.page.items.length, 0);
});

for (const options of [{ noUser: true }, { role: 'user' }, { banned: true }, { banned: null }, { noProfile: true }, { roleError: true }, { roleThrow: true }, { authError: true }]) {
  test(`real shared admin boundary denies before privileged reads: ${JSON.stringify(options)}`, async () => {
    const h = setup(options), response = await h.get(); assert.equal(response.status, 403); assert.equal(h.queries.length, 0);
    assert(!h.events.includes('service-client')); assert(!JSON.stringify(await response.json()).includes('PRIVATE'));
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  });
}

test('verified founder/admin access and service-role requirement preserve global scope and privacy', async () => {
  for (const options of [{}, { founder: true, role: 'user' }]) {
    const h = setup(options), response = await h.get('category=invitations'); assert.equal(response.status, 200);
    assert(h.events.indexOf('verify-role') < h.events.indexOf('service-client')); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const text = JSON.stringify(await response.json()); assert(!/PRIVATE|email|token|bio|offline-service/.test(text));
  }
  const noService = setup({ env: { SUPABASE_SERVICE_ROLE_KEY: '' } }), denied = await noService.get();
  assert.equal(denied.status, 503); assert.equal(noService.queries.length, 0); assert(!noService.events.includes('service-client'));
  const limited = setup({ env: { SUPABASE_SERVICE_ROLE_KEY: 'offline-anon' } });
  assert.equal((await limited.get()).status, 503); assert.equal(limited.queries.length, 0);
  assert.deepEqual(Object.keys(setup().route), ['GET']);
});

test('legitimate workflow links depend on actual team ownership and invitation recipient', async () => {
  const h = setup(), requests = await h.data('category=join-requests');
  for (const item of requests.page.items) {
    assert.equal(item.links.some(link => link.href.endsWith('/requests')), [uuid(202), uuid(204), uuid(206)].includes(item.id));
    assert.match(item.responsible, /Only the owner/);
    for (const link of item.links) assert.match(link.href, /^\/(profile|teams)\/[0-9a-f-]+(\/requests)?$/);
  }
  const invites = await h.data('category=invitations');
  assert.deepEqual(plain(invites.page.items.filter(item => item.links.some(link => link.href === '/invites')).map(item => item.id)), [uuid(302)]);
  assert(invites.page.items.every(item => !item.links.some(link => /accept|reject|token/.test(link.href))));
});

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function payload(category = 'onboarding') { return plain(await setup().data(`category=${category}`)); }
async function ui(t, first, initialCategory = 'onboarding') {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin/attention' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true });
  const { createRoot } = require('react-dom/client'); const root = createRoot(dom.window.document.getElementById('root'));
  t.after(async () => { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  } });
  const responses = [first ?? Promise.resolve(json(await payload(initialCategory)))], calls = [], guards = [];
  const Component = harness({
    '@/lib/supabase': { supabase: { auth: { getUser: async () => ({ data: { user: { id: 'synthetic-admin' } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } },
    '@/components/AuthGuard': ({ children, adminOnly }) => { guards.push(adminOnly); return children; },
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
  }, { URLSearchParams, AbortController, Error,
    fetch: async (url, opts) => {
      if (url === '/api/admin/team-formation') return json({ error: 'Synthetic formation unavailable' }, 503);
      assert(url.startsWith('/api/admin/attention?')); assert.equal(opts.method, 'GET'); assert.equal(opts.cache, 'no-store'); assert.equal(opts.credentials, 'same-origin');
      assert(opts.signal instanceof AbortSignal); calls.push({ url, signal: opts.signal }); assert(responses.length, 'Unexpected automatic request'); return responses.shift();
    },
  }).load('src/app/admin/attention/page.tsx').default;
  await React.act(async () => root.render(React.createElement(Component)));
  const text = () => dom.window.document.body.textContent.replace(/\s+/g, ' ');
  const button = label => [...dom.window.document.querySelectorAll('button')].find(node => node.textContent.replace(/\s+/g, ' ').trim().startsWith(label));
  return { text, calls, responses, guards, dom,
    click: async label => { const control = button(label); assert(control, `Missing ${label}`); await React.act(async () => control.click()); },
    settle: async fn => React.act(async () => { await fn?.(); await new Promise(resolve => setImmediate(resolve)); }),
  };
}

test('real page distinguishes loading, verified content, account age, unknown states and genuine empty', async t => {
  const initial = deferred(), body = await payload(), view = await ui(t, initial.promise);
  assert.match(view.text(), /Loading attention queues/); assert(!view.text().includes('No outstanding records')); assert(view.guards.every(Boolean));
  await view.settle(() => initial.resolve(json(body)));
  assert.match(view.text(), /Fixture user 1/); assert.match(view.text(), /Account age: 8 days/);
  assert.match(view.text(), /Unknown onboarding state, excluded/); assert.match(view.text(), /Generated/); assert.match(view.text(), /IST/);
  assert.match(view.text(), /time spent incomplete|Time spent incomplete/); assert.match(view.text(), /Suspended/);
  assert(![...view.dom.window.document.querySelectorAll('button')].some(button => /accept|reject|approve|send/i.test(button.textContent)));
  const tables = Object.fromEntries(Object.keys(fixtures()).map(key => [key, []]));
  const empty = plain(await setup({ tables }).data()); view.responses.push(Promise.resolve(json(empty))); await view.click('Refresh');
  assert.match(view.text(), /No outstanding records match this filter/); assert.match(view.text(), /0 records on this page/);
  assert(!view.text().includes('Fixture user 1')); assert.equal(view.calls.length, 2);
});

test('real page manual refresh uses current server values and discards previous private data on denial', async t => {
  const view = await ui(t), updated = await payload();
  updated.page.items[0].name = 'Refreshed fixture'; updated.generatedAt = iso(1000);
  const pending = deferred(); view.responses.push(pending.promise); await view.click('Refresh');
  assert.match(view.text(), /Loading attention queues/); assert(!view.text().includes('Fixture user 1'));
  await view.settle(() => pending.resolve(json(updated))); assert.match(view.text(), /Refreshed fixture/);
  view.responses.push(Promise.resolve(json({ error: 'Denied' }, 403))); await view.click('Refresh');
  assert.match(view.text(), /Administrator access could not be verified/); assert(!view.text().includes('Refreshed fixture')); assert(!view.text().includes('No outstanding records'));
  view.responses.push(Promise.resolve(json(await payload()))); await view.click('Retry queues'); assert.match(view.text(), /Fixture user 1/);
});

test('real page partial failure keeps measured counts and cannot show failed rows as empty', async t => {
  const body = plain(await setup({ fail: q => !q.head && q.table === 'profiles' }).data());
  const view = await ui(t, Promise.resolve(json(body)));
  assert.match(view.text(), /Some reads are unavailable/); assert.match(view.text(), /Queue rows could not be loaded/);
  assert(!view.text().includes('No outstanding records'));
  const failedCount = await payload(); failedCount.coverage = 'partial'; failedCount.totals.onboarding = { status: 'unavailable', value: null, reason: 'Fixture failed read' };
  view.responses.push(Promise.resolve(json(failedCount))); await view.click('Refresh');
  assert.match(view.text(), /Unavailable/); assert.match(view.text(), /Fixture user 1/);
});

for (const failure of ['network', 'invalid-json', 'malformed-body', 'unavailable']) {
  test(`real page ${failure} stays an error, not confirmed zero, and can retry`, async t => {
    const initial = deferred(), view = await ui(t, initial.promise);
    await view.settle(() => {
      if (failure === 'network') initial.reject(new Error('Fixture network failure'));
      else initial.resolve(failure === 'invalid-json' ? new Response('invalid') : failure === 'malformed-body' ? json({}) : json({ error: 'Global reads unavailable' }, 503));
    });
    assert(view.dom.window.document.querySelector('[role="alert"]')); assert(!view.text().includes('No outstanding records')); assert(!view.text().includes('0 records on this page'));
    view.responses.push(Promise.resolve(json(await payload()))); await view.click('Retry queues'); assert.match(view.text(), /Fixture user 1/);
  });
}

test('real page category/filter pagination and manual refresh stay read-only and reset cursors', async t => {
  const first = plain(await setup().data('limit=1')), second = plain(await setup().data(`limit=1&cursor=${first.page.nextCursor}`));
  const view = await ui(t, Promise.resolve(json(first))); assert.match(view.text(), /1 records on this page/);
  view.responses.push(Promise.resolve(json(second))); await view.click('Next page'); assert(view.calls[1].url.includes('cursor='));
  view.responses.push(Promise.resolve(json(await payload()))); await view.click('Refresh'); assert(!view.calls[2].url.includes('cursor='));
  view.responses.push(Promise.resolve(json(await payload('join-requests')))); await view.click('Pending join requests');
  assert.match(view.text(), /Pending request age distribution/); assert.match(view.text(), /Only the owner/);
  const old = plain(await setup().data('category=join-requests&filter=over7d'));
  view.responses.push(Promise.resolve(json(old))); await view.click('Over 7 days');
  assert(view.calls.at(-1).url.includes('filter=over7d')); assert.match(view.text(), /1 records on this page/);
  assert(![...view.dom.window.document.querySelectorAll('button')].some(button => /accept|reject|approve|send/i.test(button.textContent)));
});

test('stale success and error responses cannot overwrite a later category or refresh', async t => {
  const older = deferred(), newer = deferred(), view = await ui(t, older.promise);
  view.responses.push(newer.promise); await view.click('Pending invitations'); assert.equal(view.calls[0].signal.aborted, true);
  const invitations = await payload('invitations'); invitations.page.items[0].name = 'Latest invitation fixture';
  await view.settle(() => newer.resolve(json(invitations))); assert.match(view.text(), /Latest invitation fixture/);
  await view.settle(() => older.resolve(json({ error: 'Old denial' }, 403))); assert.match(view.text(), /Latest invitation fixture/);
  const staleRefresh = deferred(), currentRefresh = deferred();
  view.responses.push(staleRefresh.promise); await view.click('Refresh');
  view.responses.push(currentRefresh.promise); await view.click('Refresh');
  await view.settle(() => currentRefresh.resolve(json(invitations)));
  const stale = await payload('invitations'); stale.page.items[0].name = 'STALE-DATA';
  await view.settle(() => staleRefresh.resolve(json(stale)));
  assert.match(view.text(), /Latest invitation fixture/); assert(!view.text().includes('STALE-DATA'));
});
