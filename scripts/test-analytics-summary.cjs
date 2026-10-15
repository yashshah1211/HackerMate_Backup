/* eslint-disable @typescript-eslint/no-require-imports -- Offline TypeScript route and PDF regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const { NextRequest, NextResponse } = require('next/server');
const { extractText } = require('unpdf');
const { harness } = require('./ppt-vision-harness.cjs');

// Never load .env, contact a database, invoke a cron URL, or send an email.
// Both external clients are replaced; all fixtures use reserved invalid domains.
const now = Date.parse('2026-10-15T20:00:00Z');
const day = 24 * 60 * 60 * 1000;
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const iso = offset => new Date(now + offset).toISOString();
const row = offset => ({ created_at: iso(offset) });
const fixture = {
  profiles: [row(-8 * day), row(-7 * day), row(-day - 1), row(-day), row(0), row(1)],
  teams: [row(-8 * day), row(-2 * day), row(-1)],
  // Counts are records of attempts, including pending/failed, not completions.
  team_ppt_evaluations: [row(-2 * day), row(-1)],
};
const tableKeys = { profiles: 'registeredProfiles', teams: 'teams', team_ppt_evaluations: 'evaluationRecords' };
const periods = ['total', 'last24h', 'last7d'];
const normalize = value => JSON.parse(JSON.stringify(value));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const verifiedCounts = data => Object.values(data.counts).flatMap(Object.values);

function setup(options = {}) {
  const queries = [], sends = [], clients = [];
  const client = {
    from(table) {
      assert(Object.hasOwn(tableKeys, table), `Unexpected relation: ${table}`);
      if (options.throwFrom === table) throw new Error('Fixture client failure');
      let since, until;
      const builder = {
        select(column, opts) {
          assert.equal(column, 'id');
          assert.deepEqual(normalize(opts), { count: 'exact', head: true });
          return builder;
        },
        lte(column, value) { assert.equal(column, 'created_at'); until = value; return builder; },
        gte(column, value) { assert.equal(column, 'created_at'); since = value; return builder; },
        then(resolve, reject) {
          assert.equal(until, iso(0), 'All queries must have the same upper bound');
          const period = since === undefined ? 'total' : since === iso(-day) ? 'last24h' : 'last7d';
          if (period === 'last7d') assert.equal(since, iso(-7 * day));
          const key = `${table}.${period}`;
          queries.push(key);
          if (options.reject === key) return Promise.reject(new Error('Fixture read failed')).then(resolve, reject);
          const rows = (options.empty ? [] : fixture[table]).filter(r => r.created_at <= until && (!since || r.created_at >= since));
          const response = options.results?.[key] || (options.failAll ? { error: { message: 'Fixture failed' }, count: null } : { error: null, count: rows.length });
          return Promise.resolve(response).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const h = harness({
    'next/server': { NextRequest, NextResponse },
    '@supabase/supabase-js': {
      createClient: (...args) => { clients.push(args); if (options.badClient) throw new Error('Fixture configuration error'); return client; },
    },
  }, {
    Date: FixedDate,
    fetch: async (url, opts) => {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.equal(opts.method, 'POST');
      assert.equal(opts.headers.Authorization, 'Bearer offline-provider-key');
      assert(opts.signal instanceof AbortSignal);
      sends.push(JSON.parse(opts.body));
      if (!options.provider) throw new Error('No provider response fixture');
      return options.provider();
    },
  });
  Object.assign(h.env, {
    NODE_ENV: 'production', CRON_SECRET: 'offline-cron-secret',
    NEXT_PUBLIC_SUPABASE_URL: 'https://database.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'offline-db-key',
    ADMIN_CONTACT_EMAIL: 'founder@example.invalid', RESEND_API_KEY: 'offline-provider-key',
    NEXT_PUBLIC_GA_ID: 'G-NOT-A-DATA-SOURCE', ...options.env,
  });
  const lib = h.load('src/lib/admin/analyticsSummary.ts');
  const route = h.load('src/app/api/cron/analytics-summary/route.ts');
  const call = (method = 'POST', format = '', token = 'offline-cron-secret') => route[method](new NextRequest(
    `http://localhost/api/cron/analytics-summary${format ? `?format=${format}` : ''}`,
    { method, headers: token === null ? {} : { Authorization: `Bearer ${token}` } },
  ));
  return { ...h, lib, call, queries, sends, clients };
}

async function pdfText(buffer) {
  const result = await extractText(new Uint8Array(buffer), { mergePages: true });
  assert.equal(result.totalPages, 1, 'Keep the digest readable on one page');
  return result.text.replace(/\s+/g, ' ');
}

function assertUnmeasured(data) {
  assert.equal(data.unavailable.length, 8);
  for (const metric of data.unavailable) {
    assert.equal(metric.value, null);
    assert(['unmeasured', 'unavailable'].includes(metric.status));
    assert(metric.reason);
  }
  for (const label of ['Pageviews', 'Unique visitors', 'Active users', 'Top pages', 'Referrers', 'Devices']) {
    assert.equal(data.unavailable.find(m => m.label === label).status, 'unmeasured');
  }
  assert.equal(data.unavailable.find(m => m.label === 'New connections').status, 'unavailable');
  for (const invented of ['totalPageviews', 'uniqueVisitors', 'devices', 'topPages', 'topReferrers', 'gaMeasurementId']) {
    assert(!Object.hasOwn(data, invented), `Remove the old fabricated ${invented} field`);
  }
}

test('exact retained database counts and inclusive 24h/7d boundaries remain accurate', async () => {
  const h = setup(), data = await h.lib.fetchPlatformAnalytics();
  assert.equal(data.generatedAt, iso(0)); assert.equal(data.databaseStatus, 'complete');
  assert.equal(h.queries.length, 9); assert.equal(h.clients.length, 1);
  const expected = { registeredProfiles: [5, 2, 4], teams: [3, 1, 2], evaluationRecords: [2, 1, 2] };
  for (const [table, key] of Object.entries(tableKeys)) {
    periods.forEach((period, i) => {
      const metric = data.counts[key][period];
      assert.equal(metric.status, 'verified'); assert.equal(metric.value, expected[key][i]);
      assert(metric.source.includes(table)); assert(metric.source.includes('exact retained-row count'));
    });
  }
  assertUnmeasured(data);
});

test('successful empty reads yield genuine zero counts without any synthetic activity or traffic', async () => {
  const data = await setup({ empty: true }).lib.fetchPlatformAnalytics();
  assert.equal(data.databaseStatus, 'complete');
  for (const metric of verifiedCounts(data)) { assert.equal(metric.status, 'verified'); assert.equal(metric.value, 0); }
  assertUnmeasured(data);
});

for (const [table, key] of Object.entries(tableKeys)) {
  for (const period of periods) {
    test(`failed ${table}.${period} read stays null while independent counts remain verified`, async () => {
      const data = await setup({ results: { [`${table}.${period}`]: { count: 99, error: { message: 'Fixture database denied' } } } }).lib.fetchPlatformAnalytics();
      assert.equal(data.databaseStatus, 'partial');
      assert.equal(data.counts[key][period].status, 'failed'); assert.equal(data.counts[key][period].value, null);
      assert.equal(verifiedCounts(data).filter(m => m.status === 'verified').length, 8);
      assertUnmeasured(data);
    });
  }
}

for (const count of [null, undefined, -1, 1.5, NaN, '0', Infinity]) {
  test(`invalid exact count ${String(count)} cannot become a verified zero`, async () => {
    const data = await setup({ results: { 'profiles.total': { error: null, count } } }).lib.fetchPlatformAnalytics();
    assert.equal(data.counts.registeredProfiles.total.status, 'failed'); assert.equal(data.counts.registeredProfiles.total.value, null);
  });
}

test('rejected promises and synchronous query failures stay isolated', async () => {
  for (const options of [{ reject: 'profiles.last24h' }, { throwFrom: 'teams' }]) {
    const data = await setup(options).lib.fetchPlatformAnalytics();
    assert.equal(data.databaseStatus, 'partial');
    assert(verifiedCounts(data).some(m => m.status === 'failed' && m.value === null));
    assert(verifiedCounts(data).some(m => m.status === 'verified')); assertUnmeasured(data);
  }
});

for (const credential of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  test(`missing ${credential} is unavailable, without database calls or fallback counts`, async () => {
    const h = setup({ env: { [credential]: '' } }), data = await h.lib.fetchPlatformAnalytics();
    assert.equal(h.clients.length, 0); assert.equal(h.queries.length, 0); assert.equal(data.databaseStatus, 'unavailable');
    for (const metric of verifiedCounts(data)) { assert.equal(metric.status, 'unavailable'); assert.equal(metric.value, null); }
    assertUnmeasured(data);
  });
}

test('database client initialization failure and total database failure never generate fallback statistics', async () => {
  for (const options of [{ badClient: true }, { failAll: true }]) {
    const data = await setup(options).lib.fetchPlatformAnalytics(); assert.equal(data.databaseStatus, 'unavailable');
    for (const metric of verifiedCounts(data)) { assert.equal(metric.status, 'failed'); assert.equal(metric.value, null); }
    assertUnmeasured(data);
  }
});

for (const options of [{}, { empty: true }, { failAll: true }, { env: { SUPABASE_SERVICE_ROLE_KEY: '' } },
  { results: { 'profiles.total': { error: { message: 'Fixture error' }, count: null } } }]) {
  test(`real PDF and HTML accurately render measurements and unavailable states: ${JSON.stringify(options)}`, async () => {
    const h = setup(options), data = await h.lib.fetchPlatformAnalytics();
    const buffer = h.lib.generateAnalyticsPdfBuffer(data, 'Oct 16, 2026');
    const text = await pdfText(buffer), html = h.lib.generateEmailHtml(data, 'Oct 16, 2026');
    for (const rendered of [text, html.replace(/<[^>]*>/g, '')]) {
      assert.match(rendered, /Registered profiles/); assert.match(rendered, /Evaluation records/);
      assert.match(rendered, /not unique visitors or active users/); assert.match(rendered, /pending, completed and failed/);
      assert.match(rendered, /Pageviews:.*Unmeasured/); assert.match(rendered, /Devices:.*Unmeasured/);
      assert.match(rendered, /Referrers:.*Unmeasured/); assert.match(rendered, /New connections:.*Unavailable/);
      assert(!/GA4|GOOGLE ANALYTICS|Est\. Daily|EST\. DAILY|G-NOT-A-DATA-SOURCE|undefined|\bnull\b|NaN|\d+%/.test(rendered));
    }
    if (options.failAll) { assert.match(text, /no verified counts/); assert.match(text, /Registered profiles Query failed Query failed Query failed/); }
    else if (options.env) { assert.match(text, /Registered profiles Unavailable Unavailable Unavailable/); }
    else if (options.results) { assert.match(text, /incomplete/); assert.match(text, /Registered profiles Query failed 2 4/); }
    else { assert.match(text, options.empty ? /Registered profiles 0 0 0/ : /Registered profiles 5 2 4/); }
  });
}

for (const method of ['GET', 'POST']) {
  for (const token of [null, 'wrong-token']) {
    test(`${method} rejects token ${token} in production before any database or email access`, async () => {
      const h = setup(); assert.equal((await h.call(method, 'pdf', token)).status, 401);
      assert.equal(h.clients.length, 0); assert.equal(h.queries.length, 0); assert.equal(h.sends.length, 0);
    });
  }
  test(`${method} preserves authenticated PDF downloads without email dispatch`, async () => {
    const h = setup(), res = await h.call(method, 'pdf');
    assert.equal(res.status, 200); assert.equal(res.headers.get('Content-Type'), 'application/pdf');
    assert.match(res.headers.get('Content-Disposition'), /inline; filename="HackerMate_Daily_Platform_Digest/);
    assert.equal(res.headers.get('X-Analytics-Database-Status'), 'complete'); assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
    assert.match(await pdfText(await res.arrayBuffer()), /Registered profiles 5 2 4/); assert.equal(h.sends.length, 0);
  });
}

test('missing production cron secret still denies access; existing local development access remains available', async () => {
  const denied = setup({ env: { CRON_SECRET: '' } }); assert.equal((await denied.call()).status, 401); assert.equal(denied.clients.length, 0);
  const local = setup({ env: { NODE_ENV: 'development', RESEND_API_KEY: '' } });
  assert.equal((await local.call('GET', 'pdf', null)).status, 200); assert.equal(local.sends.length, 0);
});

test('a 2xx provider acknowledgement reports acceptance, not delivery, for either existing HTTP method', async () => {
  for (const method of ['GET', 'POST']) {
    const h = setup({ provider: () => json({ id: 'offline-message-id' }, 201) }), res = await h.call(method);
    assert.equal(res.status, 200); const body = await res.json();
    assert.equal(body.success, true); assert.equal(body.dispatch.status, 'accepted'); assert.equal(body.resendId, 'offline-message-id');
    assert.match(body.dispatch.reason, /delivery is not confirmed/); assert(!Object.hasOwn(body, 'deliveredTo'));
    assert.equal(body.recipient, 'founder@example.invalid'); assert.equal(body.pdfGenerated, true); assert.equal(h.sends.length, 1);
    const payload = h.sends[0]; assert.deepEqual(payload.to, ['founder@example.invalid']);
    // Frozen UTC time is Oct 16 in India: the title and attachment must agree.
    assert.match(payload.subject, /Oct 16, 2026/); assert(!/views|\+\d|GA4|Growth/.test(payload.subject));
    assert.equal(payload.attachments.length, 1); assert.match(payload.attachments[0].filename, /Oct_16__2026/);
    assert.match(await pdfText(Buffer.from(payload.attachments[0].content, 'base64')), /Pageviews: Unmeasured/);
    assertUnmeasured(body.analyticsSummary);
  }
});

test('accepted dispatch preserves partial data states in the API, email and PDF', async () => {
  const h = setup({ results: { 'profiles.total': { count: null, error: { message: 'Fixture denial' } } }, provider: () => json({ id: 'fixture-id' }) });
  const body = await (await h.call()).json(); assert.equal(body.success, true); assert.equal(body.dispatch.status, 'accepted');
  assert.equal(body.analyticsSummary.databaseStatus, 'partial'); assert.equal(body.analyticsSummary.counts.registeredProfiles.total.value, null);
  assert.match(h.sends[0].html, /Query failed/); assert.match(h.sends[0].subject, /partial/);
});

for (const status of [400, 401, 429, 500]) {
  test(`provider HTTP ${status} is a failed dispatch even if its body contains an id`, async () => {
    const h = setup({ provider: () => json({ id: 'not-accepted', message: 'Fixture rejection' }, status) });
    const res = await h.call(); assert.equal(res.status, 502); const body = await res.json();
    assert.equal(body.success, false); assert.equal(body.dispatch.status, 'failed'); assert.equal(body.dispatch.providerStatus, status);
    assert(!Object.hasOwn(body, 'resendId')); assert.equal(h.sends.length, 1);
  });
}

for (const acknowledgement of [null, {}, [], { id: '' }, { id: '  ' }, { id: 42 }, { id: 'not-accepted', error: 'Fixture error' }, { message: 'rejected' }]) {
  test(`malformed 2xx acknowledgement is unknown, never a false success: ${JSON.stringify(acknowledgement)}`, async () => {
    const h = setup({ provider: () => json(acknowledgement) }), res = await h.call(); assert.equal(res.status, 502);
    const body = await res.json(); assert.equal(body.success, false); assert.equal(body.dispatch.status, 'unknown'); assert.equal(h.sends.length, 1);
  });
}

for (const provider of [() => new Response('invalid-json'), () => new Response(null, { status: 204 }),
  () => { throw new Error('Fixture timeout'); }]) {
  test('unparseable/empty responses and network failures are unknown; dispatch is never automatically retried', async () => {
    const h = setup({ provider }), res = await h.call(); assert.equal(res.status, 502);
    const body = await res.json(); assert.equal(body.success, false); assert.equal(body.dispatch.status, 'unknown'); assert.equal(h.sends.length, 1);
  });
}

test('missing provider configuration no longer returns mock dispatch success; PDF still works', async () => {
  const h = setup({ env: { RESEND_API_KEY: '' } }), res = await h.call(); assert.equal(res.status, 503);
  const body = await res.json(); assert.equal(body.success, false); assert.equal(body.dispatch.status, 'failed');
  assert.match(body.dispatch.reason, /not configured/); assert.equal(body.pdfGenerated, true); assert.equal(h.sends.length, 0);
  assertUnmeasured(body.analyticsSummary); assert.equal((await h.call('GET', 'pdf')).status, 200);
});

test('workflow caller checks accepted outcome and never claims delivery', () => {
  const workflow = fs.readFileSync('.github/workflows/analytics-digest.yml', 'utf8');
  assert.match(workflow, /\.success == true and \.dispatch.status == "accepted"/);
  assert.match(workflow, /delivery is not confirmed/); assert(!/successfully delivered|PostHog/.test(workflow));
});
