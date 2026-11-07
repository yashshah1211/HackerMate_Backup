/* eslint-disable @typescript-eslint/no-require-imports -- Fresh loopback PostgreSQL processes and synthetic HTTP provider; no existing database accepted. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { createFixture } = require('./admin-hackathon-local-db.cjs');
const { setupAnalytics } = require('./analytics-digest-harness.cjs');
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const KEY = 'cron:analytics-summary:v1:2026-11-07';

test('analytics claims: actual PostgreSQL uniqueness, ownership CAS and HTTP provider counts', async t => {
  const database = await createFixture(); let server;
  const state = { requests: [], behavior: 'accepted', fault: null, at: '2026-11-07T18:29:59Z' };
  // Bounded test connection pool: each statement uses its own psql process.
  // Six can compete at once, within the disposable cluster's connection limit.
  let active = 0; const waiters = [];
  async function sql(statement) {
    if (active >= 6) await new Promise(resolve => waiters.push(resolve));
    else active++;
    try { return await database.asyncSql(statement); }
    finally { if (waiters.length) waiters.shift()(); else active--; }
  }
  try {
    database.sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.app_settings(key text PRIMARY KEY,value text NOT NULL);
      ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,INSERT,UPDATE ON public.app_settings TO service_role;`);
    server = http.createServer(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      assert.equal(req.method, 'POST'); assert.equal(req.url, '/emails');
      assert.equal(req.headers.authorization, 'Bearer synthetic-provider-key');
      assert.match(req.headers['idempotency-key'], /^hm-analytics-summary\/v1\/2026-11-0[78]$/);
      state.requests.push({ key: req.headers['idempotency-key'], body: JSON.parse(raw) });
      if (state.behavior === 'lost') { res.destroy(); return; }
      if (state.behavior === 'malformed') { res.writeHead(200); res.end('invalid JSON'); return; }
      const status = typeof state.behavior === 'number' ? state.behavior : 201;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status === 201 ? { id: 'synthetic-receipt-' + state.requests.length } : { error: 'synthetic' }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    function client() {
      return { from(table) {
        assert.equal(table, 'app_settings'); let operation, payload; const filters = [];
        const query = {
          insert(row) { operation = 'insert'; payload = row; return query; },
          update(row) { operation = 'update'; payload = row; return query; },
          eq(column, value) { assert(['key', 'value'].includes(column)); filters.push([column, value]); return query; },
          select(columns) { assert.equal(columns, 'key,value'); return query; },
          abortSignal(signal) { assert(signal instanceof AbortSignal); return query; },
          then(resolve, reject) {
            const run = async () => {
              const next = JSON.parse(payload.value).status;
              if (state.fault === next) return { data: null, error: { code: '42501' } };
              const statement = operation === 'insert'
                ? `INSERT INTO public.app_settings(key,value) VALUES(${quote(payload.key)},${quote(payload.value)}) RETURNING key,value`
                : `UPDATE public.app_settings SET value=${quote(payload.value)} WHERE ${filters.map(([key, value]) => key + '=' + quote(value)).join(' AND ')} RETURNING key,value`;
              try {
                const raw = await sql(`SET ROLE service_role; WITH changed AS (${statement}) SELECT COALESCE(jsonb_agg(changed),'[]') FROM changed;`);
                if (state.fault === next + '-lost') return { data: null, error: { code: 'PGRST000' } };
                return { data: JSON.parse(raw), error: null };
              } catch (error) {
                return { data: null, error: { code: /23505/.test(error.message) ? '23505' : '42501' } };
              }
            };
            return run().then(resolve, reject);
          },
        }; return query;
      } };
    }
    const handlers = Array.from({ length: 3 }, () => setupAnalytics({ db: client(), generatedAt: () => state.at,
      provider: async (_url, init) => fetch(origin + '/emails', init) }));
    const journal = () => JSON.parse(database.sql(`SELECT value FROM public.app_settings WHERE key=${quote(KEY)};`));
    function reset() {
      database.sql(`DELETE FROM public.app_settings; INSERT INTO public.app_settings VALUES
        ('cron:database-activity-report:2026-11-07','preserve'),('cron:organizer-outreach:v1:recipient:synthetic','preserve'),('organizer:pitch:v1:intent:synthetic','preserve');`);
      state.requests = []; state.behavior = 'accepted'; state.fault = null; state.at = '2026-11-07T18:29:59Z';
    }
    await t.test('browser roles cannot read/insert/update the private existing ledger', () => {
      for (const role of ['anon', 'authenticated']) for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) {
        assert.equal(database.sql(`SELECT has_table_privilege('${role}','public.app_settings','${privilege}');`), 'f');
      }
    });
    await t.test('24 concurrent GET/POST invocations through three clients/processes make one HTTP provider call', async () => {
      reset(); const responses = await Promise.all(Array.from({ length: 24 }, (_, i) => handlers[i % 3].call({ method: i % 2 ? 'GET' : 'POST' })));
      assert.equal(responses.filter(r => r.status === 200).length, 1); assert.equal(responses.filter(r => r.status === 409).length, 23);
      assert.equal(state.requests.length, 1); assert.equal(journal().status, 'accepted'); assert.equal(journal().providerId, 'synthetic-receipt-1');
      assert.equal(database.sql("SELECT count(*) FROM public.app_settings WHERE value='preserve';"), '3');
      const before = journal(); assert.equal((await handlers[2].call()).status, 409); assert.deepEqual(journal(), before);
      assert.equal(state.requests.length, 1);
    });
    await t.test('PDF-only requests do not claim; PDF stays available after a digest', async () => {
      reset(); assert.equal((await handlers[0].call({ method: 'GET', query: '?format=pdf' })).status, 200);
      assert.equal(database.sql("SELECT count(*) FROM public.app_settings WHERE key LIKE 'cron:analytics-summary:%';"), '0');
      assert.equal(state.requests.length, 0); assert.equal((await handlers[1].call()).status, 200);
      assert.equal((await handlers[2].call({ method: 'GET', query: '?format=pdf' })).status, 200); assert.equal(state.requests.length, 1);
    });
    for (const fault of ['claimed-lost', 'dispatching', 'dispatching-lost']) await t.test(fault + ' leaves a committed hold and zero provider requests', async () => {
      reset(); state.fault = fault; assert.equal((await handlers[0].call()).status, 503);
      assert(['claimed', 'dispatching'].includes(journal().status)); state.fault = null;
      assert.equal((await handlers[1].call()).status, 409); assert.equal(state.requests.length, 0);
    });
    for (const behavior of [400, 401, 408, 409, 429, 500, 503, 'lost', 'malformed']) await t.test('provider ' + behavior + ' permanently suppresses another daily request', async () => {
      reset(); state.behavior = behavior; assert.equal((await handlers[0].call()).status, 502);
      assert.equal(journal().status, [400, 401].includes(behavior) ? 'rejected' : 'unknown');
      state.behavior = 'accepted'; assert.equal((await handlers[1].call()).status, 409); assert.equal(state.requests.length, 1);
    });
    for (const fault of ['accepted', 'accepted-lost']) await t.test('accepted provider receipt with ' + fault + ' bookkeeping stays truthful', async () => {
      reset(); state.fault = fault; const r = await handlers[0].call(), body = await r.json();
      assert.equal(r.status, 200); assert.equal(body.success, true); assert.equal(body.resendId, 'synthetic-receipt-1'); assert.equal(body.bookkeeping, 'failed');
      state.fault = null; assert.equal((await handlers[1].call()).status, 409); assert.equal(state.requests.length, 1);
    });
    await t.test('actual INSERT/UPDATE permission failure prevents provider contact', async () => {
      for (const privilege of ['INSERT', 'UPDATE']) {
        reset(); database.sql(`REVOKE ${privilege} ON public.app_settings FROM service_role;`);
        try { assert.equal((await handlers[0].call()).status, 503); assert.equal(state.requests.length, 0); }
        finally { database.sql(`GRANT ${privilege} ON public.app_settings TO service_role;`); }
      }
    });
    await t.test('forged owner and stale transitions cannot overwrite the winner', async () => {
      reset(); const helper = handlers[0].load('src/lib/admin/analyticsDigestClaim.ts'), db = client();
      const acquired = await helper.claimAnalyticsDigest(db, new Date(state.at), createHash('sha256').update('synthetic').digest('hex'));
      assert.equal(acquired.status, 'acquired'); const claim = acquired.claim;
      assert.equal(await helper.transitionAnalyticsDigest(db, { ...claim, value: 'forged' }, 'dispatching'), null);
      const started = await helper.transitionAnalyticsDigest(db, claim, 'dispatching'); assert(started);
      const accepted = await helper.transitionAnalyticsDigest(db, started, 'accepted', { providerId: 'winner' }); assert(accepted);
      assert.equal(await helper.transitionAnalyticsDigest(db, started, 'unknown'), null); assert.equal(journal().providerId, 'winner');
      assert.equal(state.requests.length, 0);
    });
    await t.test('IST rollover permits one new date; UTC midnight does not', async () => {
      reset(); assert.equal((await handlers[0].call()).status, 200);
      state.at = '2026-11-07T18:30:00Z'; assert.equal((await handlers[1].call()).status, 200);
      state.at = '2026-11-08T00:00:00Z'; assert.equal((await handlers[2].call()).status, 409);
      assert.equal(state.requests.length, 2); assert.equal(new Set(state.requests.map(r => r.key)).size, 2);
      assert.equal(database.sql("SELECT count(*) FROM public.app_settings WHERE key LIKE 'cron:analytics-summary:v1:%';"), '2');
    });
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await database.close(); }
});
