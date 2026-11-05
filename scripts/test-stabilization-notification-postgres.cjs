/* eslint-disable @typescript-eslint/no-require-imports -- Fresh localhost cluster, synthetic IDs, unconditional finally cleanup. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createFixture, quote } = require('./hustle-phase2-local-db.cjs');
const { harness, ROOT } = require('./ppt-vision-harness.cjs');

test('notification reservation uses actual PostgreSQL PK, concurrent INSERT, durable outcomes and conditional release', async () => {
  const db = await createFixture();
  let checks = 0;
  const check = (value, label) => { assert(value, label); checks++; };
  try {
    const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/202607080005_offline_email_notifications.sql'), 'utf8');
    const ddl = migration.match(/CREATE TABLE IF NOT EXISTS public\.app_settings \([\s\S]*?\);/)?.[0];
    assert(ddl, 'Use the existing table DDL, without secret/default seed data');
    db.sql(ddl + '\nALTER TABLE app_settings ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON app_settings TO service_role;');
    const client = { from(table) {
      assert.equal(table, 'app_settings'); let op, payload; const filters = [];
      return { insert(value) { op = 'insert'; payload = value; return this; }, update(value) { op = 'update'; payload = value; return this; },
        delete() { op = 'delete'; return this; }, eq(...args) { filters.push(args); return this; }, select() { return this; },
        then(resolve, reject) {
          assert(filters.every(([key]) => ['key', 'value'].includes(key)));
          const where = filters.map(([key, value]) => `${key}=${quote(value)}`).join(' AND ');
          const statement = op === 'insert' ? `INSERT INTO app_settings(key,value) VALUES(${quote(payload.key)},${quote(payload.value)}) RETURNING key;`
            : op === 'update' ? `UPDATE app_settings SET value=${quote(payload.value)} WHERE ${where} RETURNING key;`
              : `DELETE FROM app_settings WHERE ${where} RETURNING key;`;
          return db.asyncSql('\\set VERBOSITY verbose\nSET ROLE service_role; ' + statement)
            .then(output => ({ data: output.split(/\r?\n/).filter(line => line.startsWith('notification:email:')).map(key => ({ key })), error: null }),
              error => ({ data: null, error: { code: error.message.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1] || 'fixture_error', message: 'Synthetic PostgreSQL operation failed' } }))
            .then(resolve, reject);
        },
      };
    } };
    const { claimNotificationEmail: claim, finishNotificationEmail: finish } = harness().load('src/lib/notificationEmailClaim.ts');
    const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const claims = await Promise.all([claim(client, id(31)), claim(client, id(31)), claim(client, id(31))]);
    check(claims.filter(row => row.status === 'reserved').length === 1, 'one concurrent first writer');
    check(claims.filter(row => row.status === 'duplicate').length === 2, 'two concurrent duplicates');
    const winner = claims.find(row => row.status === 'reserved');
    check(await finish(client, winner, 'accepted', true) === 'recorded', 'acceptance stored');
    check((await claim(client, id(31))).status === 'duplicate', 'acceptance permanently prevents resend');
    const ambiguous = await claim(client, id(32));
    check(await finish(client, ambiguous, 'unknown', true) === 'recorded', 'unknown outcome stored');
    check((await claim(client, id(32))).status === 'duplicate', 'unknown outcome permanently prevents resend');
    const neverAttempted = await claim(client, id(33));
    check(await finish(client, neverAttempted, 'not_dispatched', false) === 'recorded', 'never-attempted claim released');
    const replacement = await claim(client, id(33));
    check(replacement.status === 'reserved', 'configuration recovery can reserve');
    check(await finish(client, neverAttempted, 'not_dispatched', false) === 'failed', 'old reservation cannot delete new owner');
    check((await claim(client, id(33))).status === 'duplicate', 'new reservation survived stale release');
    db.sql('REVOKE UPDATE ON app_settings FROM service_role;');
    check(await finish(client, replacement, 'accepted', true) === 'failed', 'outcome permission failure visible');
    check((await claim(client, id(33))).status === 'duplicate', 'persistence failure cannot reauthorize send');
    console.log(`Native PostgreSQL: ${checks} notification reservation assertions passed; synthetic cluster only.`);
  } finally { await db.close(); }
});
