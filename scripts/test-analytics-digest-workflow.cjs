/* eslint-disable @typescript-eslint/no-require-imports -- Execute the actual workflow Bash with an offline curl fixture and real jq. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const yaml = require('js-yaml');

const root = join(__dirname, '..');
const workflow = yaml.load(readFileSync(join(root, '.github/workflows/analytics-digest.yml'), 'utf8'));
const step = workflow.jobs['send-analytics-digest'].steps[0];
const script = step.run;
const bash = process.platform === 'win32' ? join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : 'bash';
const sensitive = 'synthetic-private-analytics-response';
const secret = 'synthetic-cron-secret';
const accepted = { success: true, resendId: 'synthetic-provider-receipt', dispatch: { status: 'accepted', providerStatus: 201 },
  recipient: 'sensitive@example.invalid', analyticsSummary: { marker: sensitive } };

// Never load .env or invoke real curl. A readonly Bash function intercepts curl
// before the actual workflow runs, independent of Git Bash's PATH rewriting.
// It records every invocation/argument and returns synthetic HTTP data.
function run({ site = 'https://www.hackermate.in', token = secret, body = JSON.stringify(accepted), status = '200',
  curlExit = 0, ok = false, expectCurl = true, message } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'analytics-digest-workflow-'));
  try {
    const fixturePath = dir.replaceAll('\\', '/');
    writeFileSync(join(dir, 'body'), body);
    writeFileSync(join(dir, 'curl-fixture.sh'), `curl() {
printf 'call\\n' >> "$FIXTURE_DIR/calls"
printf '%s\\0' "$@" > "$FIXTURE_DIR/args"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then cp "$FIXTURE_DIR/body" "$2"; shift; fi
  shift
done
if [ "$FIXTURE_EXIT" != "0" ]; then printf 'curl: synthetic transport failure\\n' >&2; fi
printf '%s' "$FIXTURE_STATUS"
return "$FIXTURE_EXIT"
}
readonly -f curl
`);
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      HOME: fixturePath, TMPDIR: fixturePath, FIXTURE_DIR: fixturePath,
      FIXTURE_STATUS: status, FIXTURE_EXIT: String(curlExit) };
    if (site !== null) env.SITE_URL = site;
    if (token !== null) env.CRON_SECRET = token;
    const fixture = '. "$FIXTURE_DIR/curl-fixture.sh"\n[[ "$(type -t curl)" == function ]] || exit 99\n';
    const result = spawnSync(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', fixture + script], {
      cwd: dir, encoding: 'utf8', timeout: 10_000, env,
    });
    assert.ifError(result.error);
    const logs = result.stdout + result.stderr;
    assert.equal(result.status === 0, ok, logs);
    for (const value of [sensitive, secret, 'sensitive@example.invalid', 'synthetic-provider-receipt']) assert(!logs.includes(value), 'no secrets or full response in logs');
    assert(!logs.includes('successfully delivered'));
    if (ok) assert.match(logs, /accepted by email provider; delivery is not confirmed/);
    else { assert.match(logs, /::error::/); assert.doesNotMatch(logs, /accepted by email provider;/); }
    if (message) assert.match(logs, message);
    assert(!existsSync(join(dir, 'injected')), 'environment values cannot execute shell code');
    if (expectCurl) {
      assert.equal(readFileSync(join(dir, 'calls'), 'utf8'), 'call\n', 'one curl invocation, never a retry');
      const args = readFileSync(join(dir, 'args'), 'utf8').split('\0').slice(0, -1);
      assert.equal(args[0], '--disable', 'ignore curlrc before it can enable tracing, redirects or extra requests');
      assert.equal(args.filter(arg => arg === 'POST').length, 1);
      assert(args.includes(`Authorization: Bearer ${token}`), 'Authorization remains one literal header');
      assert.deepEqual(args.filter(arg => arg.startsWith('https://')), ['https://www.hackermate.in/api/cron/analytics-summary']);
      for (const [option, value] of [['--proto', '=https'], ['--max-redirs', '0'], ['--retry', '0'], ['--connect-timeout', '15'], ['--max-time', '240'], ['-w', '%{http_code}']]) {
        assert.equal(args[args.indexOf(option) + 1], value, option);
      }
      for (const option of ['-L', '--location', '--location-trusted', '--retry-all-errors', '-v', '--verbose', '--trace', '--trace-ascii', '-G', '--get', '-I', '--head']) assert(!args.includes(option), option);
    } else assert(!existsSync(join(dir, 'calls')), 'invalid configuration makes zero curl calls');
    assert(!readdirSync(dir).some(name => name.startsWith('tmp.')), 'response file cleaned on success and failure');
    return logs;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('workflow YAML remains manual only and secrets are passed through env', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(step.env.SITE_URL, '${{ secrets.SITE_URL }}');
  assert.equal(step.env.CRON_SECRET, '${{ secrets.CRON_SECRET }}');
  assert(!script.includes('${{'), 'no expression interpolation into executable shell');
  assert.equal(step.shell, 'bash');
  assert.equal(workflow.jobs['send-analytics-digest'].steps.length, 1, 'no hidden second dispatch step');
});
test('actual workflow Bash has valid syntax', () => {
  const result = spawnSync(bash, ['--noprofile', '--norc', '-n'], { input: script, encoding: 'utf8' });
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
});
test('all changed workflow YAML parses', () => {
  const validation = yaml.load(readFileSync(join(root, '.github/workflows/pr-validation.yml'), 'utf8'));
  assert.deepEqual(validation.on.pull_request.branches, ['main']);
  const selection = validation.jobs['offline-validation'].steps.find(item => item.name === 'Run offline regression selection').run;
  assert(selection.includes('scripts/test-analytics-digest-workflow.cjs'));
  assert(selection.includes('scripts/test-analytics-summary.cjs'));
});
test('daily database report workflow remains byte-equivalent to reviewed main after checkout newline normalization', () => {
  const reference = readFileSync(join(root, '.github/workflows/daily-database-report.yml'), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(createHash('sha256').update(reference).digest('hex'), 'bd14cbef8ab2e03f5c9b2ed91944f2f1ad4990d8869c9948f674ed48c9c5e391');
});

for (const site of ['https://hackermate.in', 'https://www.hackermate.in', '', null]) {
  test(`approved/default origin ${JSON.stringify(site)} sends one canonical POST`, () => run({ site, ok: true }));
}
for (const site of ['http://hackermate.in', 'http://www.hackermate.in', 'https://fixture.invalid', 'https://www.hackermate.in.fixture.invalid',
  'https://hackermate.in@fixture.invalid', 'https://user:password@www.hackermate.in', 'https://user@www.hackermate.in',
  'https://www.hackermate.in/', 'https://hackermate.in/api/cron/analytics-summary', 'https://www.hackermate.in?x=1',
  'https://www.hackermate.in#fragment', 'https://www.hackermate.in:443', 'https://www.hackermate.in.',
  'HTTPS://WWW.HACKERMATE.IN', ' https://www.hackermate.in', 'https://www.hackermate.in\n', 'https://www.hackermate.in\r',
  '//www.hackermate.in', 'file:///tmp/fixture', 'not a URL', 'https://www.hackermate.in\\@fixture.invalid',
  'https://www.hackermate.in/%2f', 'https://www.hackermate.in?x=$(touch injected)', '$(touch injected)', '`touch injected`']) {
  test(`unapproved origin ${JSON.stringify(site)} makes no request`, () => run({ site, expectCurl: false, message: /destination refused/ }));
}
for (const token of ['', null, 'token\r\nX-Injected: header', 'token\n']) {
  test(`missing or multiline secret ${JSON.stringify(token)} blocks dispatch`, () => run({ token, expectCurl: false, message: /CRON_SECRET/ }));
}
test('shell metacharacters in a secret stay literal and are not logged or executed', () => {
  const token = 'synthetic-"$(touch injected)`touch injected`\\$secret';
  assert(!run({ token, ok: true }).includes(token));
});
for (const status of ['000', '201', '204', '301', '302', '307', '308', '400', '401', '403', '404', '408', '409', '429', '500', '502', '503']) {
  test(`HTTP ${status} cannot succeed even with an accepted body`, () => run({ status,
    message: status.startsWith('3') ? /redirect.*refused to forward Authorization/i
      : ['401', '403'].includes(status) ? /authorization failed/i : /acceptance not confirmed/i }));
}
test('invalid status output cannot report success or inject logs', () => run({ status: '200\n::warning::untrusted-status', message: /Invalid HTTP status/ }));
for (const curlExit of [6, 7, 23, 28, 35, 60]) {
  test(`curl exit ${curlExit} overrides HTTP 200/accepted receipt without retry`, () => run({ curlExit, message: /transport failed.*acceptance unknown/i }));
}
for (const body of ['', '{', sensitive, 'null', '[]', 'true', '42', '"text"', '{}', JSON.stringify(accepted) + JSON.stringify(accepted),
  JSON.stringify(accepted) + '\nfalse', '\n::warning::' + sensitive]) {
  test(`malformed/incomplete JSON ${JSON.stringify(body)} fails closed`, () => run({ body, message: /Invalid JSON or unconfirmed/ }));
}
for (const resendId of [undefined, null, '', ' \t\n', 42, true, {}, []]) {
  test(`invalid provider receipt ${JSON.stringify(resendId)} cannot report acceptance`, () => run({ body: JSON.stringify({ ...accepted, resendId }) }));
}
for (const providerStatus of [undefined, null, '200', 199, 300, 401, 500, 200.5]) {
  test(`invalid provider HTTP status ${JSON.stringify(providerStatus)} fails closed`, () => run({ body: JSON.stringify({ ...accepted, dispatch: { status: 'accepted', providerStatus } }) }));
}
for (const dispatch of [null, [], {}, { status: 'rejected', providerStatus: 422 }, { status: 'failed', providerStatus: 400 },
  { status: 'unknown', providerStatus: 200 }, { status: 'not_dispatched' }, { status: true, providerStatus: 200 }]) {
  test(`non-acceptance dispatch ${JSON.stringify(dispatch)} fails despite success flag`, () => run({ body: JSON.stringify({ ...accepted, dispatch }) }));
}
for (const success of [false, 'true', undefined, 1]) {
  test(`non-boolean success ${JSON.stringify(success)} fails closed`, () => run({ body: JSON.stringify({ ...accepted, success }) }));
}
test('valid receipt may preserve partial analytics without dumping operational data', () => run({ ok: true, body: JSON.stringify({ ...accepted,
  analyticsSummary: { databaseStatus: 'partial', private: sensitive }, message: '::warning::' + sensitive }) }));
