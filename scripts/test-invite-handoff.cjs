/* eslint-disable @typescript-eslint/no-require-imports -- Offline tests use the repository's existing TypeScript harness. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness } = require('./ppt-vision-harness.cjs');

const TEAM = '10000000-0000-0000-0000-000000000001';
const OTHER_TEAM = '10000000-0000-0000-0000-000000000002';
const fixture = () => [
  { id: 'invite-a', status: 'pending', team_id: TEAM, teams: { id: TEAM, name: 'Fixture Alpha', description: 'First team', max_members: 4 }, profiles: { full_name: 'Owner A' } },
  { id: 'invite-b', status: 'pending', team_id: OTHER_TEAM, teams: { id: OTHER_TEAM, name: 'Fixture Beta', description: 'Second team', max_members: 4 }, profiles: { full_name: 'Owner B' } },
];
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function ui(options = {}) {
  const initial = options.invites || fixture();
  const values = [initial, false, null, new Set(), null];
  const refs = [];
  let cursor = 0, refCursor = 0, effect, cleanup, realtime;
  let serverInvites = initial;
  let query = options.query;
  let stopped = false;
  const calls = [], toasts = [], events = [], dispatched = [];
  const hooks = {
    ...React,
    useState(start) {
      const index = cursor++;
      if (!(index in values)) values[index] = start;
      return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value; }];
    },
    useRef(start) { const index = refCursor++; return refs[index] ||= { current: start }; },
    useEffect(fn) { effect ||= fn; },
  };
  const builder = {
    select() { return this; }, eq() { return this; },
    then(resolve, reject) { return Promise.resolve(query ? query() : { data: serverInvites, error: null }).then(resolve, reject); },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } } }) },
    from(table) { assert.equal(table, 'team_invites'); return builder; },
    rpc(name, args) { calls.push({ name, args }); return options.rpc ? options.rpc(name, args) : Promise.resolve({ error: null }); },
    channel() { return { on(event, filter, callback) { assert.equal(filter.filter, 'invited_user_id=eq.fixture-user'); realtime = callback; return this; } }; },
  };
  const element = tag => props => React.createElement(props.as || tag, {
    href: props.href, className: props.className, disabled: props.disabled || props.loading,
    onClick: props.onClick, 'aria-label': props['aria-label'],
  }, props.children);
  const system = new Proxy({}, { get: (_, name) => {
    if (name === 'EmptyState') return props => React.createElement('p', null, props.title, props.body, props.action);
    if (name === 'ErrorNotice') return props => React.createElement('p', null, props.title, props.detail);
    if (name === 'PageHeader') return props => React.createElement('header', null, props.title, props.meta);
    return element(name === 'Button' ? 'button' : name === 'ButtonLink' ? 'a' : 'div');
  } });
  const overrides = {
    react: hooks,
    'next/link': element('a'),
    'motion/react': { AnimatePresence: ({ children }) => children, motion: { li: element('li') } },
    '@/lib/supabase': { supabase: client, subscribeWithRetry: () => () => { stopped = true; } },
    '@/context/NotificationContext': { useNotification: () => ({ showToast: (message, type) => toasts.push({ message, type }) }) },
    '@/lib/posthog': { trackEvent: (name, props) => { events.push({ name, props }); if (options.track) options.track(); } },
    '@/components/system': system,
    '@/app/teams/TeamsTabs': () => null,
  };
  const Component = harness(overrides, { window: { dispatchEvent: event => dispatched.push(event.type) }, Event }).load('src/app/invites/page.tsx').default;
  let tree;
  function render() { cursor = 0; refCursor = 0; tree = Component(); return tree; }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  }
  render();
  return {
    values, calls, toasts, events, dispatched, render,
    html: () => renderToStaticMarkup(render()),
    button(label, inviteId) {
      const root = inviteId ? find(tree, node => node.key === inviteId) : tree;
      return find(root, node => node.props?.children === label);
    },
    mount: async () => { cleanup = effect(); await settle(); },
    refresh: async () => { assert(realtime, 'Realtime subscription must be mounted'); realtime(); await settle(); },
    setServer: invites => { serverInvites = invites; },
    setQuery: fn => { query = fn; },
    unmount: () => { cleanup(); return stopped; },
  };
}

test('only confirmed acceptance displays the named team workspace action without automatic navigation', async () => {
  const pending = deferred();
  const view = ui({ rpc: () => pending.promise });
  view.button('Accept', 'invite-a').props.onClick();
  assert(!view.html().includes('Open team workspace'));
  pending.resolve({ data: TEAM, error: null });
  await settle();
  const html = view.html();
  assert.match(html, /You joined Fixture Alpha/);
  assert.match(html, new RegExp(`href="/teams/${TEAM}/workspace"`));
  assert.match(html, /role="status".*aria-live="polite".*aria-atomic="true"/);
  assert.match(html, /sm:flex-row/);
  assert.deepEqual(view.dispatched, ['hm:teams-changed']);
  assert.equal(view.events[0].name, 'team_invite_accepted');
  assert.equal(view.events[0].props.team_id, TEAM);
});

for (const thrown of [false, true]) test(`acceptance ${thrown ? 'exception' : 'RPC rejection'} preserves pending invitations and never claims success`, async () => {
  const view = ui({ rpc: async () => {
    if (thrown) throw new Error('Offline transport failure');
    return { error: { message: 'Team is full' } };
  } });
  view.button('Accept', 'invite-a').props.onClick();
  await settle();
  const html = view.html();
  assert(!html.includes('Open team workspace'));
  assert.match(html, /Fixture Alpha/);
  assert.match(html, /Fixture Beta/);
  assert.equal(view.values[0].length, 2);
  assert.equal(view.values[3].size, 0);
  assert.equal(view.events.length, 0);
  assert.equal(view.dispatched.length, 0);
  assert.equal(view.toasts[0].message, thrown ? 'Failed to accept invite.' : 'Team is full');
});

test('rapid Accept/Decline clicks and stale callbacks cannot resolve an invitation twice', async () => {
  const pending = deferred();
  const view = ui({ rpc: () => pending.promise });
  const accept = view.button('Accept', 'invite-a').props.onClick;
  const decline = view.button('Decline', 'invite-a').props.onClick;
  accept(); accept(); decline();
  assert.equal(view.calls.length, 1);
  view.render();
  assert.equal(view.button('Accept', 'invite-a').props.loading, true);
  assert.equal(view.button('Decline', 'invite-a').props.disabled, true);
  assert.equal(view.button('Accept', 'invite-b').props.loading, false);
  pending.resolve({ error: null });
  await settle();
  accept(); decline();
  assert.equal(view.calls.length, 1);
});

test('Realtime removal during acceptance cannot erase the successful handoff snapshot', async () => {
  const pending = deferred();
  const view = ui({ rpc: () => pending.promise });
  await view.mount();
  view.render(); view.button('Accept', 'invite-a').props.onClick();
  view.setServer([fixture()[1]]);
  await view.refresh();
  assert.equal(view.values[0].length, 1);
  pending.resolve({ data: TEAM, error: null });
  await settle();
  assert.match(view.html(), /You joined Fixture Alpha/);
  view.setServer([]);
  await view.refresh();
  assert.match(view.html(), new RegExp(`href="/teams/${TEAM}/workspace"`));
  assert.equal(view.unmount(), true);
});

test('stale list snapshots cannot resurrect a locally accepted invitation', async () => {
  const view = ui();
  await view.mount();
  const stale = deferred();
  view.setQuery(() => stale.promise);
  view.render(); view.button('Accept', 'invite-a').props.onClick();
  await settle();
  stale.resolve({ data: fixture(), error: null });
  await settle();
  assert.deepEqual(view.values[0].map(invite => invite.id), ['invite-b']);
  assert.match(view.html(), /You joined Fixture Alpha/);
});

test('out-of-order Realtime requests preserve the newest invitation list', async () => {
  const view = ui();
  await view.mount();
  const older = deferred(), newer = deferred();
  let requests = 0;
  view.setQuery(() => ++requests === 1 ? older.promise : newer.promise);
  await view.refresh(); await view.refresh();
  newer.resolve({ data: [fixture()[1]], error: null });
  await settle();
  older.resolve({ data: fixture(), error: null });
  await settle();
  assert.deepEqual(view.values[0].map(invite => invite.id), ['invite-b']);
});

test('other invitations remain independently usable while acceptance is pending', async () => {
  const first = deferred(), second = deferred();
  const view = ui({ rpc: (_, args) => args.p_invite_id === 'invite-a' ? first.promise : second.promise });
  view.button('Accept', 'invite-a').props.onClick();
  view.button('Accept', 'invite-b').props.onClick();
  assert.equal(view.calls.length, 2);
  first.resolve({ error: null });
  await settle();
  view.render();
  assert.equal(view.button('Accept', 'invite-b').props.loading, true);
  second.resolve({ error: null });
  await settle();
  assert.match(view.html(), /You joined Fixture Beta/);
  assert.match(view.html(), new RegExp(`href="/teams/${OTHER_TEAM}/workspace"`));
  assert.equal(view.values[3].size, 0);
});

test('dismissing success preserves the remaining invitations and does not issue an RPC', async () => {
  const view = ui();
  view.button('Accept', 'invite-a').props.onClick();
  await settle();
  view.render(); view.button('Dismiss').props.onClick();
  assert(!view.html().includes('Open team workspace'));
  assert.match(view.html(), /Fixture Beta/);
  assert.equal(view.calls.length, 1);
});

test('Decline still calls its existing RPC, removes only that invite, and creates no handoff', async () => {
  const pending = deferred();
  const view = ui({ rpc: () => pending.promise });
  const decline = view.button('Decline', 'invite-a').props.onClick;
  decline(); decline();
  assert.equal(view.calls.length, 1);
  assert.equal(view.calls[0].name, 'reject_team_invite');
  assert.equal(view.calls[0].args.p_invite_id, 'invite-a');
  pending.resolve({ error: null });
  await settle();
  assert.deepEqual(view.values[0].map(invite => invite.id), ['invite-b']);
  assert(!view.html().includes('Open team workspace'));
  assert.equal(view.toasts[0].message, 'Invite rejected.');
  assert.equal(view.events.length, 0);
});

for (const thrown of [false, true]) test(`Decline ${thrown ? 'exception' : 'rejection'} keeps the invitation and clears busy state`, async () => {
  const view = ui({ rpc: async () => {
    if (thrown) throw new Error('Offline transport failure');
    return { error: { message: 'Decline denied' } };
  } });
  view.button('Decline', 'invite-a').props.onClick();
  await settle();
  assert.equal(view.values[0].length, 2);
  assert.equal(view.values[3].size, 0);
  assert.equal(view.toasts[0].message, thrown ? 'Failed to reject invite.' : 'Decline denied');
});

test('analytics failure cannot block the confirmed handoff or invent an acceptance error', async () => {
  const view = ui({ track: () => { throw new Error('Analytics unavailable'); } });
  view.button('Accept', 'invite-a').props.onClick();
  await settle();
  assert.match(view.html(), /Open team workspace/);
  assert(!view.toasts.some(toast => toast.type === 'error'));
  assert.deepEqual(view.dispatched, ['hm:teams-changed']);
});

test('refresh errors leave confirmed success and other invitations available', async () => {
  const view = ui({ query: async () => { throw new Error('Offline list failure'); } });
  view.button('Accept', 'invite-a').props.onClick();
  await settle();
  const html = view.html();
  assert.match(html, /Open team workspace/);
  assert.match(html, /Fixture Beta/);
  assert.match(html, /Couldn&#x27;t refresh invitations/);
});
