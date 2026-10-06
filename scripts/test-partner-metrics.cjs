/* eslint-disable @typescript-eslint/no-require-imports -- Disposable local PostgreSQL runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');

// No connection URL/credentials accepted. Never load .env or use an existing
// database. Requires local PostgreSQL binaries (PATH or PARTNER_TEST_PG_BIN).
const root = path.resolve(__dirname, '..');
const pgBin = process.env.PARTNER_TEST_PG_BIN;
function binary(name) {
  const filename = process.platform === 'win32' ? `${name}.exe` : name;
  return pgBin ? path.join(pgBin, filename) : filename;
}
const cleanEnv = { ...process.env };
for (const key of Object.keys(cleanEnv)) {
  if (/^(PG|SUPABASE|NEXT_PUBLIC_SUPABASE|DATABASE_URL)/.test(key)) delete cleanEnv[key];
}
function run(name, args) {
  const result = spawnSync(binary(name), args, {
    cwd: root, env: cleanEnv, encoding: 'utf8', windowsHide: true,
    // Windows background postgres can inherit captured pipes and keep them
    // open after pg_ctl exits. Its own diagnostics go to postgres.log instead.
    stdio: name === 'pg_ctl' ? 'ignore' : 'pipe',
    timeout: 60000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result.stdout + result.stderr;
}
async function main() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const tempRoot = fs.realpathSync(os.tmpdir());
  const temp = fs.mkdtempSync(path.join(tempRoot, 'codex-partner-metrics-'));
  const cluster = path.join(temp, 'cluster');
  let started = false;
  let failure;
  try {
    run('initdb', ['-D', cluster, '-U', 'fixture_owner', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    run('pg_ctl', ['-D', cluster, '-l', path.join(temp, 'postgres.log'), '-w', 'start', '-o', `-h 127.0.0.1 -p ${port} -F`]);
    started = true;
    const connection = ['-h', '127.0.0.1', '-p', String(port), '-U', 'fixture_owner'];
    run('createdb', [...connection, 'partner_authz_fixture']);
    const output = run('psql', [...connection, '-X', '-w', '-d', 'partner_authz_fixture', '-v', 'ON_ERROR_STOP=1', '-f', path.join(root, 'scripts', 'test-partner-isolation.sql')]);
    const passes = (output.match(/NOTICE:\s+PASS:/g) || []).length;
    assert(passes >= 100, 'Expected the full projection/isolation assertion suite');
    console.log(`Local PostgreSQL: ${passes} partner-projection assertions passed.`);
    const plan = output.match(/QUERY PLAN[\s\S]*?Execution Time: [^\r\n]+/);
    assert(plan, 'Expected the 500-registration query plan');
    console.log(plan[0].trim());
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (started || fs.existsSync(path.join(cluster, 'postmaster.pid'))) {
        run('pg_ctl', ['-D', cluster, '-w', '-m', 'immediate', 'stop']);
      }
      // Check the generated absolute target stays inside our own temp directory.
      const resolved = fs.realpathSync(temp);
      assert.equal(path.dirname(resolved), tempRoot);
      assert(path.basename(resolved).startsWith('codex-partner-metrics-'));
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.error(`Fixture cleanup failed (${temp}): ${error.message}`);
      failure ||= error;
    }
  }
  if (failure) throw failure;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
