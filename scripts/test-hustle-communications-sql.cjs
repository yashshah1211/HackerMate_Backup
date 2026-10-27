/* eslint-disable @typescript-eslint/no-require-imports -- Disposable, network-isolated local PostgreSQL only. No database URL accepted. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const name = 'hustle-comms-fixture-' + randomUUID();
const env = { ...process.env };
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSERVICE', 'DATABASE_URL', 'SUPABASE_DB_URL']) delete env[key];
const prefix = ['--host=unix:///var/run/docker.sock'];
const docker = (args, input) => execFileSync('docker', [...prefix, ...args], { env, input, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const sqlArgs = ['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-U', 'postgres', '-d', 'hustle_comms_fixture'];
const sql = source => docker(sqlArgs, source);
const sqlAsync = async source => (await promisify(execFile)('docker', [...prefix, ...sqlArgs, '-c', source], { env, encoding: 'utf8', timeout: 30000 })).stdout.trim();
let checks = 0;
function check(condition, label) { assert(condition, label); checks++; }
function fails(source, label) { assert.throws(() => sql(source), undefined, label); checks++; }
const team = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const idFor = n => sql(`SELECT hustle_comms.queue_email('${team(n)}');`);
let started = false;
(async () => {
  try {
    docker(['run', '--detach', '--rm', '--network', 'none', '--name', name, '--label', 'hackermate.fixture=hustle-comms', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=hustle_comms_fixture', 'postgres:17-alpine']);
    started = true;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        // The image briefly exposes a bootstrap server, then shuts it down.
        // Require completed initialization before trusting pg_isready.
        if (!docker(['logs', name]).includes('PostgreSQL init process complete; ready for start up.')) throw Error('Initializing');
        docker(['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'hustle_comms_fixture']); ready = true; break;
      }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert(ready, 'Disposable PostgreSQL did not finish startup');
    const metadata = JSON.parse(docker(['inspect', name]))[0];
    check(metadata.HostConfig.NetworkMode === 'none' && Object.keys(metadata.HostConfig.PortBindings || {}).length === 0, 'Fixture has no network or published ports');
    check(metadata.Config.Labels['hackermate.fixture'] === 'hustle-comms', 'Owned disposable fixture');
    check(sql('SELECT current_database();') === 'hustle_comms_fixture', 'Unique synthetic database, not a connected Supabase');
    sql("COMMENT ON DATABASE hustle_comms_fixture IS 'hustle-comms-disposable-fixture'; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;");
    check(sql("SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database();") === 'hustle-comms-disposable-fixture', 'Fixture marker');
    sql(fs.readFileSync(path.join(ROOT, 'docs/sql/hustle-communications-ledger.sql'), 'utf8'));
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const source of ["SELECT * FROM hustle_comms.email_dispatch;", "SELECT hustle_comms.queue_email('11111111-1111-4111-8111-111111111111');", "SELECT hustle_comms.record_delivery('fixture-provider','msg_fixture',clock_timestamp());", "SELECT * FROM hustle_comms.manual_contact;", "INSERT INTO hustle_comms.daily_allocation(provider_day,max_attempts) VALUES(current_date,100);"]) fails(`SET ROLE ${role}; ${source}`, `${role} cannot read, enqueue, forge delivery or allocate quota`);
    }
    check(sql("SELECT count(*) FROM pg_tables WHERE schemaname='hustle_comms' AND rowsecurity;") === '5', 'All five tables have RLS');
    check(sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='hustle_comms' AND column_name ~ '(email|phone|whatsapp|token|url|body|recipient|leader_name)';") === '0', 'No contacts, bearer tokens, message bodies or URLs persist');
    const first = idFor(1);
    check(first === idFor(1), 'Duplicate enqueue returns existing dispatch');
    check(sql(`SELECT state FROM hustle_comms.email_dispatch WHERE id='${first}';`) === 'queued', 'New dispatch starts queued');
    check(sql(`SELECT count(*) FROM hustle_comms.email_audit WHERE dispatch_id='${first}';`) === '1', 'Duplicate enqueue does not duplicate audit');
    check(sql(`SELECT hustle_comms.claim_email('${first}') IS NULL;`) === 't', 'Missing shared allocation fails closed');
    sql("INSERT INTO hustle_comms.daily_allocation(provider_day,max_attempts,verified_at) VALUES((clock_timestamp() AT TIME ZONE 'UTC')::date,2,clock_timestamp()-interval '11 minutes');");
    check(sql(`SELECT hustle_comms.claim_email('${first}') IS NULL;`) === 't', 'Stale quota evidence fails closed');
    sql("UPDATE hustle_comms.daily_allocation SET verified_at=clock_timestamp();");
    const attempts = await Promise.all(Array.from({ length: 8 }, () => sqlAsync(`SELECT hustle_comms.claim_email('${first}');`)));
    const claims = attempts.filter(Boolean);
    check(claims.length === 1, 'Eight concurrent workers produce exactly one durable claim');
    check(sql('SELECT reserved_attempts FROM hustle_comms.daily_allocation;') === '1', 'Duplicate workers reserve quota exactly once');
    check(sql(`SELECT state FROM hustle_comms.email_dispatch WHERE id='${first}';`) === 'unknown', 'Unknown is durable before any provider result');
    check(sql(`SELECT hustle_comms.claim_email('${first}') IS NULL;`) === 't', 'Worker crash cannot trigger another claim');
    check(sql(`SELECT hustle_comms.record_outcome('${first}','${randomUUID()}','accepted','fixture-wrong');`) === 'f', 'Wrong claim cannot change evidence');
    check(sql(`SELECT hustle_comms.record_outcome('${first}','${claims[0]}','accepted','fixture-provider-1');`) === 't', 'Provider acceptance recorded');
    check(sql(`SELECT state FROM hustle_comms.email_dispatch WHERE id='${first}';`) === 'accepted', 'Acceptance is not delivery or registration confirmation');
    check(sql(`SELECT hustle_comms.record_outcome('${first}','${claims[0]}','rejected',NULL);`) === 'f', 'Late outcome cannot overwrite accepted result');
    const eventAt = sql('SELECT clock_timestamp();');
    check(sql(`SELECT hustle_comms.record_delivery('fixture-provider-1','msg_fixture_1','${eventAt}');`) === 't', 'Verified matching delivery promotes accepted');
    check(sql(`SELECT state FROM hustle_comms.email_dispatch WHERE id='${first}';`) === 'confirmed_delivered', 'Delivered has distinct stored evidence');
    check(sql(`SELECT hustle_comms.record_delivery('fixture-provider-1','msg_fixture_1','${eventAt}');`) === 'f', 'Duplicate delivery is idempotent');
    check(sql(`SELECT count(*) FROM hustle_comms.email_audit WHERE dispatch_id='${first}' AND state='confirmed_delivered';`) === '1', 'Delivery audit not duplicated');
    fails(`SELECT hustle_comms.record_delivery('other-provider','msg_fixture_1','${eventAt}');`, 'Event ID cannot be rebound');
    const second = idFor(2); const secondClaim = sql(`SELECT hustle_comms.claim_email('${second}');`);
    sql(`SELECT hustle_comms.record_delivery('fixture-provider-2','msg_fixture_2','${eventAt}');`);
    check(sql(`SELECT state FROM hustle_comms.email_dispatch WHERE id='${second}';`) === 'unknown', 'Early uncorrelated delivery never claims acceptance');
    sql(`SELECT hustle_comms.record_outcome('${second}','${secondClaim}','accepted','fixture-provider-2');`);
    check(sql(`SELECT state FROM hustle_comms.email_dispatch WHERE id='${second}';`) === 'confirmed_delivered', 'Delivery-before-response reconciles once provider ID is known');
    const third = idFor(3);
    check(sql(`SELECT hustle_comms.claim_email('${third}') IS NULL;`) === 't', 'Exhausted allocation blocks another attempt');
    sql('UPDATE hustle_comms.daily_allocation SET max_attempts=10;');
    const thirdClaim = sql(`SELECT hustle_comms.claim_email('${third}');`);
    sql(`SELECT hustle_comms.record_outcome('${third}','${thirdClaim}','unknown',NULL);`);
    check(sql(`SELECT hustle_comms.claim_email('${third}') IS NULL;`) === 't', 'Recorded unknown outcome cannot be retried');
    const fourth = idFor(4); const fourthClaim = sql(`SELECT hustle_comms.claim_email('${fourth}');`);
    sql(`SELECT hustle_comms.record_outcome('${fourth}','${fourthClaim}','rejected',NULL);`);
    check(sql(`SELECT hustle_comms.claim_email('${fourth}') IS NULL;`) === 't', 'Rejected outcome also requires review, not automatic retry');
    const fifth = idFor(5); const fifthClaim = sql(`SELECT hustle_comms.claim_email('${fifth}');`);
    fails(`SELECT hustle_comms.record_outcome('${fifth}','${fifthClaim}','accepted',NULL);`, 'Acceptance without provider ID rejected');
    fails(`SELECT hustle_comms.record_outcome('${fifth}','${fifthClaim}','confirmed_delivered','fixture-provider');`, 'Worker cannot invent delivered outcome');
    fails(`INSERT INTO hustle_comms.email_dispatch(event_id,team_id) VALUES('${randomUUID()}','${team(90)}');`, 'Ledger cannot cross events');
    fails(`UPDATE hustle_comms.daily_allocation SET max_attempts=101;`, 'Allocation never exceeds existing 100/day cap');
    fails(`SELECT hustle_comms.record_delivery('fixture-provider-future','msg_fixture_future',clock_timestamp()+interval '1 day');`, 'Future-dated evidence rejected');
    const manualId = randomUUID(), actor = randomUUID();
    check(sql(`SELECT hustle_comms.record_manual('${manualId}','${team(1)}','${actor}','chat_opened');`) === 't', 'Manual chat opening recorded as an action only');
    sql(`SELECT hustle_comms.record_manual('${manualId}','${team(1)}','${actor}','chat_opened');`);
    check(sql('SELECT count(*) FROM hustle_comms.manual_contact;') === '1', 'Manual action idempotency');
    fails(`SELECT hustle_comms.record_manual('${manualId}','${team(2)}','${actor}','chat_opened');`, 'Manual action cannot be rebound to another leader');
    fails(`SELECT hustle_comms.record_manual('${randomUUID()}','${team(1)}','${actor}','delivered');`, 'Manual workflow cannot claim delivery');
    check(sql(`SELECT state FROM hustle_comms.email_dispatch WHERE id='${first}';`) === 'confirmed_delivered', 'Manual contact never mutates email evidence');
    // Two independent jobs contend for the last slot: real transaction-level quota serialization.
    const sixth = idFor(6), seventh = idFor(7);
    sql('UPDATE hustle_comms.daily_allocation SET max_attempts=reserved_attempts+1;');
    const contenders = await Promise.all([sixth, seventh].map(id => sqlAsync(`SELECT hustle_comms.claim_email('${id}');`)));
    check(contenders.filter(Boolean).length === 1, 'Concurrent different teams cannot oversubscribe one remaining slot');
    check(sql('SELECT bool_and(reserved_attempts <= max_attempts) FROM hustle_comms.daily_allocation;') === 't', 'Quota invariant preserved');
    console.log(`PASS: ${checks} PostgreSQL privacy/grants/state/idempotency/evidence/quota/concurrency checks; disposable network-isolated container only.`);
  } finally {
    if (started) docker(['rm', '--force', '--volumes', name]);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
