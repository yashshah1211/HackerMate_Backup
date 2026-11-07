/* eslint-disable @typescript-eslint/no-require-imports -- Fresh synthetic loopback PostgreSQL only; no existing database accepted. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { freePort } = require('./hustle-phase2-local-db.cjs');

async function createFixture() {
  const root = path.resolve(__dirname, '..');
  const env = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'USERPROFILE', 'LOCALAPPDATA', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  const bin = process.env.PARTNER_TEST_PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '');
  const binary = name => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  const parent = fs.realpathSync(os.tmpdir());
  const temp = fs.mkdtempSync(path.join(parent, 'hm04-hackathon-delete-'));
  const cluster = path.join(temp, 'cluster');
  const port = await freePort();
  env.PGPASSFILE = path.join(temp, 'no-password'); env.PGSERVICEFILE = path.join(temp, 'no-service');
  fs.writeFileSync(env.PGPASSFILE, ''); fs.writeFileSync(env.PGSERVICEFILE, '');
  let started = false;
  function run(name, args, input) {
    const result = spawnSync(binary(name), args, { cwd: root, env, input, windowsHide: true, encoding: 'utf8', timeout: 60000, maxBuffer: 8e6, stdio: name === 'pg_ctl' ? 'ignore' : 'pipe' });
    if (result.error || result.status !== 0) throw Error(name + ': ' + (result.error?.message || result.stderr || result.stdout));
    return (result.stdout || '').trim();
  }
  const args = ['-h', '127.0.0.1', '-p', String(port), '-U', 'fixture_owner', '-d', 'hm04_fixture', '-X', '-w', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
  const sql = input => run('psql', args, input);
  const asyncSql = input => new Promise((resolve, reject) => {
    const child = spawn(binary('psql'), args, { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '';
    const timer = setTimeout(() => { child.kill(); reject(Error('Disposable SQL timeout')); }, 30000);
    child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { errors += value; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); if (code === 0) resolve(output.trim()); else reject(Error(errors || output)); });
    child.stdin.end(input);
  });
  async function close() {
    if (started || fs.existsSync(path.join(cluster, 'postmaster.pid'))) run('pg_ctl', ['-D', cluster, '-w', '-m', 'immediate', 'stop']);
    const resolved = fs.realpathSync(temp);
    assert.equal(path.dirname(resolved), parent); assert(path.basename(resolved).startsWith('hm04-hackathon-delete-'));
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  try {
    run('initdb', ['-D', cluster, '-U', 'fixture_owner', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
    const sockets = process.platform === 'win32' ? '' : ' -c unix_socket_directories=';
    run('pg_ctl', ['-D', cluster, '-l', path.join(temp, 'postgres.log'), '-w', 'start', '-o', `-h 127.0.0.1 -p ${port} -F -c max_connections=20 -c shared_buffers=32MB -c hm.fixture_only=hm04${sockets}`]);
    started = true;
    run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'fixture_owner', 'hm04_fixture']);
    assert.equal(sql("SELECT current_database()='hm04_fixture' AND inet_server_addr()='127.0.0.1'::inet AND current_setting('hm.fixture_only')='hm04'"), 't');
    return { root, sql, asyncSql, close };
  } catch (error) { await close(); throw error; }
}
module.exports = { createFixture };
