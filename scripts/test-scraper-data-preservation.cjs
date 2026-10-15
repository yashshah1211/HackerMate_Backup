/* eslint-disable @typescript-eslint/no-require-imports -- Offline scraper regression fixtures. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./ppt-vision-harness.cjs');

const NOW = '2026-10-15T03:30:00.000Z';
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return Date.parse(NOW); }
}

function fixture({ failedRead } = {}) {
  const events = [
    { id: 'fixture-ended', name: 'Historical fixture', type: 'external', end_date: '2026-10-14', website_url: 'https://example.invalid/history', archived: false },
    { id: 'fixture-today', name: 'Ending today fixture', type: 'external', end_date: '2026-10-15', website_url: 'https://example.invalid/today', archived: false },
    { id: 'fixture-partner', name: 'Partner fixture', type: 'external', end_date: '2026-10-13', website_url: 'https://example.invalid/partner', archived: false },
  ];
  const linkedTables = ['team_submissions', 'team_hackathons', 'team_github_repos', 'team_links', 'hackathon_resources', 'hackathon_registrations', 'saved_hackathons'];
  const db = { hackathons: events, organizer_leads: [], partner_configs: [{ hackathon_id: 'fixture-partner', partner_name: 'Partner fixture', features: {} }] };
  for (const table of linkedTables) db[table] = events.map(event => ({ id: `fixture-${table}-${event.id}`, hackathon_id: event.id }));
  const original = structuredClone(db), writes = [], reads = [], pitches = [];
  const client = { from(table) {
    assert(Object.hasOwn(db, table), `Unexpected table ${table}`);
    let operation = 'select', payload, filters = [];
    const query = {
      select(columns) { reads.push({ table, columns }); return query; },
      eq(column, value) { filters.push(row => row[column] === value); return query; },
      in(column, values) { filters.push(row => values.includes(row[column])); return query; },
      delete() { operation = 'delete'; return query; },
      update(value) { operation = 'update'; payload = value; return query; },
      insert(value) { operation = 'insert'; payload = value; return query; },
      upsert(value, options) { operation = 'upsert'; payload = value; assert.equal(options.onConflict, 'website_url'); return query; },
      then(resolve, reject) {
        try {
          if (operation === 'select') {
            resolve(failedRead === table ? { data: null, error: { message: 'Isolated dependency failure' } }
              : { data: structuredClone(db[table].filter(row => filters.every(filter => filter(row)))), error: null });
            return;
          }
          writes.push({ table, operation, payload: structuredClone(payload) });
          if (operation === 'delete') {
            const ids = db[table].filter(row => filters.every(filter => filter(row))).map(row => row.id);
            db[table] = db[table].filter(row => !ids.includes(row.id));
            // Model the destructive FK consequence, without a real database.
            if (table === 'hackathons') for (const linked of linkedTables) db[linked] = db[linked].filter(row => !ids.includes(row.hackathon_id));
          } else if (operation === 'update') {
            for (const row of db[table].filter(row => filters.every(filter => filter(row)))) Object.assign(row, payload);
          } else {
            for (const row of payload) {
              const existing = operation === 'upsert' && db[table].find(item => item.website_url === row.website_url);
              if (existing) Object.assign(existing, row); else db[table].push(structuredClone(row));
            }
          }
          resolve({ data: structuredClone(payload || []), error: null });
        } catch (error) { reject(error); }
      },
    };
    return query;
  } };
  const candidates = [
    { id: 'fixture-active', title: 'New active fixture', public_url: 'https://example.invalid/active/', start_date: '2026-10-14', end_date: '2026-10-18' },
    { id: 'fixture-upcoming', title: 'New upcoming fixture', public_url: 'https://example.invalid/upcoming', start_date: '2026-10-20', end_date: '2026-10-22' },
    { id: 'fixture-past-new', title: 'Unseen past fixture', public_url: 'https://example.invalid/unseen-past', start_date: '2026-10-01', end_date: '2026-10-02' },
    { id: 'fixture-partner', title: 'Partner fixture', public_url: 'https://example.invalid/partner', end_date: '2026-10-13' },
  ];
  const network = [];
  const mockFetch = async input => {
    const url = new URL(input); network.push(url.href);
    if (url.origin === 'https://unstop.com' && url.pathname.endsWith('/search-result')) {
      return Response.json({ data: { data: url.searchParams.get('page') === '1' && url.searchParams.get('oppstatus') === 'open' ? candidates : [] } });
    }
    if (url.origin === 'https://unstop.com' && url.pathname.startsWith('/api/public/competition/')) {
      return Response.json({ data: { contacts: [{ email: 'organizer@example.invalid' }] } });
    }
    if (url.href === 'https://devfolio.co/hackathons') return new Response('');
    if (url.origin === 'https://hack2skill.com' && url.pathname.endsWith('/event/list')) return Response.json({ data: {} });
    throw new Error(`Unexpected network request (never forwarded): ${url.origin}${url.pathname}`);
  };
  const overrides = {
    '@/lib/admin/requireOutreachAdmin': { requireOutreachAdmin: async () => ({ supabaseAdmin: client }) },
    '@/lib/admin/autoSendPitches': {
      autoSendPitchEmailsForLeads: async (_client, leads) => { assert.equal(_client, client); pitches.push(leads); return { sent: leads?.length || 0, failed: 0, attempted: leads?.length || 0 }; },
      autoRemoveUnopenedPitchedLeads: async () => ({ removedCount: 0 }),
    },
    '@/lib/admin/gmailInboxSync': { executeGmailInboxSync: async () => ({ configured: false }) },
    '@supabase/supabase-js': { createClient: (url, key) => { assert.equal(url, 'https://example.invalid'); assert.equal(key, 'fixture-only-key'); return client; } },
  };
  const loader = harness(overrides, { Date: FixtureDate, fetch: mockFetch });
  const scraper = loader.load('src/app/api/admin/scrape-unstop/route.ts');
  overrides['@/app/api/admin/scrape-unstop/route'] = scraper;
  Object.assign(loader.env, { NODE_ENV: 'production', CRON_SECRET: 'fixture-only-secret', NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only-key' });
  async function run(entry = 'direct') {
    if (entry === 'direct') return scraper.runMultiPlatformScraper(client);
    const response = entry === 'admin' ? await scraper.POST(new Request('https://example.invalid/api/admin/scrape-unstop', { method: 'POST' }))
      : await loader.load('src/app/api/cron/auto-scrape-leads/route.ts').GET(new Request('https://example.invalid/api/cron/auto-scrape-leads', { headers: { Authorization: 'Bearer fixture-only-secret' } }));
    assert.equal(response.status, 200); return response.json();
  }
  return { db, original, writes, reads, pitches, network, linkedTables, run };
}

test('routine scraping preserves ended external events and events ending today', async () => {
  const f = fixture(); await f.run();
  for (const event of f.original.hackathons) assert.deepEqual(f.db.hackathons.find(row => row.id === event.id), event);
  assert.equal(f.writes.some(write => write.operation === 'delete'), false);
});

test('historical submission, resource, repository, registration and other FK fixtures are preserved', async () => {
  const f = fixture(); await f.run();
  for (const table of f.linkedTables) assert.deepEqual(f.db[table], f.original[table], `${table} must survive routine scraping`);
});

test('partner-linked events and configuration remain untouched', async () => {
  const f = fixture(); await f.run();
  assert.deepEqual(f.db.hackathons.find(row => row.id === 'fixture-partner'), f.original.hackathons[2]);
  assert.deepEqual(f.db.partner_configs, f.original.partner_configs);
});

test('new active/upcoming discovery upserts and outreach delegation retain their existing behavior', async () => {
  const f = fixture(), result = await f.run();
  assert.equal(result.success, true);
  const upserts = f.writes.filter(write => write.table === 'hackathons' && write.operation === 'upsert');
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0].payload.map(row => row.website_url), ['https://example.invalid/active', 'https://example.invalid/upcoming']);
  assert(upserts[0].payload.every(row => row.type === 'external'));
  assert.equal(f.db.hackathons.length, f.original.hackathons.length + 2);
  assert.equal(f.pitches.length, 1);
  assert.equal(f.pitches[0].length, 3, 'Existing outreach can process new past candidates without catalog ingestion');
  assert.equal(f.network.some(url => url.includes('api.resend.com')), false);
});

test('routine discovery introduces no automatic archive or other historical-event mutation', async () => {
  const f = fixture(); await f.run();
  assert(f.writes.filter(write => write.table === 'hackathons').every(write => write.operation === 'upsert'));
  for (const write of f.writes.filter(write => write.table === 'hackathons')) for (const row of write.payload) {
    assert.equal(Object.hasOwn(row, 'archived'), false);
    assert.equal(f.original.hackathons.some(event => event.website_url === row.website_url), false);
  }
  for (const event of f.original.hackathons) assert.deepEqual(f.db.hackathons.find(row => row.id === event.id), event);
});

for (const failedRead of ['organizer_leads', 'hackathons', 'partner_configs']) {
  test(`a failed ${failedRead} dependency read cannot trigger historical deletion or archival`, async () => {
    const f = fixture({ failedRead }); await f.run();
    assert.equal(f.writes.some(write => write.operation === 'delete' || write.operation === 'update'), false);
    for (const event of f.original.hackathons) assert.deepEqual(f.db.hackathons.find(row => row.id === event.id), event);
    for (const table of f.linkedTables) assert.deepEqual(f.db[table], f.original[table]);
  });
}

for (const entry of ['admin', 'cron']) {
  test(`the ${entry} entry point preserves historical events using isolated services`, async () => {
    const f = fixture(); await f.run(entry);
    assert.equal(f.writes.some(write => write.operation === 'delete' || write.operation === 'update'), false);
    for (const event of f.original.hackathons) assert.deepEqual(f.db.hackathons.find(row => row.id === event.id), event);
    for (const table of f.linkedTables) assert.deepEqual(f.db[table], f.original[table]);
  });
}
