/* eslint-disable @typescript-eslint/no-require-imports -- Existing smoke entry point against synthetic loopback HTTP only. */
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const profiles = [1, 2, 3].map(index => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  full_name: `Synthetic builder ${index}`, college: 'Fixture College', skills: [], is_banned: false,
}));
const requests = [], rejected = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  requests.push({ method: req.method, path: url.pathname });
  res.setHeader('Content-Type', 'application/json');
  let rows;
  if (url.pathname === '/rest/v1/profiles') {
    const wanted = url.searchParams.get('id')?.replace(/^eq\./, '');
    rows = wanted ? profiles.filter(row => row.id === wanted) : profiles;
  } else if (url.pathname === '/rest/v1/team_members' && url.searchParams.get('team_id') === 'eq.00000000-0000-4000-8000-000000000099') {
    rows = [{ id: '00000000-0000-4000-8000-000000000098', role: 'leader', profiles: profiles[0] }];
  } else if (['/rest/v1/user_badges', '/rest/v1/team_ppt_evaluations'].includes(url.pathname)) rows = [];
  if (!['GET', 'HEAD'].includes(req.method) || !rows) {
    rejected.push({ method: req.method, path: url.pathname }); res.statusCode = 403; res.end('{}'); return;
  }
  res.setHeader('Content-Range', `0-${Math.max(0, rows.length - 1)}/${rows.length}`);
  res.end(req.method === 'HEAD' ? '' : JSON.stringify(req.headers.accept?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows));
});
(async () => {
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const env = {};
    for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'USERPROFILE', 'LOCALAPPDATA', 'TEMP', 'TMP', 'COMSPEC']) if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, { HM_SMOKE_SYNTHETIC: 'true', NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${server.address().port}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'hustle-offline-fixture' });
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', './qa/fixtures/rack-network-guard.mjs', 'scripts/smoke-test-core-pages.js'],
        { cwd: ROOT, env, windowsHide: true, stdio: 'inherit', timeout: 60_000 });
      child.on('error', reject); child.on('exit', code => resolve(code));
    });
    assert.equal(code, 0, 'Existing core-page query smoke must pass');
    assert(requests.length >= 8); assert.deepEqual(rejected, []);
    console.log(`Synthetic HTTP smoke: ${requests.length} read requests, 0 mutations. This validates query transport, not deployed RLS or complete page rendering.`);
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
