/* eslint-disable @typescript-eslint/no-require-imports -- Offline cross-branch review probes; known defects are observations, not security guarantees. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { test: nodeTest } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { NextRequest } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');
const mode = process.env.AUTH_REVIEW_MODE || 'all';
assert(['all', 'regressions', 'observations'].includes(mode), 'Invalid AUTH_REVIEW_MODE');
const test = (name, fn) => {
  const observation = /^(KNOWN DEFECT|KNOWN LIMITATION|DATABASE LIMITATION)/.test(name);
  if (mode === 'all' || (mode === 'observations') === observation) return nodeTest(name, fn);
};

// Both worktrees are read-only inputs. No SDK is instantiated and no network is used.
assert(process.env.AUTH_REVIEW_ROOT, 'Set AUTH_REVIEW_ROOT to the pinned PR #21 checkout');
assert(process.env.SUSPENSION_REVIEW_ROOT, 'Set SUSPENSION_REVIEW_ROOT to the preserved suspension checkout');
const review = file => path.resolve(process.env.AUTH_REVIEW_ROOT, file);
const suspension = file => path.resolve(process.env.SUSPENSION_REVIEW_ROOT, file);
const browsing = harness().load(review('src/lib/hackathons/publicBrowsing.ts'));
const USER = { id: 'offline-review-actor' };
const active = { id: USER.id, is_banned: false, onboarding_completed: true };

function fixture(options = {}) {
  const listeners = new Set(), operations = [];
  const state = { credential: true, user: USER, profile: { ...active }, ...options };
  const client = {
    operations, listeners, state,
    auth: {
      async getSession() { return { data: { session: state.credential ? { user: USER } : null }, error: state.sessionError || null }; },
      async getUser() { if (state.identityWait) await state.identityWait; return { data: { user: state.user }, error: state.authError || null }; },
      onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe() { listeners.delete(fn); } } } }; },
    },
    from(table) {
      let action = 'select', cursor = null, signal;
      const execute = async () => {
        signal?.throwIfAborted();
        operations.push({ table, action });
        if (table === 'profiles' && action === 'select') {
          if (state.wait) await state.wait;
          return { data: state.profile, error: state.profileError || null };
        }
        if (table === 'hackathons') return { data: cursor ? [] : [{ id: 'offline-event', name: 'Offline event', status: 'approved', archived: false, start_date: '2099-11-01', end_date: '2099-11-03', registration_end: '2099-10-30', tags: [], type: 'external' }], error: null };
        if (table === 'notifications' && action === 'select') return { data: state.notifications || [], error: null, count: 0 };
        if (action === 'insert' && state.waitWrite) await state.waitWrite;
        return { data: [], error: null, count: 0 };
      };
      const query = { select() { return this; }, update() { action = 'update'; return this; }, insert() { action = 'insert'; return this; }, order() { return this; }, limit() { return this; }, eq() { return this; }, not() { return this; },
        gt(column, value) { assert.equal(column, 'id'); cursor = value; return this; }, abortSignal(value) { signal = value; return this; },
        in() { return this; }, neq() { return this; }, single: execute, maybeSingle: execute,
        then(resolve, reject) { return execute().then(resolve, reject); } };
      return query;
    },
    channel(name) { const entry = { channel: name, handlers: [] }; operations.push(entry); return { topic: name, on(_event, _filter, fn) { entry.handlers.push(fn); return this; } }; },
    async rpc(name) { operations.push({ rpc: name }); return { data: { success: false }, error: null }; },
    emit(event, patch = {}) { Object.assign(state, patch); listeners.forEach(fn => fn(event, state.credential ? { user: state.user } : null)); },
  };
  return client;
}

async function serverAccess(client) {
  const loader = harness({ '@supabase/ssr': { createServerClient: () => client }, '@supabase/supabase-js': { createClient: () => client } });
  loader.env.NEXT_PUBLIC_SUPABASE_URL = 'https://offline.invalid';
  loader.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'offline-public-fixture';
  const req = new NextRequest('https://offline.invalid/api/protected', {
    headers: client.state.credential ? { Authorization: 'Bearer offline-token' } : {},
  });
  return loader.load(suspension('src/lib/auth/requireActiveUser.ts')).requireActiveUser(req, { allowGuest: true });
}

for (const [name, options, expected, status] of [
  ['genuine anonymous', { credential: false, user: null, authError: { name: 'AuthSessionMissingError' } }, 'guest', null],
  ['verified active', {}, 'member', 200],
  ['incomplete onboarding', { profile: { ...active, onboarding_completed: false } }, 'member', 200],
  ['unknown onboarding', { profile: { ...active, onboarding_completed: null } }, 'member', 200],
  ['suspended', { profile: { ...active, is_banned: true } }, 'suspended', 403],
  ['missing profile', { profile: null }, 'unavailable', 403],
  ['null ban flag', { profile: { ...active, is_banned: null } }, 'unavailable', 403],
  ['failed profile verification', { profileError: { message: 'offline' } }, 'unavailable', 503],
  ['stale credential', { user: null, authError: { name: 'AuthSessionMissingError', status: 401 } }, 'unavailable', 401],
  ['identity service failure', { authError: { name: 'AuthApiError', status: 503 } }, 'unavailable', 503],
]) test(`PR21/current server comparison: ${name}`, async () => {
  const client = fixture(options);
  const access = await browsing.verifyBrowsingAccess(client);
  assert.equal(access.kind, expected);
  if (expected === 'member') assert.equal(access.onboarded, client.state.profile.onboarding_completed === true);
  const result = await serverAccess(client);
  if (status === null) assert.equal(result, null);
  else if (status === 200) assert.equal(result.user.id, USER.id);
  else assert.equal(result.status, status);
  assert(client.operations.every(op => !op.action || op.action === 'select'));
});

test('PR21 additionally rejects a mismatched returned profile identity', async () => {
  assert.equal((await browsing.verifyBrowsingAccess(fixture({ profile: { ...active, id: 'another-actor' } }))).kind, 'unavailable');
});
test('PR21 rejects session lookup errors before any profile or public read', async () => {
  const client = fixture({ sessionError: new Error('offline') });
  assert.equal((await browsing.verifyBrowsingAccess(client)).kind, 'unavailable');
  assert.deepEqual(client.operations, []);
});

const system = {
  Page: ({ children }) => React.createElement('section', null, children),
  PageLoader: ({ label }) => React.createElement('p', null, label),
  ErrorNotice: ({ title, detail }) => React.createElement('p', null, title, detail),
};
async function boundary(t, client, includeShell = false, directory = false) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://offline.invalid/hackathons' });
  const previous = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, global[key]]));
  Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  const toasts = [], showToast = (...args) => toasts.push(args);
  const directorySystem = new Proxy(system, { get(target, name) {
    if (Object.hasOwn(target, name)) return target[name];
    if (name === '__esModule') return false;
    return props => {
      if (name === 'Sheet' && !props.open) return null;
      if (name === 'IconButton') return React.createElement('button', { 'aria-label': props.label, onClick: props.onClick }, props.children);
      if (name === 'Button') return React.createElement('button', { onClick: props.onClick }, props.children);
      if (name === 'ButtonLink') return React.createElement('a', { href: props.href }, props.children);
      if (name === 'SearchField') return React.createElement('input', { 'aria-label': props.label, value: props.value, onChange: e => props.onChange(e.target.value) });
      if (name === 'Select') return React.createElement('select', { value: props.value, onChange: props.onChange }, props.children);
      return React.createElement('section', null, props.title, props.children, props.footer);
    };
  } });
  const loader = harness({
    '@/lib/supabase': { supabase: client, subscribeWithRetry: () => () => {} },
    '@/lib/hackathons/publicBrowsing': browsing,
    '@/components/system': directorySystem,
    'next/navigation': { useSearchParams: () => new URLSearchParams(dom.window.location.search) },
    'next/link': props => React.createElement('a', { href: props.href }, props.children),
    '@/components/Logo': { LogoMark: () => null },
    '@/context/NotificationContext': { useNotification: () => ({ showToast }) },
  }, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    setInterval: () => 1, clearInterval() {} });
  const Boundary = loader.load(review('src/components/hackathons/BrowsingBoundary.tsx')).default;
  // The alias loader otherwise resolves against this security checkout, which intentionally lacks PR21.
  const Directory = directory ? harness({
    '@/components/hackathons/BrowsingBoundary': { __esModule: true, default: Boundary },
    '@/lib/hackathons/publicBrowsing': browsing, '@/lib/supabase': { supabase: client },
    '@/components/system': directorySystem,
    'next/navigation': { useSearchParams: () => new URLSearchParams(dom.window.location.search) },
    'next/link': props => React.createElement('a', { href: props.href }, props.children),
    '@/components/Logo': { LogoMark: () => null },
    '@/context/NotificationContext': { useNotification: () => ({ showToast }) },
  }, { window: dom.window, URLSearchParams, AbortController, setInterval: () => 1, clearInterval() {} }).load(review('src/app/hackathons/page.tsx')).default : null;
  const useShell = includeShell ? loader.load(review('src/components/shell/useShellSession.ts')).useShellSession : null;
  function Tree() {
    if (useShell) useShell(); // Same ancestry as AppShell: hook effects outside page boundary.
    return Directory ? React.createElement(Directory) : React.createElement(Boundary, null, access => React.createElement('div', { 'data-access': access.kind }, access.kind));
  }
  const settle = async () => { for (let i = 0; i < 3; i++) await React.act(async () => new Promise(resolve => setTimeout(resolve, 10))); };
  t.after(async () => { await React.act(async () => root.unmount()); dom.window.close(); Object.assign(global, previous); assert.equal(client.listeners.size, 0); });
  await React.act(async () => root.render(React.createElement(Tree)));
  await settle();
  return { dom, settle, toasts, get text() { return dom.window.document.body.textContent; }, async save() {
    const button = dom.window.document.querySelector('[aria-label="Save hackathon"]'); assert(button);
    await React.act(async () => button.click()); await settle();
  }, async event(name, patch) { await React.act(async () => client.emit(name, patch)); await settle(); } };
}

for (const initial of ['suspended', 'unavailable']) test(`KNOWN DEFECT observation: automatic credential removal changes ${initial} to guest`, async t => {
  const client = fixture(initial === 'suspended' ? { profile: { ...active, is_banned: true } } : { authError: { name: 'AuthApiError', status: 503 } });
  const app = await boundary(t, client);
  assert.match(app.text, initial === 'suspended' ? /Account suspended/ : /Account verification unavailable/);
  // Supabase also emits this event on non-retryable refresh failure with an expired token.
  // This is not an explicit user sign-out. PR21 has no intent/history latch.
  await app.event('SIGNED_OUT', { credential: false, user: null, authError: { name: 'AuthSessionMissingError' } });
  assert.equal(app.dom.window.document.querySelector('[data-access]').dataset.access, 'guest');
});

test('PR21 discards late account verification after sign-out', async t => {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const client = fixture({ wait });
  const app = await boundary(t, client);
  assert.match(app.text, /Checking account access/);
  await app.event('SIGNED_OUT', { credential: false, user: null, authError: { name: 'AuthSessionMissingError' } });
  assert.match(app.text, /guest/);
  await React.act(async () => release()); await app.settle();
  assert.equal(app.dom.window.document.querySelector('[data-access]').dataset.access, 'guest');
});

test('PR21 re-verifies token refresh and focus; suspended state blocks the page subtree', async t => {
  const client = fixture(); const app = await boundary(t, client);
  assert.match(app.text, /member/);
  await app.event('TOKEN_REFRESHED', { profile: { ...active, is_banned: true } });
  assert.match(app.text, /Account suspended/); assert.equal(app.dom.window.document.querySelector('[data-access]'), null);
  client.state.profile = { ...active };
  await React.act(async () => app.dom.window.dispatchEvent(new app.dom.window.Event('focus'))); await app.settle();
  assert.match(app.text, /member/);
});

test('PR21 actual bookmark handler rechecks current suspension before attempting a write', async t => {
  const client = fixture(); const app = await boundary(t, client, false, true);
  client.state.profile = { ...active, is_banned: true };
  await app.save();
  assert(!client.operations.some(op => op.action === 'insert'));
  assert(app.toasts.some(args => /could not be authorized/.test(args[0])));
});

test('PR21 actual bookmark handler skips a write if sign-out unmounts it during verification', async t => {
  const client = fixture(); const app = await boundary(t, client, false, true);
  let release; client.state.wait = new Promise(resolve => { release = resolve; });
  await app.save();
  await app.event('SIGNED_OUT', { credential: false, user: null, authError: { name: 'AuthSessionMissingError' } });
  await React.act(async () => release()); await app.settle();
  assert(!client.operations.some(op => op.action === 'insert'));
});

test('DATABASE LIMITATION observation: sign-out cannot cancel an already issued bookmark write', async t => {
  const client = fixture(); const app = await boundary(t, client, false, true);
  let release; client.state.waitWrite = new Promise(resolve => { release = resolve; });
  await app.save();
  assert.equal(client.operations.filter(op => op.action === 'insert').length, 1);
  await app.event('SIGNED_OUT', { credential: false, user: null, authError: { name: 'AuthSessionMissingError' } });
  await React.act(async () => release()); await app.settle();
  assert(!app.toasts.some(args => /saved successfully/.test(args[0])), 'Late response cannot publish old-account success');
  // Whether the request commits is decided by database authorization/transaction ordering.
});

for (const state of ['suspended', 'unavailable']) test(`KNOWN DEFECT observation: shared shell attempts protected requests outside the ${state} boundary`, async t => {
  const client = fixture(state === 'suspended' ? { profile: { ...active, is_banned: true } } : { profileError: { message: 'offline' } });
  const app = await boundary(t, client, true);
  assert.match(app.text, state === 'suspended' ? /Account suspended/ : /Account verification unavailable/);
  assert(client.operations.some(op => op.table === 'profiles' && op.action === 'update'), 'Unconditional last_seen_at write attempted');
  for (const table of ['notifications', 'conversation_participants', 'team_members', 'teams']) {
    assert(client.operations.some(op => op.table === table), `Shell still attempts ${table} read`);
  }
  assert(client.operations.some(op => op.channel), 'Shell still subscribes to Realtime');
  // Mock acceptance is not evidence that deployed RLS accepts these requests.
});

test('KNOWN LIMITATION observation: middleware preserves public browsing and does not enforce current ban state on protected routes', async () => {
  let clients = 0;
  const client = fixture({ profile: { ...active, is_banned: true } });
  const loader = harness({ '@supabase/ssr': { createServerClient: () => { clients++; return client; } } });
  const middleware = loader.load(review('src/middleware.ts')).middleware;
  for (const route of ['/hackathons', '/hackathons/offline-event']) {
    assert.equal((await middleware(new NextRequest('https://offline.invalid' + route))).headers.get('x-middleware-next'), '1');
  }
  assert.equal(clients, 0, 'Public reads must remain available without authentication');
  assert.equal((await middleware(new NextRequest('https://offline.invalid/dashboard'))).headers.get('x-middleware-next'), '1');
  assert.equal(clients, 1); assert.equal(client.operations.length, 0, 'Middleware does not inspect the suspension flag');
});

// Read-only Task 2 audit probes. Every Supabase request and timer is a local mock.
async function shellProbe(t, client, { mode = 'app', cache = false, open = false } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://offline.invalid/hackathons' });
  const previous = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, global[key]]));
  Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  if (cache) dom.window.localStorage.setItem('hackermate_user_cache', JSON.stringify({ id: USER.id, full_name: 'Cached actor', role: 'admin' }));
  const timers = new Set(), subscriptions = new Set(); let lastSession;
  const showToast = () => {};
  const wrapper = ({ children }) => React.createElement('div', null, children);
  const stubSystem = new Proxy({}, { get(_target, name) {
    if (name === '__esModule') return false;
    return props => {
      if (['Sheet', 'Dialog'].includes(name) && !props.open) return null;
      return React.createElement('div', null, props.children, props.headerExtra, props.footer);
    };
  } });
  const overrides = {
    '@/lib/supabase': { supabase: client, subscribeWithRetry(channel) { subscriptions.add(channel.topic); return () => subscriptions.delete(channel.topic); } },
    '@/context/NotificationContext': { useNotification: () => ({ showToast }) },
    'next/navigation': { usePathname: () => '/hackathons', useRouter: () => ({ push() {} }) },
    '@/components/system': stubSystem,
    'motion/react': { AnimatePresence: wrapper, motion: { li: wrapper } },
    './ShellContext': { ShellProvider: wrapper },
    './ShellFrame': { ShellFrame: wrapper },
    './AccountMenu': { AccountSheet: () => null },
    './PublicHeader': { PublicHeader: () => null },
    '@/components/Footer': { __esModule: true, default: () => null },
    '@/components/FeedbackWidget': { __esModule: true, default: () => null },
  };
  const loader = harness(overrides, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    CustomEvent: dom.window.CustomEvent, setInterval(fn) { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn) });
  const useShell = loader.load(review('src/components/shell/useShellSession.ts')).useShellSession;
  function HookProbe() { lastSession = useShell(); return React.createElement('p', null, lastSession.viewerId); }
  const Component = mode === 'hook' ? HookProbe : loader.load(review(mode === 'app' ? 'src/components/shell/AppShell.tsx' : 'src/components/NotificationDrawer.tsx')).default;
  const { createRoot } = require('react-dom/client'); const root = createRoot(dom.window.document.getElementById('root'));
  let mounted = true;
  const unmount = async () => { if (mounted) { mounted = false; await React.act(async () => root.unmount()); } };
  const settle = async () => { for (let i = 0; i < 3; i++) await React.act(async () => new Promise(resolve => setTimeout(resolve, 5))); };
  t.after(async () => { await unmount(); dom.window.close(); Object.assign(global, previous); });
  await React.act(async () => root.render(React.createElement(Component, mode === 'drawer' ? { isOpen: open, onClose() {} } : {}, React.createElement('p', null, 'Public page'))));
  await settle();
  return { dom, timers, subscriptions, settle, unmount, get session() { return lastSession; } };
}

test('KNOWN DEFECT observation: actual AppShell cache mounts streak RPC before identity/profile verification', async t => {
  let release; const identityWait = new Promise(resolve => { release = resolve; });
  const client = fixture({ identityWait, profile: { ...active, is_banned: true } });
  const app = await shellProbe(t, client, { cache: true });
  try {
    assert(!client.operations.some(op => op.table === 'profiles'), 'getUser remains pending');
    assert(client.operations.some(op => op.rpc === 'record_daily_visit'), 'Cached viewer mounted the actual tracker before verification');
  } finally { await app.unmount(); release(); await app.settle(); }
});

test('cached viewer alone does not create an authenticated streak RPC without an SDK session', async t => {
  let release; const identityWait = new Promise(resolve => { release = resolve; });
  const client = fixture({ credential: false, user: null, identityWait });
  const app = await shellProbe(t, client, { cache: true });
  try { assert(!client.operations.some(op => op.rpc)); }
  finally { await app.unmount(); release(); await app.settle(); }
});

test('KNOWN DEFECT observation: closed NotificationDrawer subscribes and reloads private data without an active check', async t => {
  const client = fixture({ profile: { ...active, is_banned: true } });
  const app = await shellProbe(t, client, { mode: 'drawer' });
  assert(app.subscriptions.has(`notifications-drawer:${USER.id}`));
  const channel = client.operations.find(op => op.channel);
  await React.act(async () => channel.handlers[0]()); await app.settle();
  assert(client.operations.some(op => op.table === 'team_invites'));
  assert(client.operations.some(op => op.table === 'notifications'));
  assert(!client.operations.some(op => op.table === 'profiles'));
});

test('KNOWN DEFECT observation: NotificationDrawer mark-read sends a protected update without an active check', async t => {
  const client = fixture({ profile: { ...active, is_banned: true }, notifications: [{ id: 'offline-notification', message: 'Team activity', link: null, is_read: false, created_at: '2026-10-15T00:00:00Z' }] });
  const app = await shellProbe(t, client, { mode: 'drawer', open: true });
  const button = app.dom.window.document.querySelector('[aria-label="Mark as read"]'); assert(button);
  await React.act(async () => button.click()); await app.settle();
  assert(client.operations.some(op => op.table === 'notifications' && op.action === 'update'));
  assert(!client.operations.some(op => op.table === 'profiles'));
});

test('KNOWN DEFECT observation: automatic sign-out does not quiesce mounted shell resources', async t => {
  const client = fixture(); const app = await shellProbe(t, client, { mode: 'hook' });
  assert.equal(app.session.viewerId, USER.id); assert.equal(app.timers.size, 1); assert(app.subscriptions.size);
  assert.equal(client.listeners.size, 0, 'Shell never registered an auth listener');
  await React.act(async () => client.emit('SIGNED_OUT', { credential: false, user: null })); await app.settle();
  assert.equal(app.session.viewerId, USER.id); assert.equal(app.timers.size, 1); assert(app.subscriptions.size);
  await app.unmount(); assert.equal(app.timers.size, 0); assert.equal(app.subscriptions.size, 0);
});

test('KNOWN DEFECT observation: late shell bootstrap registers resources after its cleanup already ran', async t => {
  let release; const wait = new Promise(resolve => { release = resolve; });
  const client = fixture({ wait }); const app = await shellProbe(t, client, { mode: 'hook' });
  await app.unmount(); assert.equal(app.timers.size, 0); assert.equal(app.subscriptions.size, 0);
  await React.act(async () => release()); await app.settle();
  assert(client.operations.some(op => op.table === 'profiles' && op.action === 'update'));
  assert.equal(app.timers.size, 1); assert(app.subscriptions.size);
  // Sets contain fake handles only; no sockets, real intervals, or network operations exist.
  app.timers.clear(); app.subscriptions.clear();
});
