/* eslint-disable @typescript-eslint/no-require-imports -- Real migration and route, disposable loopback PostgreSQL only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHmac } = require('node:crypto');
const { test } = require('node:test');
const { NextRequest, NextResponse } = require('next/server');
const { createFixture } = require('./hustle-phase2-local-db.cjs');
const { harness } = require('./ppt-vision-harness.cjs');

const ID = '00000000-0000-4000-8000-000000000091';
const MISSING = '00000000-0000-4000-8000-000000000099';
const SECRET = 'ab'.repeat(32);

test('authenticated tracking route and atomic SQL behavior in isolated PostgreSQL', async t => {
  const db = await createFixture();
  try {
    db.sql(`CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;`);
    for (const name of ['202607210001_organizer_leads.sql', '202607240001_add_open_tracking_to_organizer_leads.sql', '202607240002_add_last_sent_to_organizer_leads.sql']) {
      db.sql(fs.readFileSync(path.join(db.ROOT, 'supabase/migrations', name), 'utf8'));
    }
    db.sql('GRANT SELECT, UPDATE ON organizer_leads TO service_role;');
    const migration = fs.readdirSync(path.join(db.ROOT, 'supabase/migrations')).find(name => name.endsWith('_signed_organizer_email_open.sql'));
    assert(migration, 'Security migration must exist');
    db.sql(fs.readFileSync(path.join(db.ROOT, 'supabase/migrations', migration), 'utf8'));
    const reset = (status, sent = true) => db.sql(`DELETE FROM organizer_leads;
      INSERT INTO organizer_leads(id,title,unstop_url,status,open_count,opened_at,updated_at,pitch_sent_at)
      VALUES('${ID}','Synthetic tracking fixture','https://event.example.invalid','${status}',0,NULL,'2000-01-01Z',${sent ? "'2000-01-01Z'" : 'NULL'});`);
    const snapshot = () => db.sql(`SELECT row_to_json(l) FROM organizer_leads l WHERE id='${ID}';`);
    let calls = 0;
    const logs = [];
    const h = harness({
      'next/server': { NextRequest, NextResponse },
      '@supabase/supabase-js': { createClient: () => ({ async rpc(name, args) {
        assert.equal(name, 'record_organizer_email_open');
        assert.match(args.p_lead_id, /^[0-9a-f-]{36}$/);
        calls++;
        await db.asyncSql(`SET ROLE service_role; SELECT public.record_organizer_email_open('${args.p_lead_id}'::uuid);`);
        return { data: null, error: null };
      } }) },
    }, { console: { error: (...args) => logs.push(args) } });
    h.env.EMAIL_OPEN_TRACKING_SECRET = SECRET;
    const call = (id = ID, signed = true) => h.load('src/app/api/webhooks/email-open/route.ts').GET(new NextRequest(
      `https://tracking.example.invalid/api/webhooks/email-open?id=${id}${signed ? '&sig=' + createHmac('sha256', Buffer.from(SECRET, 'hex')).update(`hackermate:email-open:v1:${id}`).digest('hex') : ''}`));

    await t.test('only service_role can execute; no security definer or row data return', () => {
      for (const role of ['anon', 'authenticated']) {
        assert.equal(db.sql(`SELECT has_function_privilege('${role}','public.record_organizer_email_open(uuid)','EXECUTE');`), 'f');
        assert.throws(() => db.sql(`SET ROLE ${role}; SELECT public.record_organizer_email_open('${ID}');`), /permission denied for function/);
      }
      assert.equal(db.sql(`SELECT has_function_privilege('service_role','public.record_organizer_email_open(uuid)','EXECUTE');`), 't');
      assert.equal(db.sql(`SELECT NOT prosecdef AND prorettype='void'::regtype AND proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid='public.record_organizer_email_open(uuid)'::regprocedure;`), 't');
    });
    await t.test('signed requests preserve active CRM transitions and latest-open timestamps', async () => {
      for (const status of ['new', 'pitch_sent', 'opened', 'replied', 'negotiating', 'partner_live']) {
        reset(status); const response = await call(); assert.equal(response.status, 200);
        const row = JSON.parse(snapshot());
        assert.equal(row.status, ['new', 'pitch_sent'].includes(status) ? 'opened' : status);
        assert.equal(row.open_count, 1); assert(row.opened_at); assert.notEqual(row.updated_at, '2000-01-01T00:00:00+00:00');
        assert.equal(db.sql(`SELECT opened_at=updated_at FROM organizer_leads;`), 't');
      }
      reset('opened'); db.sql(`UPDATE organizer_leads SET open_count=NULL,opened_at='2000-01-01Z';`);
      await call(); assert.equal(JSON.parse(snapshot()).open_count, 1);
      assert.equal(db.sql(`SELECT opened_at>'2000-01-01Z'::timestamptz FROM organizer_leads;`), 't');
    });
    await t.test('early prefetch must not prevent real dispatch bookkeeping for a never-contacted lead', async () => {
      reset('new', false);
      const before = snapshot();
      await call();
      assert.equal(snapshot(), before, 'No persisted send evidence: even an authenticated pixel must not mutate this lead');
      const recorded = db.sql(`WITH changed AS (
        UPDATE organizer_leads SET status='pitch_sent',pitch_sent_at=now(),last_sent_to='organizer@example.invalid'
        WHERE id='${ID}' AND status='new' AND pitch_sent_at IS NULL RETURNING id
      ) SELECT count(*) FROM changed;`);
      assert.equal(recorded, '1', 'Sender status CAS must succeed after early image fetch');
      await call();
      const row = JSON.parse(snapshot());
      assert.equal(row.status, 'opened'); assert.equal(row.open_count, 1);
      assert(row.pitch_sent_at); assert.equal(row.last_sent_to, 'organizer@example.invalid');
    });
    await t.test('never-contacted records remain unchanged in every active status', async () => {
      for (const status of ['new', 'pitch_sent', 'opened', 'replied', 'negotiating', 'partner_live']) {
        reset(status, false); const before = snapshot(); await call(); assert.equal(snapshot(), before);
      }
    });
    await t.test('both real senders retain contact evidence when a proxy fetches before provider acceptance', async () => {
      // Query adapter enforces actual sender predicates in PostgreSQL, unlike the
      // broader provider mock. It accepts only this disposable fixture's table.
      const sqlClient = { from(table) {
        assert.equal(table, 'organizer_leads');
        const filters = []; let payload, single = false, range;
        const column = value => { assert.match(value, /^[a-z_]+$/); return value; };
        const q = {
          select() { return q; }, order() { return q; },
          eq(key, value) { filters.push(`${column(key)}=${db.quote(value)}`); return q; },
          is(key, value) { assert.equal(value, null); filters.push(`${column(key)} IS NULL`); return q; },
          not(key, op, value) { assert.equal(op, 'is'); assert.equal(value, null); filters.push(`${column(key)} IS NOT NULL`); return q; },
          or(value) { assert.equal(value, 'pitch_sent_at.not.is.null,last_sent_to.not.is.null,status.eq.email_outcome_unknown'); filters.push("(pitch_sent_at IS NOT NULL OR last_sent_to IS NOT NULL OR status='email_outcome_unknown')"); return q; },
          range(a, b) { range = [a, b]; return q; },
          maybeSingle() { single = true; return q; },
          update(value) { payload = value; return q; },
          then(resolve, reject) {
            const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
            const sql = payload
              ? `WITH result AS (UPDATE organizer_leads SET ${Object.entries(payload).map(([k, v]) => `${column(k)}=${db.quote(v)}`).join(',')}${where} RETURNING id) SELECT COALESCE(jsonb_agg(result),'[]') FROM result;`
              : `SELECT COALESCE(jsonb_agg(result),'[]') FROM (SELECT * FROM organizer_leads${where} ORDER BY id${range ? ` LIMIT ${range[1] - range[0] + 1} OFFSET ${range[0]}` : ''}) result;`;
            return db.asyncSql(sql).then(output => {
              const rows = JSON.parse(output); return { data: single ? rows[0] || null : rows, error: null };
            }).then(resolve, reject);
          },
        }; return q;
      } };
      const realDispatch = h.load('src/lib/emailDispatch.ts');
      for (const mode of ['manual', 'automatic']) {
        reset('new', false); db.sql("UPDATE organizer_leads SET organizer_email='organizer@example.invalid';");
        let attempts = 0;
        const sender = harness({
          'next/server': { NextRequest, NextResponse },
          '@/lib/admin/requireOutreachAdmin': { requireOutreachAdmin: async () => ({ supabaseAdmin: sqlClient }) },
          '@/lib/admin/emailBudgetGuard': { checkEmailBudget: async () => ({ allowedCount: 1 }), recordEmailSendSuccess: async () => ({ status: 'recorded' }) },
          '@/lib/emailDispatch': { ...realDispatch, dispatchEmail: async payload => {
            attempts++; assert.equal(payload.to, 'organizer@example.invalid');
            const pixelUrl = new URL(payload.html.match(/<img src="([^"]+)"/)[1].replaceAll('&amp;', '&'));
            await h.load('src/app/api/webhooks/email-open/route.ts').GET(new NextRequest(pixelUrl));
            return { status: 'accepted', attempted: true, intendedRecipientAccepted: true, sandbox: false, providerId: 'synthetic-prefetch-receipt', reason: 'Synthetic receipt', retrySafe: false };
          } },
        });
        Object.assign(sender.env, { EMAIL_OPEN_TRACKING_SECRET: SECRET, RESEND_FROM_EMAIL: 'sender@example.invalid' });
        if (mode === 'manual') {
          const response = await sender.load('src/app/api/admin/send-organizer-pitch/route.ts').POST(new NextRequest('http://localhost/api/admin/send-organizer-pitch', {
            method: 'POST', body: JSON.stringify({ leadId: ID, recipientEmail: 'organizer@example.invalid', subject: 'Synthetic', contentHtml: '<p>Synthetic</p>' }),
          }));
          assert.equal((await response.json()).bookkeeping, 'recorded');
        } else {
          const result = await sender.load('src/lib/admin/autoSendPitches.ts').autoSendPitchEmailsForLeads(sqlClient);
          assert.equal(result.bookkeepingFailed, 0); assert.equal(result.sent, 1);
        }
        assert.equal(attempts, 1);
        let row = JSON.parse(snapshot()); assert.equal(row.status, 'pitch_sent'); assert(row.pitch_sent_at);
        assert.equal(row.last_sent_to, 'organizer@example.invalid'); assert.equal(row.open_count, 0);
        await call(); row = JSON.parse(snapshot()); assert.equal(row.status, 'opened'); assert.equal(row.open_count, 1);
      }
      // A legacy unsigned open must not turn durable sent history into a fresh
      // contact, including an owner-restored new row and duplicate CRM entries.
      for (const status of ['pitch_sent', 'removed', 'new']) for (const sent of [true, false]) {
        reset(status, sent);
        db.sql(`UPDATE organizer_leads SET organizer_email='organizer@example.invalid',last_sent_to='organizer@example.invalid',unstop_url='https://unstop.com/competitions/synthetic-old';
          INSERT INTO organizer_leads(id,title,unstop_url,organizer_email,status,notes)
          VALUES('${MISSING}','Synthetic duplicate','https://unstop.com/competitions/synthetic-new','organizer@example.invalid','new','[HACKERMATE_OUTREACH_APPROVED_V1]');`);
        const before = snapshot(); await call(ID, false); assert.equal(snapshot(), before);
        const sender = harness({ '@/lib/emailDispatch': { dispatchEmail: async () => { throw new Error('Previously contacted recipient must not be sent again'); } },
          '@/lib/admin/emailBudgetGuard': { checkEmailBudget: async () => { throw new Error('No eligible recipient: budget must not be consumed'); } } });
        const automatic = await sender.load('src/lib/admin/autoSendPitches.ts').autoSendPitchEmailsForLeads(sqlClient);
        assert.equal(automatic.attempted, 0); assert.equal(automatic.blocked, undefined);
        assert.equal((await sender.load('src/lib/admin/scheduledOrganizerOutreach.ts').runScheduledOrganizerOutreach(sqlClient)).status, 'no_eligible');
        assert.equal(snapshot(), before);
      }
    });
    await t.test('removed, archived, held, null and unknown statuses are completely unchanged', async () => {
      for (const status of ['removed', 'archived', 'no_email', 'email_outcome_unknown', 'suppressed', 'future_status']) {
        reset(status); const before = snapshot(); await call(); assert.equal(snapshot(), before);
      }
      db.sql('UPDATE organizer_leads SET status=NULL;'); const before = snapshot();
      await call(); assert.equal(snapshot(), before);
    });
    await t.test('unsigned request cannot write; nonexistent signed lead is an indistinguishable no-op', async () => {
      reset('pitch_sent'); const before = snapshot(); const beforeCalls = calls;
      const unsigned = await call(ID, false); assert.equal(calls, beforeCalls); assert.equal(snapshot(), before);
      const missing = await call(MISSING); assert.equal(snapshot(), before);
      assert.deepEqual(Buffer.from(await unsigned.arrayBuffer()), Buffer.from(await missing.arrayBuffer()));
      assert.equal(missing.headers.get('cache-control'), unsigned.headers.get('cache-control'));
    });
    await t.test('concurrent route requests and database increments never lose counts', async () => {
      reset('pitch_sent'); await Promise.all(Array.from({ length: 8 }, () => call()));
      await Promise.all(Array.from({ length: 8 }, () => db.asyncSql(`SET ROLE service_role;
        SELECT public.record_organizer_email_open('${ID}') FROM generate_series(1,10);`)));
      assert.equal(JSON.parse(snapshot()).open_count, 88); assert.equal(JSON.parse(snapshot()).status, 'opened');
    });
    await t.test('a concurrent suppression rechecks the status after waiting for the row lock', async () => {
      reset('pitch_sent');
      const suppression = db.asyncSql(`SET application_name='hm_email_open_suppression_fixture'; BEGIN;
        UPDATE organizer_leads SET status='removed' WHERE id='${ID}'; SELECT pg_sleep(1); COMMIT;`);
      try {
        const deadline = Date.now() + 5000;
        while (db.sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name='hm_email_open_suppression_fixture' AND wait_event='PgSleep';`) !== '1') {
          assert(Date.now() < deadline, 'Suppression transaction must acquire row lock');
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        await call(); await suppression;
        const row = JSON.parse(snapshot()); assert.equal(row.status, 'removed'); assert.equal(row.open_count, 0); assert.equal(row.opened_at, null);
      } finally { await suppression; }
    });
    assert.deepEqual(logs, [], 'Real SQL failures must not be hidden by the GIF response');
  } finally { await db.close(); }
});
