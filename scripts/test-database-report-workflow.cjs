/* eslint-disable @typescript-eslint/no-require-imports -- Offline shell workflow tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const workflow = readFileSync(join(__dirname, '../.github/workflows/daily-database-report.yml'), 'utf8');
const marker = '        run: |\n';
assert.equal(workflow.split(marker).length, 2);
// Execute the actual workflow shell, replacing curl with a local fixture only.
const script = workflow.split(marker)[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
const accepted = { success: true, dispatch: { status: 'accepted', attempted: true, intendedRecipientAccepted: true, sandbox: false } };
const sensitive = 'synthetic-private-response-marker';

function run({ body = JSON.stringify(accepted), status = '200', curlExit = 0, site = 'https://www.hackermate.in', ok = false, expectCurl = true }) {
  const dir = mkdtempSync(join(tmpdir(), 'database-report-workflow-'));
  try {
    writeFileSync(join(dir, 'body'), body);
    writeFileSync(join(dir, 'curl'), `#!/bin/bash
printf '%s\\n' "$@" > "$FIXTURE_DIR/args"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then cp "$FIXTURE_DIR/body" "$2"; shift; fi
  shift
done
printf '%s' "$FIXTURE_STATUS"
exit "$FIXTURE_EXIT"
`, { mode: 0o700 });
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {
      encoding: 'utf8', timeout: 5000,
      env: { PATH: `${dir}:${process.env.PATH}`, TMPDIR: dir, FIXTURE_DIR: dir,
        FIXTURE_STATUS: status, FIXTURE_EXIT: String(curlExit), SITE_URL: site, CRON_SECRET: 'synthetic-bearer-secret' },
    });
    assert.ifError(result.error);
    assert.equal(result.status === 0, ok);
    const logs = result.stdout + result.stderr;
    assert.equal(logs.includes(sensitive), false);
    assert.equal(logs.includes('synthetic-bearer-secret'), false);
    assert.equal(logs.includes('fixture.invalid'), false);
    assert.equal(logs.includes('successfully delivered'), false);
    if (ok) assert.match(logs, /accepted by email provider; delivery not confirmed/);
    else { assert.match(logs, /::error::/); assert.doesNotMatch(logs, /accepted by email provider;/); }
    if (expectCurl) {
      const args = readFileSync(join(dir, 'args'), 'utf8').trimEnd().split('\n');
      assert.equal(args.includes('POST'), true);
      assert.equal(args.includes('Authorization: Bearer synthetic-bearer-secret'), true);
      assert.equal(args.at(-1), 'https://www.hackermate.in/api/cron/database-activity-report',
        'always use canonical origin; no apex redirect that strips Authorization');
      assert.equal(args.includes('-L'), false, 'never follow cross-host redirects');
      assert.equal(args.includes('--location'), false);
      assert.equal(args.includes('--location-trusted'), false);
      assert.equal(args[args.indexOf('--max-redirs') + 1], '0', 'redirects are forbidden');
      const retryIndex = args.indexOf('--retry');
      assert.notEqual(retryIndex, -1, 'curl must explicitly disable retries');
      assert.equal(args[retryIndex + 1], '0', 'no automatic resend on unknown outcome');
    } else {
      assert.equal(readdirSync(dir).includes('args'), false, 'invalid destination must not invoke curl');
    }
    assert.equal(readdirSync(dir).some(name => name.startsWith('tmp.')), false, 'response file cleaned up');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('daily Founder Brief schedule and manual recovery trigger are both configured', () => {
  assert.match(workflow, /^on:\n  schedule:\n(?:    #[^\n]*\n)*    - cron: '37 3 \* \* \*'/m);
  assert.equal((workflow.match(/^\s+- cron:/gm) || []).length, 1, 'only one daily report schedule');
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /github\.repository == 'yashshah1211\/HackerMate_Backup' && github\.ref == 'refs\/heads\/main'/);
  // A colon-space inside an unquoted YAML 'if:' scalar makes the whole workflow invalid.
  // The earlier temporary test trigger failed before the job could run.
  const condition = workflow.match(/^    if: (.*)$/m)?.[1] || '';
  assert.doesNotMatch(condition, /:\\s/, 'unquoted if scalar must not contain colon followed by space');
  assert.match(condition, /FounderBriefVerification20261106/, 'push delivery check requires specific title marker');
});
test('non-production destination is rejected before any network call', () => run({ site: 'https://fixture.invalid', expectCurl: false }));
test('intended provider acceptance succeeds without claiming delivery', () => run({ ok: true }));
test('configured apex domain is normalized to canonical www without redirecting', () => run({ site: 'https://hackermate.in', ok: true }));
test('default site and accepted dispatch survive bookkeeping failures', () => run({ site: '', ok: true,
  body: JSON.stringify({ ...accepted, accounting: { status: 'failed' }, bookkeeping: 'failed', message: sensitive }) }));
for (const status of ['000', '201', '302', '308', '401', '403', '500']) {
  test(`HTTP ${status} fails even with an accepted body`, () => run({ status }));
}
test('transport failure fails without retrying', () => run({ curlExit: 28 }));
for (const body of ['', '{', sensitive, 'null', '[]', 'true', '{}', JSON.stringify(accepted) + JSON.stringify(accepted)]) {
  test(`invalid or incomplete response ${JSON.stringify(body)} fails closed`, () => run({ body }));
}
for (const [name, patch] of [
  ['failed', { status: 'failed' }], ['unknown', { status: 'unknown' }], ['not dispatched', { status: 'not_dispatched' }],
  ['missing status', { status: undefined }], ['not attempted', { attempted: false }],
  ['unconfirmed intended recipient', { intendedRecipientAccepted: false }],
  ['truthy intended recipient', { intendedRecipientAccepted: 'true' }], ['sandbox', { sandbox: true }],
  ['missing sandbox flag', { sandbox: undefined }],
]) {
  test(`${name} fails despite HTTP 200`, () => run({ body: JSON.stringify({ ...accepted, message: sensitive,
    dispatch: { ...accepted.dispatch, ...patch } }) }));
}
for (const success of [false, 'true', undefined]) {
  test(`success=${success} fails closed`, () => run({ body: JSON.stringify({ ...accepted, success }) }));
}
