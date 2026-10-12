/* eslint-disable @typescript-eslint/no-require-imports -- Offline hook tests use the existing TypeScript harness. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness } = require('./ppt-vision-harness.cjs');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const ok = data => ({ data, error: null });
const failure = message => ({ data: null, error: { message } });
const row = (id, is_available = null) => ({ id, full_name: id, college: 'Fixture campus', skills: ['React'], is_available });
const sameDeps = (a, b) => a && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

// Minimal hook runner, fake debounce clock, and controlled Supabase responses.
// No live network, wall-clock sleeps, or source-text assertions.
function ui(options = {}) {
  const states = [], refs = [], callbacks = [], updates = [];
  let stateCursor = 0, refCursor = 0, callbackCursor = 0;
  let pendingEffect, effectDeps, effectSetup, cleanup, result, mounted = true;
  let search = options.search || 'A', sort = options.sort || 'fit';
  let time = 0, timerId = 0, initializationGate = options.initializationGate;
  const timers = new Map();
  const queries = [], initialReads = [], rpcCalls = [], toasts = [];
  let authCalls = 0;
  const toast = (message, type) => toasts.push({ message, type });
  const hooks = {
    useState(start) {
      const index = stateCursor++;
      if (!(index in states)) states[index] = start;
      return [states[index], value => {
        updates.push({ index, mounted });
        states[index] = typeof value === 'function' ? value(states[index]) : value;
      }];
    },
    useRef(start) { const index = refCursor++; return refs[index] ||= { current: start }; },
    useCallback(fn, deps) {
      const index = callbackCursor++;
      if (!sameDeps(callbacks[index]?.deps, deps)) callbacks[index] = { fn, deps };
      return callbacks[index].fn;
    },
    useEffect(fn, deps) {
      if (!sameDeps(effectDeps, deps)) pendingEffect = { fn, deps };
    },
  };
  function initialResponse(table, filters) {
    if (table === 'profiles') return ok(row('viewer', true));
    if (table === 'teams') return ok([{ id: 'owned-team', name: 'Fixture team', owner_id: 'viewer' }]);
    if (table === 'blocked_users') return ok(filters.some(([key]) => key === 'blocker_id') ? [{ blocked_id: 'blocked-out' }] : [{ blocker_id: 'blocked-in' }]);
    if (table === 'friend_requests') return ok([
      { sender_id: 'viewer', receiver_id: 'friend', status: 'accepted' },
      { sender_id: 'viewer', receiver_id: 'outgoing', status: 'pending' },
      { sender_id: 'incoming', receiver_id: 'viewer', status: 'pending' },
    ]);
    if (table === 'team_members') return ok(options.existingMember || null);
    if (table === 'team_invites') return ok(options.existingInvite || null);
    throw new Error(`Unexpected table ${table}`);
  }
  const client = {
    auth: { async getUser() {
      authCalls++;
      return options.auth ? options.auth(authCalls) : { data: { user: { id: 'viewer' } } };
    } },
    from(table) {
      const filters = [];
      let columns, order, orderOptions, expression, limit, single = false, response;
      const query = {
        select(value) { columns = value; return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        or(value) { expression = value; return this; },
        order(value, opts) { order = value; orderOptions = opts; return this; },
        limit(value) { limit = value; return this; },
        single() { single = true; return this; },
        maybeSingle() { single = true; return this; },
        then(resolve, reject) {
          if (!response) {
            if (table === 'profiles' && !single) {
              const gate = deferred();
              queries.push({ columns, order, orderOptions, expression, limit, ...gate });
              response = gate.promise;
            } else {
              if (!['team_members', 'team_invites'].includes(table)) initialReads.push({ table, filters });
              response = initializationGate && !['team_members', 'team_invites'].includes(table)
                ? initializationGate.promise.then(() => initialResponse(table, filters))
                : Promise.resolve(initialResponse(table, filters));
            }
          }
          return response.then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      if (name === 'send_team_invite') return options.inviteResponse || ok('fixture-invite');
      assert.equal(name, 'get_recommended_teammates_v3');
      return ok([{ id: 'recommended', compatibility: 80, reasons: ['Fixture reason'], confidence: 0.5 }]);
    },
  };
  const hook = harness({
    react: hooks,
    '@/lib/supabase': { supabase: client },
    '@/context/NotificationContext': { useNotification: () => ({ showToast: toast }) },
  }, {
    Error,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  }).load('src/app/developers/useDevelopersData.ts').useDevelopersData;
  function render() {
    assert(mounted);
    stateCursor = refCursor = callbackCursor = 0;
    result = hook(search, sort);
    if (pendingEffect) {
      if (cleanup) cleanup();
      effectDeps = pendingEffect.deps;
      effectSetup = pendingEffect.fn;
      cleanup = effectSetup();
      pendingEffect = null;
    }
    return result;
  }
  render();
  return {
    queries, initialReads, rpcCalls, toasts, updates,
    read: render,
    change(term, ordering = sort) { search = term; sort = ordering; render(); },
    async advance(ms = 300) {
      const target = time + ms;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next; timers.delete(id); time = timer.at; timer.fn();
      }
      time = target;
      await flush();
    },
    retry() { const promise = render().retry(); return promise; },
    unmount() { cleanup(); mounted = false; },
    restartEffect() { cleanup(); cleanup = effectSetup(); },
    setInitializationGate(gate) { initializationGate = gate; },
    authCalls: () => authCalls,
    timerCount: () => timers.size,
  };
}
async function resolve(query, value) { query.resolve(value); await flush(); }
async function reject(query, error) { query.reject(error); await flush(); }
const ids = view => Array.from(view.read().builders, builder => builder.id);

test('B succeeds before A: late A success cannot replace B or loading/error state', async () => {
  const view = ui(); await view.advance();
  view.change('B'); await view.advance();
  await resolve(view.queries[1], ok([row('B')]));
  const updates = view.updates.length;
  await resolve(view.queries[0], ok([row('A')]));
  assert.deepEqual(ids(view), ['B']);
  assert.equal(view.read().loading, false);
  assert.equal(view.read().error, null);
  assert.equal(view.updates.length, updates);
});

for (const thrown of [false, true]) test(`late A ${thrown ? 'exception' : 'query error'} cannot overwrite B success or trigger stale fallback`, async () => {
  const view = ui(); await view.advance();
  view.change('B'); await view.advance();
  await resolve(view.queries[1], ok([row('B')]));
  if (thrown) await reject(view.queries[0], new Error('Old failure'));
  else await resolve(view.queries[0], failure('Old failure'));
  assert.deepEqual(ids(view), ['B']);
  assert.equal(view.read().error, null);
  assert.equal(view.queries.length, 2);
});

test('B fails after its existing fallback: late A success cannot erase the latest error', async () => {
  const view = ui(); await view.advance();
  view.change('B'); await view.advance();
  await resolve(view.queries[1], failure('Primary failure'));
  assert.equal(view.read().loading, true);
  await resolve(view.queries[2], failure('Latest failure'));
  await resolve(view.queries[0], ok([row('A')]));
  assert.equal(view.read().error, 'Latest failure');
  assert.equal(view.read().loading, false);
  assert.deepEqual(ids(view), []);
});

test('changing a term invalidates A throughout the 300ms debounce', async () => {
  const view = ui(); await view.advance();
  view.change('B');
  await resolve(view.queries[0], ok([row('A')]));
  assert.deepEqual(ids(view), []);
  assert.equal(view.read().loading, true);
  await view.advance(299);
  assert.equal(view.queries.length, 1);
  await view.advance(1);
  assert.equal(view.queries.length, 2);
  await resolve(view.queries[1], ok([row('B')]));
  assert.deepEqual(ids(view), ['B']);
});

test('stale completion cannot clear loading while the newest request is pending', async () => {
  const view = ui(); await view.advance();
  view.change('B'); await view.advance();
  await resolve(view.queries[0], ok([row('A')]));
  assert.equal(view.read().loading, true);
  await resolve(view.queries[1], ok([row('B')]));
  assert.equal(view.read().loading, false);
});

test('Fit/Active/New races retain the latest order and unchanged server query semantics', async () => {
  const view = ui({ search: ' React ' }); await view.advance();
  view.change(' React ', 'active'); await view.advance();
  view.change(' React ', 'new'); await view.advance();
  assert.deepEqual(view.queries.map(query => query.order), ['created_at', 'last_seen_at', 'created_at']);
  assert.deepEqual(JSON.parse(JSON.stringify(view.queries[1].orderOptions)), { ascending: false, nullsFirst: false });
  for (const query of view.queries) {
    assert.equal(query.limit, 1000);
    assert.equal(query.expression, 'full_name.ilike.%React%,college.ilike.%React%,skills.cs.{React}');
    assert(query.columns.includes('year_of_study'));
  }
  await resolve(view.queries[2], ok([row('new-first'), row('new-second')]));
  await resolve(view.queries[1], ok([row('active')]));
  await resolve(view.queries[0], ok([row('fit')]));
  assert.deepEqual(ids(view), ['new-first', 'new-second']);
});

test('clearing search restores the latest unfiltered query and excludes self and both block directions', async () => {
  const view = ui(); await view.advance();
  view.change(''); await view.advance();
  assert.equal(view.queries[1].expression, undefined);
  await resolve(view.queries[1], ok([row('viewer'), row('blocked-out'), row('blocked-in'), row('clear')]));
  await resolve(view.queries[0], ok([row('A')]));
  assert.deepEqual(ids(view), ['clear']);
});

test('Retry invalidates old work and cancels a queued debounce without a duplicate query', async () => {
  const view = ui(); await view.advance();
  view.change('B');
  const retry = view.retry(); await flush();
  assert.equal(view.timerCount(), 0);
  assert.equal(view.queries.length, 2);
  await resolve(view.queries[1], ok([row('retry')])); await retry;
  await view.advance();
  await resolve(view.queries[0], ok([row('A')]));
  assert.equal(view.queries.length, 2);
  assert.deepEqual(ids(view), ['retry']);
});

test('a stale in-flight fallback cannot overwrite a newer outcome', async () => {
  const view = ui(); await view.advance();
  await resolve(view.queries[0], failure('Primary A failure'));
  view.change('B'); await view.advance();
  await resolve(view.queries[2], ok([row('B')]));
  await resolve(view.queries[1], failure('Fallback A failure'));
  assert.deepEqual(ids(view), ['B']);
  assert.equal(view.read().error, null);
});

test('a successful latest fallback clears an earlier current error and preserves previous results on failure', async () => {
  const view = ui(); await view.advance();
  await resolve(view.queries[0], ok([row('previous')]));
  view.change('B'); await view.advance();
  await resolve(view.queries[1], failure('B primary'));
  await resolve(view.queries[2], failure('B fallback'));
  assert.deepEqual(ids(view), ['previous']);
  assert.equal(view.read().error, 'B fallback');
  const retry = view.retry(); await flush();
  await resolve(view.queries[3], failure('Retry primary'));
  await resolve(view.queries[4], ok([row('recovered')])); await retry;
  assert.deepEqual(ids(view), ['recovered']);
  assert.equal(view.read().error, null);
});

test('unmount invalidates late list responses and queued debounces', async () => {
  const view = ui(); await view.advance();
  view.change('B');
  view.unmount();
  const updates = view.updates.length;
  await resolve(view.queries[0], ok([row('late')]));
  await view.advance();
  assert.equal(view.queries.length, 1);
  assert.equal(view.updates.length, updates);
  assert.equal(view.timerCount(), 0);
});

test('superseded initialization is shared and still supplies viewer, teams, relationships, recommendations and blocks', async () => {
  const gate = deferred();
  const view = ui({ initializationGate: gate }); await view.advance();
  view.change('B'); await view.advance();
  assert.equal(view.initialReads.length, 5);
  assert.equal(view.rpcCalls.length, 1);
  assert.equal(view.queries.length, 0);
  gate.resolve(); await flush();
  assert.equal(view.queries.length, 1);
  assert.match(view.queries[0].expression, /%B%/);
  await resolve(view.queries[0], ok([row('viewer'), row('blocked-out'), row('blocked-in'), row('B')]));
  const state = view.read();
  assert.equal(state.viewer.id, 'viewer');
  assert.equal(state.ownedTeams[0].id, 'owned-team');
  assert.equal(state.recs.recommended.rank, 0);
  assert.equal(state.recs.recommended.matchEngine, 'v3');
  assert.equal(state.relationships.friend, 'connected');
  assert.equal(state.relationships.outgoing, 'request_sent');
  assert.equal(state.relationships.incoming, 'request_received');
  assert.deepEqual(ids(view), ['B']);
  view.change('C'); await view.advance();
  await resolve(view.queries[1], ok([row('C')]));
  assert.equal(view.initialReads.length, 5);
  assert.equal(view.rpcCalls.length, 1);
});

test('a setup exception does not permanently clear firstLoad; Retry can initialize successfully', async () => {
  const gate = deferred();
  const view = ui({ initializationGate: gate }); await view.advance();
  gate.reject(new Error('Setup failed')); await flush();
  assert.equal(view.read().error, 'Setup failed');
  assert.equal(view.read().viewer, null);
  view.setInitializationGate(null);
  const retry = view.retry(); await flush();
  await resolve(view.queries[0], ok([row('ready')])); await retry;
  assert.equal(view.read().viewer.id, 'viewer');
  assert.equal(view.read().ownedTeams.length, 1);
  assert.equal(view.read().error, null);
});

test('unmount during initialization prevents all late metadata and query state updates', async () => {
  const gate = deferred();
  const view = ui({ initializationGate: gate }); await view.advance();
  view.unmount();
  const updates = view.updates.length;
  gate.resolve(); await flush();
  assert.equal(view.updates.length, updates);
  assert.equal(view.queries.length, 0);
  assert(!view.updates.some(update => !update.mounted));
});

test('effect cleanup/setup replay reuses in-flight initialization and invalidates the old query', async () => {
  const gate = deferred();
  const view = ui({ initializationGate: gate }); await view.advance();
  view.restartEffect(); await view.advance();
  assert.equal(view.initialReads.length, 5);
  assert.equal(view.rpcCalls.length, 1);
  gate.resolve(); await flush();
  assert.equal(view.queries.length, 1);
  await resolve(view.queries[0], ok([row('ready')]));
  assert.deepEqual(ids(view), ['ready']);
  assert.equal(view.read().viewer.id, 'viewer');
});

test('a stale auth response cannot start setup or a list query', async () => {
  const auth = deferred();
  const view = ui({ auth: calls => calls === 1 ? auth.promise : { data: { user: { id: 'viewer' } } } });
  await view.advance(); view.change('B'); await view.advance();
  await resolve(view.queries[0], ok([row('B')]));
  auth.resolve({ data: { user: { id: 'viewer' } } }); await flush();
  assert.deepEqual(ids(view), ['B']);
  assert.equal(view.initialReads.length, 5);
  assert.equal(view.queries.length, 1);
});

test('rapid changes within debounce issue only the final query', async () => {
  const view = ui();
  await view.advance(100); view.change('B');
  await view.advance(100); view.change('C', 'active');
  await view.advance(299); assert.equal(view.queries.length, 0);
  await view.advance(1); assert.equal(view.queries.length, 1);
  assert.match(view.queries[0].expression, /%C%/);
  await resolve(view.queries[0], ok([row('C')]));
  assert.deepEqual(ids(view), ['C']);
});

test('latest results preserve true/false/null/omitted availability without rewrites', async () => {
  const view = ui(); await view.advance();
  const omitted = { id: 'omitted' };
  await resolve(view.queries[0], ok([row('yes', true), row('no', false), row('unknown', null), omitted]));
  assert.deepEqual(Array.from(view.read().builders, builder => builder.is_available), [true, false, null, undefined]);
  assert(!Object.hasOwn(view.read().builders[3], 'is_available'));
});

test('invitation prechecks and existing RPC remain unchanged', async () => {
  const view = ui(); await view.advance();
  await resolve(view.queries[0], ok([row('unknown', null)]));
  const success = await view.read().sendInvite('owned-team', 'unknown');
  assert.equal(success, true);
  const call = view.rpcCalls.find(call => call.name === 'send_team_invite');
  assert.equal(call.args.p_team_id, 'owned-team');
  assert.equal(call.args.p_invited_user_id, 'unknown');
  assert.equal(view.read().inviteBusy, false);
  assert.equal(view.toasts[0].message, 'Invite sent successfully!');
  for (const option of ['existingMember', 'existingInvite']) {
    const blocked = ui({ [option]: { id: 'existing' } });
    assert.equal(await blocked.read().sendInvite('owned-team', 'unknown'), false);
    assert(!blocked.rpcCalls.some(call => call.name === 'send_team_invite'));
    assert.equal(blocked.read().inviteBusy, false);
  }
});
