/* eslint-disable @typescript-eslint/no-require-imports -- Offline authorized-read and hook lifecycle tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const { ownerRecentlyActive, loadOwnerActivity } = harness({ '@/lib/supabase': { supabase: {} } }).load('src/app/teams/useTeamsData.ts');
const NOW = Date.parse('2026-10-19T12:00:00Z');
const team = (id = 'one', owner_id = 'owner') => ({ id, owner_id, name: id, skills: [], team_members: [], max_members: 5 });
for (const [value, expected] of [
  ['2026-10-19T12:00:00Z', true], ['2026-09-19T12:00:00Z', true], ['2026-09-19T11:59:59.999Z', false],
  ['2026-09-19T12:00:00.001Z', true], ['2026-10-19T12:00:00.001Z', false],
  ['2026-09-19T17:30:00+05:30', true], ['2026-09-19T07:00:00-05:00', true],
  ['2026-10-19T12:00:00.000000+00:00', true], [null, false], [undefined, false], ['', false], ['garbage', false],
  [NOW, false], [{}, false], ['2026-10-19', false], ['2026-10-19T11:00:00', false],
  ['2026-09-31T12:00:00Z', false], ['2026-02-30T12:00:00Z', false], ['2026-10-19T25:00:00Z', false],
]) test(`activity timestamp ${JSON.stringify(value)} => ${expected}`, () => assert.equal(ownerRecentlyActive(value, NOW), expected));
test('invalid current time cannot classify activity as recent', () => assert.equal(ownerRecentlyActive('2026-10-19T12:00:00Z', NaN), false));
function clientFor(run) {
  const queries = [];
  return { queries, client: { from(table) {
    const q = { table }; queries.push(q);
    return { select(columns) { q.columns = columns; return this; }, in(column, ids) { q.column = column; q.ids = ids; return this; },
      abortSignal(signal) { q.signal = signal; return this; }, then(resolve, reject) { return Promise.resolve().then(() => run(q)).then(resolve, reject); } };
  } } };
}
test('optional read selects only existing allowed columns, scopes/deduplicates owners, and ignores unrelated/hidden/malformed records', async () => {
  const fixture = clientFor(() => ({ data: [{ id: 'owner', last_seen_at: '2026-10-19T11:00:00Z' },
    { id: 'outside-request', last_seen_at: '2026-10-19T11:00:00Z' }, { id: 'bad', last_seen_at: 'yesterday' }, null], error: null }));
  const records = [team(), team('two'), team('three', 'hidden'), team('four', 'bad'), team('five', null)];
  const snapshot = JSON.stringify(records), signal = new AbortController().signal;
  const result = await loadOwnerActivity(fixture.client, records, signal, NOW);
  assert.deepEqual([...result.recentOwners], ['owner']); assert.equal(result.unavailable, false);
  assert.equal(fixture.queries.length, 1); const q = fixture.queries[0];
  assert.equal(q.table, 'profiles'); assert.equal(q.columns, 'id, last_seen_at'); assert.equal(q.column, 'id');
  assert.deepEqual(Array.from(q.ids), ['owner', 'hidden', 'bad']); assert.equal(q.signal, signal);
  assert.equal(JSON.stringify(records), snapshot);
});
for (const failure of ['denied', 'transport', 'malformed']) test(`optional ${failure} read returns unknown activity`, async () => {
  const fixture = clientFor(() => {
    if (failure === 'transport') throw Error('Synthetic transport failure');
    return failure === 'denied' ? { data: null, error: { code: '42501', message: 'denied' } } : { data: {}, error: null };
  });
  const result = await loadOwnerActivity(fixture.client, [team()], new AbortController().signal, NOW);
  assert.equal(result.recentOwners.size, 0); assert.equal(result.unavailable, true);
});
test('no owners or aborted request makes no activity read', async () => {
  const fixture = clientFor(() => { throw Error('Unexpected read'); }); const abort = new AbortController();
  await loadOwnerActivity(fixture.client, [team('no-owner', null)], abort.signal, NOW); abort.abort();
  await loadOwnerActivity(fixture.client, [team()], abort.signal, NOW); assert.equal(fixture.queries.length, 0);
});
test('large lists use bounded owner batches and retain successful activity when another batch is denied', async () => {
  const fixture = clientFor(q => q.ids[0] === 'owner-100' ? { error: { code: '42501' } } :
    { data: q.ids.map(id => ({ id, last_seen_at: '2026-10-19T11:00:00Z' })) });
  const records = Array.from({ length: 205 }, (_, i) => team(String(i), `owner-${i}`));
  const result = await loadOwnerActivity(fixture.client, records, new AbortController().signal, NOW);
  assert.deepEqual(fixture.queries.map(q => q.ids.length), [100, 100, 5]); assert.equal(result.recentOwners.size, 105); assert.equal(result.unavailable, true);
});

async function mountedHook(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>');
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const prior = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  const root = require('react-dom/client').createRoot(dom.window.document.getElementById('root'));
  const queries = [], server = { user: { id: 'viewer' }, records: [team()], ...options };
  const client = { auth: { getUser: async () => {
    if (server.authThrow) throw Error('Auth unavailable');
    return { data: { user: server.user }, error: server.authError || null };
  } }, from(table) {
    const q = { table }; queries.push(q);
    return { select(columns) { q.columns = columns; return this; }, eq() { return this; }, single() { return this; },
      order() { return this; }, in(column, ids) { q.ids = ids; return this; }, abortSignal(signal) { q.signal = signal; return this; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (table === 'teams') return { data: server.records, error: server.teamError };
        if (q.columns === 'skills') return { data: { skills: ['React'] }, error: null };
        if (server.activity) return server.activity(q);
        return { data: [{ id: 'owner', last_seen_at: new Date(Date.now() - 1000).toISOString() }], error: null };
      }).then(resolve, reject); } };
  } };
  const { useTeamsData } = harness({ '@/lib/supabase': { supabase: client } }, { AbortController }).load('src/app/teams/useTeamsData.ts');
  let state, mounted = true;
  function Probe() { state = useTeamsData(); return null; }
  t.after(async () => { if (mounted) await React.act(() => root.unmount()); dom.window.close();
    for (const [key, descriptor] of prior) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  await React.act(async () => root.render(React.createElement(Probe)));
  return { get state() { return state; }, server, queries, reload: () => React.act(async () => state.reload()),
    unmount: async () => { await React.act(() => root.unmount()); mounted = false; } };
}
for (const kind of ['denied', 'transport']) test(`hook keeps teams visible and reports optional ${kind} failure`, async t => {
  const view = await mountedHook(t, { activity() { if (kind === 'transport') throw Error('network'); return { data: null, error: { code: '42501' } }; } });
  assert.equal(view.state.teams.length, 1); assert.equal(view.state.error, null); assert.equal(view.state.loading, false);
  assert.equal(view.state.activityUnavailable, true); assert.equal(view.state.teams[0].ownerRecentlyActive, false);
});
for (const scenario of [{ user: null }, { authError: { message: 'expired' } }, { authThrow: true }]) test(`no authorized viewer skips owner profiles: ${JSON.stringify(scenario)}`, async t => {
  const view = await mountedHook(t, scenario);
  assert.equal(view.state.teams.length, 1); assert.equal(view.state.error, null);
  assert.equal(view.state.activitySettled, true);
  assert.equal(view.queries.filter(q => q.table === 'profiles').length, 0);
});
test('base team failure stays a team error and makes no owner read', async t => {
  const view = await mountedHook(t, { teamError: { message: 'Team read denied' } });
  assert.equal(view.state.error, 'Team read denied'); assert.equal(view.state.loading, false);
  assert.equal(view.queries.filter(q => q.columns === 'id, last_seen_at').length, 0);
});
test('team list is visible before optional activity resolves; older reload cannot overwrite newer teams', async t => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const view = await mountedHook(t, { activity: () => pending });
  assert.equal(view.state.loading, false); assert.equal(view.state.teams[0].id, 'one');
  assert.equal(view.state.activitySettled, false);
  view.server.records = [team('new')]; view.server.activity = () => ({ data: [], error: null });
  await view.reload();
  await React.act(async () => finish({ data: [{ id: 'owner', last_seen_at: new Date(Date.now() - 1000).toISOString() }], error: null }));
  assert.equal(view.state.teams[0].id, 'new'); assert.equal(view.state.teams[0].ownerRecentlyActive, false);
  assert.equal(view.state.activitySettled, true);
});

test('activity remains unsettled while a successful lookup is pending despite a visible team list', async t => {
  let finish;
  const view = await mountedHook(t, { activity: () => new Promise(resolve => { finish = resolve; }) });
  assert.equal(view.state.loading, false); assert.equal(view.state.teams.length, 1);
  assert.equal(view.state.activitySettled, false);
  await React.act(async () => finish({ data: [{ id: 'owner', last_seen_at: new Date(Date.now() - 1000).toISOString() }], error: null }));
  assert.equal(view.state.activitySettled, true);
  assert.equal(view.state.teams[0].ownerRecentlyActive, true);
});

for (const kind of ['missing', 'malformed', 'denied', 'transport']) test(`delayed ${kind} activity settles without hiding the team list`, async t => {
  let finish, fail;
  const view = await mountedHook(t, { activity: () => new Promise((resolve, reject) => { finish = resolve; fail = reject; }) });
  assert.equal(view.state.loading, false); assert.equal(view.state.teams.length, 1);
  assert.equal(view.state.activitySettled, false);
  await React.act(async () => {
    if (kind === 'transport') fail(Error('Synthetic network failure'));
    else finish(kind === 'denied' ? { data: null, error: { code: '42501' } }
      : { data: kind === 'missing' ? [] : {}, error: null });
  });
  assert.equal(view.state.activitySettled, true);
  assert.equal(view.state.loading, false); assert.equal(view.state.error, null);
  assert.equal(view.state.teams.length, 1); assert.equal(view.state.teams[0].ownerRecentlyActive, false);
  assert.equal(view.state.activityUnavailable, kind !== 'missing');
});

test('an aborted stale lookup cannot settle the newer pending lookup', async t => {
  let oldFinish, newFinish;
  const view = await mountedHook(t, { activity: () => new Promise(resolve => { oldFinish = resolve; }) });
  const oldSignal = view.queries.find(q => q.columns === 'id, last_seen_at').signal;
  view.server.records = [team('new')];
  view.server.activity = () => new Promise(resolve => { newFinish = resolve; });
  let reload;
  await React.act(async () => { reload = view.state.reload(); });
  assert.equal(oldSignal.aborted, true);
  assert.equal(view.state.loading, false); assert.equal(view.state.teams[0].id, 'new');
  assert.equal(view.state.activitySettled, false);
  await React.act(async () => oldFinish({ data: [{ id: 'owner', last_seen_at: new Date(Date.now() - 1000).toISOString() }], error: null }));
  assert.equal(view.state.activitySettled, false);
  assert.equal(view.state.teams[0].id, 'new'); assert.equal(view.state.teams[0].ownerRecentlyActive, undefined);
  await React.act(async () => { newFinish({ data: [], error: null }); await reload; });
  assert.equal(view.state.activitySettled, true); assert.equal(view.state.teams[0].ownerRecentlyActive, false);
});

test('reload clears previous completion while the replacement activity lookup is pending', async t => {
  const view = await mountedHook(t);
  assert.equal(view.state.activitySettled, true);
  let finish, reload;
  view.server.activity = () => new Promise(resolve => { finish = resolve; });
  await React.act(async () => { reload = view.state.reload(); });
  assert.equal(view.state.loading, false); assert.equal(view.state.activitySettled, false);
  await React.act(async () => { finish({ data: [], error: null }); await reload; });
  assert.equal(view.state.activitySettled, true);
});
test('unmount aborts pending optional read', async t => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const view = await mountedHook(t, { activity: () => pending });
  const signal = view.queries.find(q => q.columns === 'id, last_seen_at').signal;
  assert.equal(view.state.activitySettled, false);
  await view.unmount(); assert.equal(signal.aborted, true);
  await React.act(async () => finish({ data: [], error: null }));
  assert.equal(view.state.activitySettled, false);
});
test('reload rechecks activity and removes a previously positive signal on access failure', async t => {
  const view = await mountedHook(t); assert.equal(view.state.teams[0].ownerRecentlyActive, true);
  view.server.activity = () => ({ data: null, error: { code: '42501' } }); await view.reload();
  assert.equal(view.state.teams[0].ownerRecentlyActive, false); assert.equal(view.state.activityUnavailable, true);
  const base = view.queries.find(q => q.table === 'teams');
  assert.match(base.columns, /hackathons!teams_hackathon_id_fkey\(id, name, end_date, status, archived\)/);
  assert.match(base.columns, /team_hackathons\(hackathons\(id, name, end_date, status, archived\)\)/);
});
