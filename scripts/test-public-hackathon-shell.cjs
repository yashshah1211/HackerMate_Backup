/* eslint-disable @typescript-eslint/no-require-imports -- Offline actual React shell lifecycle regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const A = 'synthetic-account-A', B = 'synthetic-account-B';
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function hookView(options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/hackathons' });
  const previous = { window: global.window, document: global.document, IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  if (options.cached) dom.window.localStorage.setItem('hackermate_user_cache', JSON.stringify({ id: options.cached, full_name: 'Cached synthetic identity' }));
  const wait = deferred(), started = deferred(), records = { reads: [], writes: [], channels: [], intervals: new Set(), toasts: [], frames: [], adds: 0, removes: 0 };
  let intervalId = 0, paused = false;
  const client = { auth: { getUser: async () => {
    if (options.delay === 'user') { started.resolve(); await wait.promise; }
    return { data: { user: { id: options.user || A } }, error: null };
  } }, from(table) {
    let columns = '', updating = false; const filters = [];
    const execute = async () => {
      const entry = { table, columns, filters: [...filters] };
      if (updating) records.writes.push(entry); else records.reads.push(entry);
      const phase = updating ? 'heartbeat' : table === 'profiles' ? 'profile' : table === 'notifications' ? 'private' : '';
      if (!paused && options.delay === phase) { paused = true; started.resolve(); await wait.promise; }
      if (table === 'profiles' && !updating) return { data: { id: options.user || A, full_name: 'Verified synthetic identity', avatar_url: null, role: 'user', current_streak: 0 }, error: null };
      return { data: [], count: 0, error: null };
    };
    return { select(value) { columns = value; return this; }, eq(key, value) { filters.push([key, value]); return this; }, not() { return this; }, neq() { return this; }, in() { return this; }, update() { updating = true; return this; }, single: execute, then(resolve, reject) { return execute().then(resolve, reject); } };
  }, channel(name) { const channel = { name, callback: null, stopped: false, on(_type, _filter, callback) { this.callback = callback; return this; } }; records.channels.push(channel); return channel; } };
  const showToast = message => records.toasts.push(message);
  const add = dom.window.document.addEventListener.bind(dom.window.document), remove = dom.window.document.removeEventListener.bind(dom.window.document);
  dom.window.document.addEventListener = (type, fn, ...rest) => { if (type === 'visibilitychange') records.adds++; return add(type, fn, ...rest); };
  dom.window.document.removeEventListener = (type, fn, ...rest) => { if (type === 'visibilitychange') records.removes++; return remove(type, fn, ...rest); };
  const loader = harness({ '@/lib/supabase': { supabase: client, subscribeWithRetry: channel => () => { channel.stopped = true; } },
    '@/context/NotificationContext': { useNotification: () => ({ showToast }) } }, {
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    setInterval: () => { const id = ++intervalId; records.intervals.add(id); return id; }, clearInterval: id => records.intervals.delete(id),
  });
  const useShellSession = loader.load('src/components/shell/useShellSession.ts').useShellSession;
  function Subject() { const session = useShellSession(options.expected || A); records.frames.push({ viewerId: session.viewerId, profile: session.profile }); return React.createElement('span', null, session.viewerId); }
  const root = createRoot(dom.window.document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Subject)));
  const settle = async () => { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 12)); }); };
  await settle(); let unmounted = false;
  return { records, started: started.promise, release: () => wait.resolve(), settle,
    async unmount() { if (!unmounted) { unmounted = true; await React.act(async () => root.unmount()); } },
    async close() { wait.resolve(); await settle(); if (!unmounted) await React.act(async () => root.unmount()); dom.window.close(); Object.assign(global, previous); },
  };
}
for (const phase of ['profile', 'heartbeat', 'private']) test(`private shell: pending ${phase} cannot install resources after unmount`, async () => {
  const view = await hookView({ delay: phase });
  try {
    await view.started; await view.unmount(); const writes = view.records.writes.length;
    view.release(); await view.settle();
    assert.equal(view.records.writes.length, writes, 'No new writes after unmount');
    assert.equal(view.records.channels.length, 0, 'No late private channel');
    assert.equal(view.records.intervals.size, 0, 'No late heartbeat');
    assert.equal(view.records.adds, view.records.removes, 'Visibility listeners cleaned up');
  } finally { await view.close(); }
});
test('private shell: stale notification callbacks cannot query or toast after teardown', async () => {
  const view = await hookView();
  try {
    assert.equal(view.records.channels.length, 1); const channel = view.records.channels[0];
    await view.unmount(); assert.equal(channel.stopped, true);
    const reads = view.records.reads.length;
    channel.callback({ eventType: 'INSERT', new: { message: 'Stale synthetic notification' } }); await view.settle();
    assert.equal(view.records.reads.length, reads, 'Detached callbacks must not read private data');
    assert.equal(view.records.toasts.length, 0, 'Detached callbacks must not show previous-account notifications');
    assert.equal(view.records.intervals.size, 0);
  } finally { await view.close(); }
});
test('private shell: verified account A never renders cached account B', async () => {
  const view = await hookView({ cached: B, delay: 'user' });
  try {
    await view.started;
    assert(!view.records.frames.some(frame => frame.viewerId === B || frame.profile?.id === B), 'Cached B must stay hidden while A verification is unresolved');
    view.release(); await view.settle(); assert(view.records.frames.some(frame => frame.viewerId === A));
  }
  finally { await view.close(); }
});
test('private shell: a changed verified identity cannot start account B work under account A', async () => {
  const view = await hookView({ expected: A, user: B });
  try { assert.equal(view.records.writes.length, 0); assert.equal(view.records.channels.length, 0); assert(!view.records.frames.some(frame => frame.viewerId === B)); assert.equal(view.records.reads.length, 0); }
  finally { await view.close(); }
});

async function appView(options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/hackathons?q=water&tab=past' });
  const previous = { window: global.window, document: global.document, localStorage: global.localStorage, IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(global, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const records = { mounts: [], cleanups: [], listeners: new Set(), hookCalls: 0 };
  let userId = options.user || null;
  const client = { auth: {
    async getSession() { return { data: { session: userId ? { user: { id: userId } } : null }, error: null }; },
    async getUser() { return { data: { user: userId ? { id: userId } : null }, error: options.unverified ? { name: 'AuthApiError' } : null }; },
    onAuthStateChange(fn) { records.listeners.add(fn); return { data: { subscription: { unsubscribe() { records.listeners.delete(fn); } } } }; },
    async signOut() { userId = null; records.listeners.forEach(fn => fn('SIGNED_OUT', null)); return { error: null }; },
  }, from(table) { assert.equal(table, 'profiles'); return { select(columns) { assert.equal(columns, 'id,is_banned,onboarding_completed'); return this; }, eq() { return this; }, async maybeSingle() { return { data: { id: userId, is_banned: !!options.banned, onboarding_completed: true }, error: null }; } }; } };
  const pass = props => React.createElement(React.Fragment, null, props.children);
  const system = { Button: props => React.createElement('button', { onClick: props.onClick }, props.children),
    ButtonLink: props => React.createElement('a', { href: props.href }, props.children),
    ErrorNotice: props => React.createElement('p', { role: 'alert' }, props.title), Page: pass,
    PageLoader: props => React.createElement('p', { role: 'status' }, props.label), Dialog: () => null };
  function usePrivateShell(expected) {
    records.hookCalls++; const identity = expected || userId;
    React.useEffect(() => { records.mounts.push(identity); return () => records.cleanups.push(identity); }, [identity]);
    return { mounted: true, viewerId: identity, hasSession: true, profile: null, teams: [], signOut: () => client.auth.signOut(), setUnreadNotifications() {} };
  }
  const loader = harness({ '@/lib/supabase': { supabase: client }, '@/components/system': system,
    'next/navigation': { usePathname: () => '/hackathons', useSearchParams: () => new URLSearchParams(dom.window.location.search) },
    'next/link': props => React.createElement('a', { href: props.href }, props.children),
    './useShellSession': { useShellSession: usePrivateShell },
    './ShellContext': { ShellProvider: pass }, './ShellFrame': { ShellFrame: props => React.createElement('div', { 'data-private-shell': true }, props.children) },
    './AccountMenu': { AccountSheet: () => null }, '@/components/FeedbackWidget': () => null,
    '@/components/DailyStreakTracker': () => null, '@/components/NotificationDrawer': () => null,
    '@/components/Footer': () => null, '@/components/Logo': () => null,
    '@/components/landing/LandingStageNav': { LandingScrollProgress: () => null, LandingStageNav: () => null },
  }, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage });
  const AppShell = loader.load('src/components/shell/AppShell.tsx').default;
  const Boundary = loader.load('src/components/hackathons/BrowsingBoundary.tsx').default;
  const root = createRoot(dom.window.document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(AppShell, null, React.createElement(Boundary, null, access => React.createElement('p', null, `Verified ${access.kind}`)))));
  const settle = async () => { for (let i = 0; i < 4; i++) await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 8)); }); };
  await settle();
  return { records, dom, get html() { return dom.window.document.body.innerHTML; },
    async emit(event, identity) { userId = identity; await React.act(async () => records.listeners.forEach(fn => fn(event, identity ? { user: { id: identity } } : null))); await settle(); },
    async signOutExplicitly() { const button = [...dom.window.document.querySelectorAll('button')].find(node => node.textContent === 'Sign out and browse public events'); assert(button); await React.act(async () => button.click()); await settle(); },
    async close() { await React.act(async () => root.unmount()); assert.equal(records.listeners.size, 0); dom.window.close(); Object.assign(global, previous); },
  };
}
test('shell boundary: genuine guests initialize no private shell and inherit one verifier', async () => {
  const view = await appView();
  try { assert.match(view.html, /data-public-discovery-shell/); assert.match(view.html, /Verified guest/); assert.equal(view.records.hookCalls, 0); assert.equal(view.records.listeners.size, 1); }
  finally { await view.close(); }
});
for (const [name, options, message] of [['suspended', { user: A, banned: true }, 'Account suspended'], ['unverifiable', { user: A, unverified: true }, 'Account verification unavailable']]) test(`shell boundary: ${name} never mounts private or guest content`, async () => {
  const view = await appView(options);
  try { assert.match(view.html, new RegExp(message)); assert(!view.html.includes('data-public-discovery-shell')); assert(!view.html.includes('data-private-shell')); assert.equal(view.records.hookCalls, 0); }
  finally { await view.close(); }
});
test('shell boundary: account A to B switching cleans old shell and uses only one verifier', async () => {
  const view = await appView({ user: A });
  try { assert.deepEqual(view.records.mounts, [A]); await view.emit('SIGNED_IN', B); assert.deepEqual(view.records.cleanups, [A]); assert.deepEqual(view.records.mounts, [A, B]); assert.equal(view.records.listeners.size, 1); assert.match(view.html, /data-private-shell/); }
  finally { await view.close(); }
});
test('shell boundary: unsolicited sign-out cleans private shell and requires explicit guest recovery', async () => {
  const view = await appView({ user: A });
  try { await view.emit('SIGNED_OUT', null); assert.deepEqual(view.records.cleanups, [A]); assert.match(view.html, /Account verification unavailable/); assert(!view.html.includes('data-public-discovery-shell')); await view.signOutExplicitly(); assert.match(view.html, /data-public-discovery-shell/); assert.equal(view.records.mounts.length, 1); }
  finally { await view.close(); }
});
