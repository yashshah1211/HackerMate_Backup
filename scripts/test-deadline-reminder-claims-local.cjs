/* eslint-disable @typescript-eslint/no-require-imports -- Fresh loopback PostgreSQL and synthetic HTTP fixtures only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const { createClient } = require('@supabase/supabase-js');
const { createFixture } = require('./admin-hackathon-local-db.cjs');
const { uuid, setupReminder } = require('./deadline-reminder-harness.cjs');

const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const saved = uuid(91), user = uuid(92), event = uuid(93);
const schema = {
  app_settings: ['key', 'value'],
  profiles: ['id', 'email', 'full_name', 'is_banned'],
  hackathons: ['id', 'name', 'status', 'archived', 'registration_start', 'registration_end', 'registration_status'],
  saved_hackathons: ['id', 'user_id', 'hackathon_id', 'reminder_sent_at'],
  daily_email_stats: ['date', 'total_sent', 'notifications_sent', 'outreach_sent', 'nudges_sent', 'updated_at'],
};

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}

test('native deadline reminder claims through independent PostgreSQL sessions and loopback HTTP', async t => {
  const db = await createFixture();
  const servers = [];
  const requests = [], fixtureErrors = [];
  let providerMode, fault, beforeFinal, discoveryGate, databaseConnections = 0;
  const waiters = [];
  async function sql(statement) {
    if (databaseConnections >= 6) await new Promise(resolve => waiters.push(resolve));
    else databaseConnections++;
    try { return await db.asyncSql(statement); }
    finally { if (waiters.length) waiters.shift()(); else databaseConnections--; }
  }

  try {
    db.sql(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.app_settings(key text PRIMARY KEY, value text NOT NULL);
      ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,INSERT,UPDATE ON public.app_settings TO service_role;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, email text, full_name text, is_banned boolean);
      CREATE TABLE public.hackathons(id uuid PRIMARY KEY, name text, status text, archived boolean,
        registration_start timestamptz, registration_end timestamptz, registration_status text);
      CREATE TABLE public.saved_hackathons(id uuid PRIMARY KEY, user_id uuid NOT NULL, hackathon_id uuid NOT NULL,
        UNIQUE(user_id,hackathon_id));
      CREATE TABLE public.hackathon_registrations(id uuid PRIMARY KEY, user_id uuid NOT NULL, hackathon_id uuid NOT NULL);
      CREATE TABLE public.daily_email_stats(date date PRIMARY KEY, total_sent int, notifications_sent int,
        outreach_sent int, nudges_sent int, updated_at timestamptz);
    `);
    db.sql(fs.readFileSync(path.join(db.root, 'supabase/migrations/202607080006_saved_hackathons_reminder.sql'), 'utf8'));
    db.sql(`
      REVOKE ALL ON FUNCTION public.get_pending_deadline_reminders(), public.mark_deadline_reminder_sent(uuid[])
        FROM PUBLIC, anon, authenticated;
      ALTER FUNCTION public.get_pending_deadline_reminders() SET search_path = public, pg_temp;
      GRANT EXECUTE ON FUNCTION public.get_pending_deadline_reminders() TO service_role;
      GRANT SELECT ON public.profiles, public.hackathons TO service_role;
      GRANT SELECT,UPDATE ON public.saved_hackathons, public.daily_email_stats TO service_role;
    `);

    // The route runs the installed Supabase client. This loopback REST adapter
    // validates its filters and representation request and executes them in psql.
    // It is not a live PostgREST server.
    const rest = await listen(async (req, res) => {
      const send = (status, data) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      try {
        assert.equal(req.headers.authorization, 'Bearer synthetic-service');
        const url = new URL(req.url, 'http://127.0.0.1');
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const payload = raw ? JSON.parse(raw) : null;
        let statement, phase;
        if (url.pathname === '/rest/v1/rpc/get_pending_deadline_reminders') {
          assert.equal(req.method, 'POST');
          const savedFilter = url.searchParams.get('saved_id');
          const final = savedFilter?.startsWith('eq.');
          if (final) {
            assert.equal(url.searchParams.get('limit'), '2');
            assert.match(savedFilter, /^eq\.[a-f0-9-]{36}$/);
            await beforeFinal?.();
          } else {
            if (savedFilter) assert.match(savedFilter, /^gt\.[a-f0-9-]{36}$/);
            assert.equal(url.searchParams.get('limit'), '100');
            assert.equal(url.searchParams.get('order'), 'saved_id.asc');
          }
          statement = 'SELECT * FROM public.get_pending_deadline_reminders()' +
            (savedFilter ? ' WHERE saved_id' + (final ? '=' : '>') + quote(savedFilter.slice(3)) : '') +
            (final ? ' LIMIT 2' : ' ORDER BY saved_id ASC LIMIT 100');
          phase = final ? 'revalidation' : savedFilter ? 'discovery-page' : 'discovery';
        } else {
          const table = url.pathname.replace('/rest/v1/', '');
          assert(Object.hasOwn(schema, table));
          const columns = url.searchParams.get('select')?.split(',') || [];
          assert(columns.length && columns.every(c => c === '*' ? table === 'daily_email_stats' : schema[table].includes(c)));
          const filters = [];
          for (const [column, filter] of url.searchParams) {
            if (column === 'select') continue;
            assert(schema[table].includes(column));
            assert(filter.startsWith('eq.') || filter === 'is.null');
            filters.push(filter === 'is.null' ? column + ' IS NULL' : column + '=' + quote(filter.slice(3)));
          }
          if (req.method === 'GET') {
            assert(filters.length);
            statement = `SELECT ${columns} FROM public.${table} WHERE ${filters.join(' AND ')}`;
          } else {
            assert.match(req.headers.prefer, /return=representation/);
            assert(payload && Object.keys(payload).every(k => schema[table].includes(k)));
            if (req.method === 'POST') {
              assert.equal(table, 'app_settings');
              assert.deepEqual(Object.keys(payload).sort(), ['key', 'value']);
              statement = `INSERT INTO public.app_settings (key,value) VALUES (${quote(payload.key)},${quote(payload.value)}) RETURNING ${columns}`;
            } else {
              assert.equal(req.method, 'PATCH');
              if (table === 'app_settings') assert.deepEqual([...url.searchParams.keys()].sort(), ['key', 'select', 'value']);
              if (table === 'saved_hackathons') {
                assert.deepEqual([...url.searchParams.keys()].sort(), ['hackathon_id', 'id', 'reminder_sent_at', 'select', 'user_id']);
                assert.equal(url.searchParams.get('reminder_sent_at'), 'is.null');
              }
              assert(filters.length);
              const updates = Object.entries(payload).map(([key, value]) => key + '=' + quote(value));
              statement = `UPDATE public.${table} SET ${updates} WHERE ${filters.join(' AND ')} RETURNING ${columns}`;
            }
            phase = table === 'app_settings' ? JSON.parse(payload.value).status : table;
          }
        }
        if (fault === phase && phase) return send(403, { code: '42501', message: 'synthetic database failure' });
        let result;
        try {
          result = await sql(`SET ROLE service_role; WITH rows AS (${statement}) SELECT coalesce(json_agg(rows),'[]') FROM rows;`);
        } catch (error) {
          const code = /23505/.test(error.message) ? '23505' : /42501/.test(error.message) ? '42501' : null;
          if (code) return send(code === '23505' ? 409 : 403, { code, message: 'synthetic database fault' });
          throw error;
        }
        if (discoveryGate && phase === 'discovery') await discoveryGate(JSON.parse(result));
        if (fault === phase + '-lost') return res.destroy();
        send(req.method === 'POST' ? 201 : 200, JSON.parse(result));
      } catch (error) {
        fixtureErrors.push(error);
        send(500, { code: 'PGRST000', message: 'synthetic fixture error' });
      }
    });
    servers.push(rest.server);

    const provider = await listen(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      requests.push({ url: req.url, method: req.method, key: req.headers['idempotency-key'], payload: JSON.parse(raw) });
      if (providerMode === 'lost') return res.destroy();
      if (providerMode === 'redirect') {
        res.writeHead(307, { Location: '/replay' });
        return res.end();
      }
      const status = typeof providerMode === 'number' ? providerMode : 201;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(status === 201 ? { id: 'synthetic-http-' + requests.length } : { error: 'synthetic' }));
    });
    servers.push(provider.server);

    const handlers = Array.from({ length: 3 }, () => setupReminder({
      db: createClient(rest.url, 'synthetic-service', { auth: { persistSession: false, autoRefreshToken: false } }),
      now: () => Date.now(),
      provider: options => fetch(provider.url + '/emails', options),
    }));
    const run = async (n = 0) => (await handlers[n % 3].call()).json();
    const claim = () => JSON.parse(db.sql("SELECT value FROM public.app_settings WHERE key LIKE 'cron:deadline-reminder:v1:%'"));
    function reset() {
      requests.length = 0;
      providerMode = fault = beforeFinal = discoveryGate = undefined;
      db.sql(`
        TRUNCATE public.app_settings, public.profiles, public.hackathons, public.saved_hackathons,
          public.hackathon_registrations, public.daily_email_stats;
        INSERT INTO public.profiles VALUES ('${user}','builder@example.invalid','Synthetic builder',false);
        INSERT INTO public.hackathons VALUES ('${event}','Synthetic event','approved',false,now()-interval '1 hour',now()+interval '8 hours','open');
        INSERT INTO public.saved_hackathons(id,user_id,hackathon_id) VALUES ('${saved}','${user}','${event}');
        INSERT INTO public.daily_email_stats VALUES ((now() AT TIME ZONE 'UTC')::date,0,0,0,0,now());
        INSERT INTO public.app_settings VALUES ('cron:analytics-summary:v1:2026-11-07','legacy');
      `);
    }

    await t.test('24 simultaneous discoveries in three handlers produce exactly one provider HTTP request', async () => {
      reset();
      let arrivals = 0, release;
      const barrier = new Promise(resolve => { release = resolve; });
      discoveryGate = rows => {
        assert.equal(rows.length, 1);
        if (++arrivals === 24) release();
        return barrier;
      };
      const outcomes = await Promise.all(Array.from({ length: 24 }, (_, n) => run(n)));
      discoveryGate = undefined;
      assert.equal(arrivals, 24);
      assert.equal(outcomes.reduce((total, r) => total + r.sentCount, 0), 1);
      assert.equal(outcomes.reduce((total, r) => total + r.duplicates, 0), 23);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].method, 'POST');
      assert.equal(requests[0].url, '/emails');
      assert.match(requests[0].key, /^hm-deadline-reminder\/v1\/[a-f0-9]{64}$/);
      assert.equal(claim().status, 'accepted');
      assert.equal(claim().providerId, 'synthetic-http-1');
      assert.equal(db.sql("SELECT reminder_sent_at IS NOT NULL FROM public.saved_hackathons"), 't');
      assert.equal(db.sql("SELECT notifications_sent FROM public.daily_email_stats"), '1');
      const winner = claim();
      db.sql(`UPDATE public.saved_hackathons SET id='${uuid(101)}', reminder_sent_at=NULL`);
      assert.equal((await run(1)).duplicates, 1);
      assert.deepEqual(claim(), winner);
      assert.equal(requests.length, 1);
      db.sql("UPDATE public.hackathons SET registration_end=registration_end+interval '1 hour'");
      assert.equal((await run(2)).sentCount, 1);
      assert.equal(requests.length, 2);
      assert.notEqual(requests[0].key, requests[1].key);
      assert.equal(db.sql("SELECT value FROM public.app_settings WHERE key='cron:analytics-summary:v1:2026-11-07'"), 'legacy');
    });

    for (const state of ['claimed', 'dispatching']) await t.test(`lost ${state} receipt leaves a durable hold with zero HTTP calls`, async () => {
      reset();
      fault = state + '-lost';
      assert.equal((await run()).infrastructureFailures, 1);
      assert.equal(claim().status, state);
      fault = undefined;
      assert.equal((await run(1)).duplicates, 1);
      assert.equal(requests.length, 0);
    });

    await t.test('registration committed after arming is visible to the final database query', async () => {
      reset();
      beforeFinal = async () => {
        assert.equal(claim().status, 'dispatching');
        await sql(`INSERT INTO public.hackathon_registrations VALUES ('${uuid(111)}','${user}','${event}')`);
      };
      const result = await run();
      assert.equal(result.suppressed, 1);
      assert.equal(claim().status, 'suppressed');
      assert.equal(requests.length, 0);
    });

    for (const mode of ['lost', 'redirect', 429, 503]) await t.test(`provider ${mode} remains held without a second HTTP call`, async () => {
      reset();
      providerMode = mode;
      assert.equal((await run()).unknownCount, 1);
      assert.equal(claim().status, 'unknown');
      assert.equal((await run(1)).duplicates, 1);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, '/emails');
    });

    for (const failed of ['accepted', 'saved_hackathons', 'daily_email_stats']) await t.test(`${failed} persistence failure cannot reopen an accepted reminder`, async () => {
      reset();
      fault = failed;
      const result = await run();
      assert.equal(result.accepted, 1);
      assert.equal(result.success, false);
      if (failed === 'accepted') assert.equal(result.journalFailures, 1);
      if (failed === 'saved_hackathons') assert.equal(result.completionFailures, 1);
      if (failed === 'daily_email_stats') assert.equal(result.accounting.status, 'failed');
      fault = undefined;
      db.sql(`UPDATE public.saved_hackathons SET id='${uuid(101)}', reminder_sent_at=NULL`);
      assert.equal((await run(2)).duplicates, 1);
      assert.equal(requests.length, 1);
    });

    await t.test('database denies non-service access and denied service INSERT blocks provider contact', async () => {
      reset();
      assert.equal(db.sql("SELECT has_function_privilege('anon','public.get_pending_deadline_reminders()','EXECUTE') OR has_function_privilege('authenticated','public.get_pending_deadline_reminders()','EXECUTE')"), 'f');
      assert.equal(db.sql("SELECT has_table_privilege('authenticated','public.app_settings','SELECT')"), 'f');
      db.sql('REVOKE INSERT ON public.app_settings FROM service_role');
      try {
        assert.equal((await run()).infrastructureFailures, 1);
        assert.equal(requests.length, 0);
      } finally { db.sql('GRANT INSERT ON public.app_settings TO service_role'); }
    });

    await t.test('a different owner cannot update the winner through the production helper', async () => {
      reset();
      const fixture = handlers[0];
      const helper = fixture.h.load('src/lib/admin/deadlineReminderClaims.ts');
      const deadline = db.sql("SELECT to_char(registration_end AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') FROM public.hackathons");
      const identity = helper.reminderIdentity({ saved_id: saved, user_id: user, hackathon_id: event, registration_end: deadline });
      const reservation = await helper.claimDeadlineReminder(fixture.db, identity);
      assert.equal(reservation.status, 'acquired');
      const forged = { ...reservation.claim, value: JSON.stringify({ ...reservation.claim.evidence, attemptId: uuid(201) }) };
      assert.equal(await helper.transitionDeadlineReminder(fixture.db, forged, { status: 'dispatching', payloadHash: '0'.repeat(64) }), null);
      assert.equal(claim().attemptId, reservation.claim.evidence.attemptId);
      assert.equal(claim().status, 'claimed');
    });
    assert.deepEqual(fixtureErrors, []);
  } finally {
    try { await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve)))); }
    finally { await db.close(); }
  }
});
