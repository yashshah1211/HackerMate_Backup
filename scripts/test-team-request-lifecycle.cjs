/* eslint-disable @typescript-eslint/no-require-imports -- Offline React lifecycle tests; no live services. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
if (process.argv.includes('--baseline')) {
  mkdirSync('scratch', { recursive: true });
  writeFileSync('scratch/team-request-baseline.tsx', execFileSync('git', ['show', 'fb3fd3df89836cc782f3123ef296cbc5600a1768:src/app/teams/[id]/page.tsx']));
}
const A = 'fixture-a', B = 'fixture-b';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function mount(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://offline.example/teams/fixture-team', pretendToBeVisual: true });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  const { createRoot } = require('react-dom/client');
  let root = createRoot(document.getElementById('root')), active = true, overview, route = 'fixture-team';
  const server = { user: A, pending: true, member: false, owner: 'fixture-owner', search: '', ...options };
  const listeners = new Set(), reads = [], writes = [], events = [], errors = [], toasts = [], confirmations = [];
  const gates = { auth: [], team_join_requests: [], team_members: [], rpc: [], teams: [] };
  const authResult = () => ({ data: { user: server.user ? { id: server.user } : null }, error: server.authError || null });
  const client = {
    auth: {
      getUser: async () => gates.auth.length ? gates.auth.shift() : authResult(),
      onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe() { listeners.delete(fn); } } } }; },
    },
    from(table) {
      const q = { table, filters: {} };
      return {
        select(columns) { q.columns = columns; return this; }, eq(key, value) { q.filters[key] = value; return this; },
        maybeSingle() { q.single = true; return this; }, single() { q.single = true; return this; },
        limit(value) { q.limit = value; return this; }, abortSignal(signal) { q.signal = signal; return this; },
        then(resolve, reject) {
          reads.push(q);
          let data = null;
          if (table === 'teams') data = { id: q.filters.id, name: 'QA Campus Builders', owner_id: server.owner, max_members: 4, team_hackathons: [], skills: [] };
          if (table === 'profiles') data = { skills: ['React'] };
          if (table === 'team_invites') data = server.invite ? { id: 'fixture-invite', status: 'pending' } : null;
          if (table === 'team_members') data = q.single ? server.member ? { id: 'fixture-member' } : null : [];
          if (table === 'team_hackathons') data = [];
          if (table === 'team_join_requests') data = server.pending ? { id: 'fixture-request' } : null;
          const result = { data, error: server[table + 'Error'] || null };
          return Promise.resolve(gates[table]?.length && (table !== 'team_members' || q.single) ? gates[table].shift() : result).then(resolve, reject);
        },
      };
    },
    async rpc(name, args) {
      writes.push({ name, args: JSON.parse(JSON.stringify(args)), user: server.user });
      const result = gates.rpc.length ? await gates.rpc.shift() : { error: server.rpcError || null };
      if (!result.error && name === 'request_to_join_team') server.pending = true;
      if (!result.error && name === 'join_team_instantly') { server.member = true; server.pending = false; }
      return result;
    },
  };
  const notification = { showToast: (...args) => toasts.push(args), confirm: value => confirmations.push(value) };
  const Component = harness({
    'next/navigation': { useParams: () => ({ id: route }), useRouter: () => ({ push() {} }), useSearchParams: () => new URLSearchParams(server.search) },
    '@/lib/supabase': { supabase: client }, '@/lib/posthog': { trackEvent: (name, properties) => events.push({ name, properties: JSON.parse(JSON.stringify(properties)) }) },
    '@/context/NotificationContext': { useNotification: () => notification },
    '@/components/TeamOverviewView': props => { overview = props; return React.createElement('div', null, props.isPublicVisitor ? 'Visitor' : props.requestStatus === 'error' ? 'Unable to verify' : props.requestSent ? 'Request sent' : 'Request to join'); },
    '@/components/system': {
      PageLoader: props => React.createElement('p', null, props.label), Page: props => React.createElement('div', null, props.children),
      ErrorNotice: props => React.createElement('button', { onClick: props.onRetry }, props.title || 'Retry'),
    },
  }, { window: dom.window, document: dom.window.document, AbortController, console: { error: (...args) => errors.push(args) } }).load(process.argv.includes('--baseline') ? 'scratch/team-request-baseline.tsx' : 'src/app/teams/[id]/page.tsx').default;
  const flush = async fn => React.act(async () => {
    fn?.(); for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 2));
  });
  const render = () => root.render(server.strict ? React.createElement(React.StrictMode, null, React.createElement(Component)) : React.createElement(Component));
  t.after(async () => {
    if (active) await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  if (options.initialAuth) gates.auth.push(options.initialAuth);
  await flush(render); await flush();
  return { server, reads, writes, events, errors, toasts, confirmations, listeners, flush, overview: () => overview, text: () => document.body.textContent,
    gate: (key, promise) => gates[key].push(promise),
    focus: () => flush(() => dom.window.dispatchEvent(new dom.window.Event('focus'))),
    teamChange: () => flush(() => dom.window.dispatchEvent(new dom.window.Event('hm:teams-changed'))),
    auth: user => flush(() => { server.user = user; for (const fn of listeners) fn(user ? 'SIGNED_IN' : 'SIGNED_OUT', user ? { user: { id: user } } : null); }),
    route: id => flush(() => { route = id; render(); }),
    unmount: async () => { await React.act(async () => root.unmount()); active = false; },
    remount: async () => { root = createRoot(document.getElementById('root')); active = true; await flush(render); await flush(); },
    visible: value => flush(() => { Object.defineProperty(dom.window.document, 'visibilityState', { configurable: true, value }); dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')); }),
  };
}

test('pending request removed: explicit refresh clears Request sent without inventing history', async t => {
  const ui = await mount(t); assert.equal(ui.overview().requestSent, true);
  ui.server.pending = false; await ui.flush(() => ui.overview().refreshTeam());
  assert.equal(ui.overview().requestSent, false);
});
test('focus, visibility and team events refresh status; acceptance becomes membership', async t => {
  const ui = await mount(t); ui.server.pending = false; await ui.focus(); assert.equal(ui.overview().requestSent, false);
  ui.server.pending = true; await ui.visible('visible'); assert.equal(ui.overview().requestSent, true);
  ui.server.pending = false; ui.server.member = true; await ui.teamChange();
  assert.equal(ui.overview().isMember, true); assert.equal(ui.overview().requestSent, false); assert.deepEqual(ui.writes, []);
});
for (const table of ['team_join_requests', 'team_members']) test(`${table} failure is unknown, blocks submission, and Retry only reads`, async t => {
  const ui = await mount(t, { pending: false, [table + 'Error']: { code: '42501', message: 'Fixture denied' } });
  assert.equal(ui.overview().requestStatus, 'error');
  await ui.flush(() => ui.overview().requestToJoin()); assert.deepEqual(ui.writes, []); assert(ui.errors.length);
  ui.server[table + 'Error'] = null; await ui.flush(() => ui.overview().retryRequest());
  assert.equal(ui.overview().requestStatus, 'ready'); assert.equal(ui.overview().requestSent, false); assert.deepEqual(ui.writes, []);
});
test('account switch and logout clear pending, owner, invite and membership state', async t => {
  const ui = await mount(t, { owner: A, invite: true, member: true });
  assert.equal(ui.overview().isOwner, true); ui.server.pending = false; ui.server.member = false; ui.server.invite = false;
  await ui.auth(B); assert.equal(ui.overview().requestSent, false); assert.equal(ui.overview().isOwner, false);
  assert.equal(ui.overview().isMember, false); assert.equal(ui.overview().pendingInvite, null);
  await ui.auth(null); assert.equal(ui.overview().isPublicVisitor, true); assert.equal(ui.overview().requestSent, false);
});
test('new team route cannot retain the previous team pending or owner state', async t => {
  const ui = await mount(t, { owner: A }); ui.server.pending = false; ui.server.owner = B;
  await ui.route('fixture-other'); assert.equal(ui.overview().team.id, 'fixture-other');
  assert.equal(ui.overview().requestSent, false); assert.equal(ui.overview().isOwner, false);
});
test('late old-account pending response cannot overwrite current account', async t => {
  const ui = await mount(t); const gate = deferred(); ui.gate('team_join_requests', gate.promise);
  await ui.focus(); ui.server.pending = false; await ui.auth(B);
  await ui.flush(() => gate.resolve({ data: { id: 'fixture-old' }, error: null }));
  assert.equal(ui.overview().requestSent, false); assert.equal(ui.overview().isPublicVisitor, false);
});
test('late older read cannot overwrite a newer refresh', async t => {
  const ui = await mount(t); const gate = deferred(); ui.gate('team_join_requests', gate.promise);
  await ui.focus(); ui.server.pending = false; await ui.focus();
  await ui.flush(() => gate.resolve({ data: { id: 'fixture-stale' }, error: null })); assert.equal(ui.overview().requestSent, false);
});
test('delayed initial auth cannot resurrect a signed-out account', async t => {
  const gate = deferred(); const ui = await mount(t, { initialAuth: gate.promise }); await ui.auth(null);
  await ui.flush(() => gate.resolve({ data: { user: { id: A } }, error: null }));
  assert.equal(ui.overview().isPublicVisitor, true); assert.equal(ui.overview().requestSent, false);
});
test('synchronous duplicate handler calls submit once and emit exactly one safe success event', async t => {
  const ui = await mount(t, { pending: false });
  await ui.flush(() => { void ui.overview().requestToJoin(); void ui.overview().requestToJoin(); });
  assert.equal(ui.writes.length, 1); assert.deepEqual(ui.events, [{ name: 'team_join_request_sent', properties: { source: 'team_detail' } }]);
  assert.equal(ui.overview().requestSent, true);
});
test('preflight detects a request submitted elsewhere and never calls the RPC', async t => {
  const ui = await mount(t, { pending: false }); ui.server.pending = true;
  await ui.flush(() => ui.overview().requestToJoin()); assert.deepEqual(ui.writes, []); assert.equal(ui.overview().requestSent, true);
});
test('preflight read failure prevents submission', async t => {
  const ui = await mount(t, { pending: false }); ui.server.team_membersError = { message: 'Fixture offline' };
  await ui.flush(() => ui.overview().requestToJoin()); assert.deepEqual(ui.writes, []); assert.deepEqual(ui.events, []);
});
test('identity change during preflight prevents an old action from submitting for a new user', async t => {
  const ui = await mount(t, { pending: false }); const gate = deferred(); ui.gate('auth', gate.promise);
  await ui.flush(() => { void ui.overview().requestToJoin(); }); await ui.auth(B);
  await ui.flush(() => gate.resolve({ data: { user: { id: A } }, error: null })); assert.deepEqual(ui.writes, []);
});
test('late submission success is not applied to another account', async t => {
  const ui = await mount(t, { pending: false }); const gate = deferred(); ui.gate('rpc', gate.promise);
  await ui.flush(() => { void ui.overview().requestToJoin(); }); assert.equal(ui.writes.length, 1);
  await ui.auth(B); await ui.flush(() => gate.resolve({ error: null }));
  assert.equal(ui.overview().requestSent, false); assert.deepEqual(ui.events, []);
});
for (const error of [{ code: '23505', message: 'Duplicate fixture' }, { code: 'P0001', message: 'A join request is already pending' }, { code: '42501', message: 'Denied fixture' }]) test(`RPC ${error.code}/${error.message} never emits success`, async t => {
  const ui = await mount(t, { pending: false, rpcError: error }); await ui.flush(() => ui.overview().requestToJoin());
  assert.equal(ui.writes.length, 1); assert.deepEqual(ui.events, []); assert.equal(ui.overview().requestLoading, false);
});
test('rejected network promise unlocks submission without automatic retry or success analytics', async t => {
  const ui = await mount(t, { pending: false }); const gate = deferred(); ui.gate('rpc', gate.promise);
  await ui.flush(() => { void ui.overview().requestToJoin(); }); await ui.flush(() => gate.resolve(Promise.reject(new Error('Fixture disconnected'))));
  assert.equal(ui.overview().requestLoading, false); assert.deepEqual(ui.events, []); assert.equal(ui.writes.length, 1);
});
test('unmount unsubscribes and delayed reads have no effects; remount reads fresh status', async t => {
  const ui = await mount(t); const gate = deferred(); ui.gate('team_join_requests', gate.promise); await ui.focus();
  await ui.unmount(); assert.equal(ui.listeners.size, 0); await ui.flush(() => gate.resolve({ data: null, error: null }));
  ui.server.pending = false; await ui.remount(); assert.equal(ui.overview().requestSent, false); assert.deepEqual(ui.writes, []);
});
test('instant invitation preserves confirmation, exact token and refreshes membership without request analytics', async t => {
  const ui = await mount(t, { search: 'join=true&token=fixture%7Ctoken%7Csignature' });
  assert.equal(ui.confirmations.length, 1); assert.deepEqual(ui.writes, []);
  await ui.flush(() => { void ui.confirmations[0].onConfirm(); });
  assert.deepEqual(ui.writes, [{ name: 'join_team_instantly', args: { p_team_id: 'fixture-team', p_token: 'fixture|token|signature' }, user: A }]);
  assert.equal(ui.overview().isMember, true); assert.equal(ui.overview().requestSent, false); assert.deepEqual(ui.events, []);
});
test('stale instant confirmation cannot join after account switch', async t => {
  const ui = await mount(t, { search: 'join=true&token=fixture-token' }); const oldConfirm = ui.confirmations[0]; await ui.auth(B);
  await ui.flush(() => { void oldConfirm.onConfirm(); }); assert.deepEqual(ui.writes, []);
});
test('Strict Mode mounts only read; query projection and filters remain minimal', async t => {
  const ui = await mount(t, { strict: true }); assert.equal(ui.overview().requestSent, true); assert.deepEqual(ui.writes, []);
  const requests = ui.reads.filter(q => q.table === 'team_join_requests'); assert(requests.length);
  for (const q of requests) { assert.equal(q.columns, 'id'); assert.deepEqual(q.filters, { team_id: 'fixture-team', user_id: A, status: 'pending' }); }
});

test('failed refresh retains a known pending request and does not imply absence', async t => {
  const ui = await mount(t); ui.server.pending = false; ui.server.team_join_requestsError = { message: 'Fixture failure' };
  await ui.focus(); assert.equal(ui.overview().requestSent, true); assert.equal(ui.overview().requestStatus, 'error');
  await ui.flush(() => ui.overview().requestToJoin()); assert.deepEqual(ui.writes, []);
});
test('duplicate pending rows are a read error, never an empty result or submission permission', async t => {
  const ui = await mount(t, { team_join_requestsError: { code: 'PGRST116', message: 'Multiple rows returned' } });
  assert.equal(ui.overview().requestStatus, 'error'); await ui.flush(() => ui.overview().requestToJoin()); assert.deepEqual(ui.writes, []);
});
test('initial authentication errors fail closed and log the actual error', async t => {
  const ui = await mount(t, { authError: { code: 'FixtureAuth', message: 'Fixture verification failure' } });
  assert.match(ui.text(), /Couldn't verify your account/); assert.equal(ui.overview(), undefined);
  assert.equal(ui.reads.length, 0); assert.equal(ui.errors[0][1].code, 'FixtureAuth'); assert.deepEqual(ui.writes, []);
});
test('a thrown read error becomes unknown and never enables submission', async t => {
  const ui = await mount(t); const gate = deferred(); ui.gate('team_join_requests', gate.promise); await ui.focus();
  await ui.flush(() => gate.resolve(Promise.reject(new Error('Fixture read disconnected'))));
  assert.equal(ui.overview().requestStatus, 'error'); assert.equal(ui.overview().requestSent, true); assert(ui.errors.length);
});
test('returning to the same account cannot revive an earlier pending read', async t => {
  const ui = await mount(t); const gate = deferred(); ui.gate('team_join_requests', gate.promise); await ui.focus();
  ui.server.pending = false; await ui.auth(B); await ui.auth(A);
  await ui.flush(() => gate.resolve({ data: { id: 'fixture-old-a' }, error: null })); assert.equal(ui.overview().requestSent, false);
});
test('instant confirmation from an earlier same-account session remains invalid', async t => {
  const ui = await mount(t, { search: 'join=true&token=fixture-token' }); const old = ui.confirmations[0];
  await ui.auth(B); await ui.auth(A); await ui.flush(() => { void old.onConfirm(); }); assert.deepEqual(ui.writes, []);
});
test('hidden-tab event does not refresh or submit', async t => {
  const ui = await mount(t); const before = ui.reads.length; await ui.visible('hidden'); assert.equal(ui.reads.length, before); assert.deepEqual(ui.writes, []);
});
test('the SDK missing-session result remains a public visitor, while other auth errors fail closed', async t => {
  const ui = await mount(t, { user: null, authError: { name: 'AuthSessionMissingError', message: 'Auth session missing!' } });
  assert.equal(ui.overview()?.isPublicVisitor, true); assert.equal(ui.overview()?.requestSent, false); assert.deepEqual(ui.writes, []);
});
