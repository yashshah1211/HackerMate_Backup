/* eslint-disable @typescript-eslint/no-require-imports -- Actual handlers, synthetic identity/database only. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NextRequest } = require('next/server');
const http = require('node:http');
const { harness } = require('./ppt-vision-harness.cjs');
const USER = '00000000-0000-4000-8000-000000000001';
const TEAM = '00000000-0000-4000-8000-000000000002';
const EVAL = '00000000-0000-4000-8000-000000000003';
const OTHER = '00000000-0000-4000-8000-000000000004';

function fixture(options = {}) {
  const state = { reads: [], deletes: [], errors: [], rows: [{ id: EVAL, team_id: TEAM, version: 1 }], ...options.state };
  const db = {
    auth: { async getUser() { return { data: { user: options.signedOut ? null : { id: USER } }, error: options.authError || null }; } },
    from(table) {
      let columns = '', deleting = false, single = false;
      const filters = [];
      const query = { select(value) { columns = value; return this; }, eq(...args) { filters.push(args); return this; },
        order() { return this; }, delete() { deleting = true; return this; },
        maybeSingle() { single = true; return this; },
        then(resolve, reject) {
          const run = () => {
            if (deleting) {
              state.deletes.push(filters);
              if (options.deleteError) return { data: null, error: options.deleteError };
              const rows = state.rows.filter(row => filters.every(([key, value]) => row[key] === value));
              state.rows = state.rows.filter(row => !rows.includes(row));
              return { data: single ? rows[0] || null : rows, error: null };
            }
            state.reads.push({ table, columns });
            if (options.readError === table) return { data: null, error: { code: '42501', message: 'Synthetic permission denied' } };
            let rows;
            if (table === 'profiles') rows = options.profile === null ? [] : [{ id: USER, role: 'user', is_banned: false, ...options.profile }];
            else if (table === 'teams') rows = options.missingTeam ? [] : [{ id: TEAM, owner_id: options.owner === false ? OTHER : USER }];
            else if (table === 'team_members') rows = options.member ? [{ id: OTHER }] : [];
            else if (table === 'team_ppt_evaluations') rows = state.rows;
            else throw Error('Unexpected table ' + table);
            const projected = rows.map(row => Object.fromEntries(columns.split(',').map(key => key.trim()).filter(key => key in row).map(key => [key, row[key]])));
            return { data: single ? projected[0] || null : projected, error: null };
          };
          return Promise.resolve().then(run).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const h = harness({ '@supabase/supabase-js': { createClient: () => db } }, { console: { log() {}, warn() {}, error: (...args) => state.errors.push(args) } });
  Object.assign(h.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service' });
  const route = h.load('src/app/api/teams/[id]/ppt-evaluations/route.ts');
  return { state, route, async call(method = 'GET', evalId = EVAL, teamId = TEAM) {
    return route[method](new NextRequest(`http://localhost/api/teams/${teamId}/ppt-evaluations?evalId=${evalId}`, {
      method, headers: options.signedOut ? {} : { Authorization: 'Bearer synthetic-token' },
    }), { params: Promise.resolve({ id: teamId }) });
  } };
}

for (const method of ['GET', 'DELETE']) {
  for (const [label, options, status] of [
    ['signed out', { signedOut: true }, 401],
    ['suspended owner', { profile: { is_banned: true } }, 403],
    ['suspended admin', { owner: false, profile: { role: 'admin', is_banned: true } }, 403],
    ['missing profile', { profile: null }, 403],
    ['unknown suspension', { profile: { is_banned: null } }, 403],
    ['mismatched profile', { profile: { id: OTHER } }, 403],
    ['rejected identity with user payload', { authError: { status: 401, message: 'Synthetic rejected identity' } }, 401],
    ['profile permission failure', { readError: 'profiles' }, 503],
    ['membership permission failure', { readError: 'team_members' }, 503],
    ['team permission failure', { readError: 'teams', member: true }, 503],
    ['unrelated caller', { owner: false }, 403],
    ['missing team', { missingTeam: true, profile: { role: 'admin' } }, 404],
  ]) test(`PPT ${method}: ${label} cannot read or delete evaluations`, async () => {
    const f = fixture(options), response = await f.call(method);
    assert.equal(response.status, status);
    assert(!f.state.reads.some(read => read.table === 'team_ppt_evaluations'));
    assert.equal(f.state.deletes.length, 0);
    if (options.readError) assert(f.state.errors.some(args => args.some(arg => arg?.code === '42501')));
  });
  for (const [label, options] of [['owner', {}], ['member', { owner: false, member: true }], ['admin', { owner: false, profile: { role: 'admin' } }]]) {
    test(`PPT ${method}: active ${label} retains scoped access`, async () => {
      const f = fixture(options), response = await f.call(method); assert.equal(response.status, 200);
      const body = await response.json();
      if (method === 'DELETE') {
        assert.deepEqual(f.state.deletes[0], [['id', EVAL], ['team_id', TEAM]]);
        assert.deepEqual(body, { success: true, deletedId: EVAL });
      } else {
        assert.deepEqual(Object.keys(body), ['evaluations']); assert.equal(body.evaluations.length, 1);
      }
    });
  }
}
test('PPT DELETE: nonexistent evaluation does not report success', async () => {
  const f = fixture(); assert.equal((await f.call('DELETE', OTHER)).status, 404); assert.equal(f.state.rows.length, 1);
});
test('PPT DELETE: database failure is logged and not reported as deletion', async () => {
  const error = { code: '42501', message: 'Synthetic deletion denied' }, f = fixture({ deleteError: error });
  assert.equal((await f.call('DELETE')).status, 500); assert(f.state.errors.some(args => args.includes(error))); assert.equal(f.state.rows.length, 1);
});
test('PPT HTTP runtime: suspension denies read/delete, active owner can delete exactly once', async () => {
  const options = { profile: { is_banned: true } }, f = fixture(options);
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const req = new NextRequest('http://127.0.0.1' + incoming.url, { method: incoming.method, headers: incoming.headers });
      const response = await f.route[incoming.method](req, { params: Promise.resolve({ id: TEAM }) });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(await response.text());
    } catch { outgoing.writeHead(500); outgoing.end('Synthetic handler failed'); }
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const url = `http://127.0.0.1:${server.address().port}/api/teams/${TEAM}/ppt-evaluations?evalId=${EVAL}`;
    const call = method => fetch(url, { method, headers: { Authorization: 'Bearer synthetic-token' } });
    assert.equal((await call('GET')).status, 403); assert.equal((await call('DELETE')).status, 403); assert.equal(f.state.rows.length, 1);
    options.profile.is_banned = false;
    assert.equal((await call('GET')).status, 200); assert.equal((await call('DELETE')).status, 200); assert.equal((await call('DELETE')).status, 404);
    assert.equal(f.state.rows.length, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
