/* eslint-disable @typescript-eslint/no-require-imports -- Fresh localhost cluster, synthetic IDs, unconditional finally cleanup. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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
    const outcome = (status, attempted) => ({ status, attempted, sandbox: false, intendedRecipientAccepted: status === 'accepted', retrySafe: false, reason: 'Synthetic',
      ...(status === 'accepted' ? { providerId: 'synthetic-provider-receipt', providerStatus: 200 } : {}) });
    const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
    const claims = await Promise.all([claim(client, id(31)), claim(client, id(31)), claim(client, id(31))]);
    check(claims.filter(row => row.status === 'reserved').length === 1, 'one concurrent first writer');
    check(claims.filter(row => row.status === 'duplicate').length === 2, 'two concurrent duplicates');
    const winner = claims.find(row => row.status === 'reserved');
    check(await finish(client, winner, outcome('accepted', true)) === 'recorded', 'acceptance stored');
    check((await claim(client, id(31))).status === 'duplicate', 'acceptance permanently prevents resend');
    const ambiguous = await claim(client, id(32));
    check(await finish(client, ambiguous, outcome('unknown', true)) === 'recorded', 'unknown outcome stored');
    check((await claim(client, id(32))).status === 'duplicate', 'unknown outcome permanently prevents resend');
    const neverAttempted = await claim(client, id(33));
    check(await finish(client, neverAttempted, outcome('not_dispatched', false)) === 'recorded', 'never-attempted claim released');
    const replacement = await claim(client, id(33));
    check(replacement.status === 'reserved', 'configuration recovery can reserve');
    check(await finish(client, neverAttempted, outcome('not_dispatched', false)) === 'failed', 'old reservation cannot delete new owner');
    check((await claim(client, id(33))).status === 'duplicate', 'new reservation survived stale release');

    // A genuinely terminated Node worker cannot release its committed reservation.
    // A fresh helper VM then sees only durable PostgreSQL state.
    const crashWorker = `
      const assert = require('node:assert/strict');
      const { spawnSync } = require('node:child_process');
      const { harness } = require('./scripts/ppt-vision-harness.cjs');
      const { quote } = require('./scripts/hustle-phase2-local-db.cjs');
      const config = JSON.parse(process.argv[1]);
      function sql(input) {
        const result = spawnSync(config.psql, ['-h','127.0.0.1','-p',String(config.port),'-U','fixture_owner','-d','hustle_phase2_fixture','-X','-w','-At','-v','ON_ERROR_STOP=1'],
          { input, encoding: 'utf8', windowsHide: true });
        assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
      }
      assert.equal(sql("SELECT current_setting('hm.fixture_only')='hustle-phase2'"), 't');
      const client = { from(table) { assert.equal(table, 'app_settings'); return { async insert(row) {
        sql('SET ROLE service_role; INSERT INTO app_settings(key,value) VALUES('+quote(row.key)+','+quote(row.value)+');');
        return { error: null };
      } }; } };
      harness().load('src/lib/notificationEmailClaim.ts').claimNotificationEmail(client, config.id).then(result => {
        assert.equal(result.status, 'reserved'); process.exit(42);
      }).catch(error => { console.error(error); process.exit(1); });
    `;
    const workerEnv = {};
    for (const name of ['SystemRoot','WINDIR','PATH','TEMP','TMP']) if (process.env[name]) workerEnv[name] = process.env[name];
    const bin = process.env.PARTNER_TEST_PG_BIN || (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '');
    const worker = spawnSync(process.execPath, ['-e', crashWorker, JSON.stringify({ port: db.port, id: id(34), psql: path.join(bin, process.platform === 'win32' ? 'psql.exe' : 'psql') })],
      { cwd: ROOT, env: workerEnv, encoding: 'utf8', windowsHide: true, timeout: 20000 });
    check(worker.status === 42, 'Node worker terminated immediately after durable reservation: ' + worker.stderr);
    check((await harness().load('src/lib/notificationEmailClaim.ts').claimNotificationEmail(client, id(34))).status === 'duplicate', 'fresh handler cannot resend after worker loss');
    const persisted = JSON.parse(db.sql(`SELECT value FROM app_settings WHERE key=${quote('notification:email:' + id(31))};`));
    check(persisted.providerId === 'synthetic-provider-receipt' && persisted.nonce === winner.nonce && persisted.reservedAt === winner.reservedAt, 'receipt and reservation identity survive real SQL persistence');
    db.sql('REVOKE UPDATE ON app_settings FROM service_role;');
    check(await finish(client, replacement, outcome('accepted', true)) === 'failed', 'outcome permission failure visible');
    check((await claim(client, id(33))).status === 'duplicate', 'persistence failure cannot reauthorize send');
    console.log(`Native PostgreSQL: ${checks} notification reservation assertions passed; synthetic cluster only.`);
  } finally { await db.close(); }
});
