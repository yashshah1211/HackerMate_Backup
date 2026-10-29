/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-component journey tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const EVENT = '00000000-0000-4000-8000-000000000006';
const DESTINATION = `/hackathons/${EVENT}?tab=looking_for_teams`;
const PORTAL = '/partners/rack-it-up-2026';
const OFFICIAL = 'https://unstop.com/hackathons/rack-it-up-2026-48-hour-online-hackathon-by-rackem-karma-enterprises-1777639';
const ORIGIN = 'https://offline.example';
const plain = value => JSON.parse(JSON.stringify(value));
const system = {
  Page: ({ children }) => React.createElement('main', null, children),
  PageHeader: ({ title, actions }) => React.createElement('header', null, React.createElement('h1', null, title), actions),
  Section: ({ title, children }) => React.createElement('section', null, React.createElement('h2', null, title), children),
  ButtonLink: ({ href, children }) => React.createElement('a', { href }, children),
  Button: ({ children, onClick, disabled }) => React.createElement('button', { onClick, disabled }, children),
  PageLoader: ({ label }) => React.createElement('p', null, label),
  EmptyState: ({ title, body, action }) => React.createElement('div', null, title, body, action),
  ErrorNotice: ({ title, detail, onRetry }) => React.createElement('div', null, title, detail, React.createElement('button', { onClick: onRetry }, 'Retry')),
};

async function view(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: ORIGIN + (options.path || PORTAL) });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  t.after(async () => { await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
  const events = [], rpcs = [], reads = [], errors = [];
  const row = { id: EVENT, name: 'Rack It Up 2026', status: 'approved', archived: false, type: 'external', website_url: OFFICIAL,
    description: 'Synthetic event description', tags: [], start_date: '2026-12-11', end_date: '2026-12-13', ...options.event };
  const data = { user_id: 'synthetic-public-builder', full_name: 'Synthetic Public Builder', college: 'Synthetic Campus', avatar_url: null, skills: ['React'] };
  const rows = options.rows || [data];
  const client = {
    from(table) { assert.equal(table, 'hackathons', 'Public journey must not query private relations'); reads.push(table);
      return { select(columns) { assert(!columns.includes('*')); return this; }, eq() { return this; }, async maybeSingle() { return { data: row, error: null }; } }; },
    async rpc(name, args) {
      assert.equal(name, 'list_event_discovery_builders'); assert.equal(args.p_hackathon_id, EVENT);
      assert.equal(args.p_limit, 50); rpcs.push(plain(args));
      if (options.delay) await options.delay(args);
      return { data: { items: rows.slice(args.p_offset, args.p_offset + 50), total: rows.length, offset: args.p_offset, limit: 50 }, error: options.rpcError || null };
    },
  };
  dom.window.va = () => {};
  const loader = harness({
    '@vercel/analytics': { track(name, properties) { if (options.analyticsError) throw Error('Synthetic analytics unavailable'); events.push({ name, properties: plain(properties) }); } },
    'next/navigation': { usePathname: () => dom.window.location.pathname, useSearchParams: () => new URLSearchParams(dom.window.location.search), useParams: () => ({ id: EVENT }) },
    'next/link': ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
    '@/lib/supabase': { supabase: client },
    '@/components/system': system,
  }, { window: dom.window, document: dom.window.document, sessionStorage: dom.window.sessionStorage, URLSearchParams, setInterval, clearInterval,
    console: { ...console, error: (...args) => errors.push(args) } });
  const funnel = loader.load('src/components/partners/RackFunnel.tsx');
  const Component = options.detail ? loader.load('src/components/hackathons/PublicHackathonDetail.tsx').default : funnel.default;
  const element = () => React.createElement(React.Fragment, null, React.createElement(Component, options.detail ? { onboard: Boolean(options.onboard) } : {}),
    !options.detail && React.createElement('a', { href: DESTINATION, 'data-rack-funnel': 'find_teammates', id: 'find' }, 'Find teammates'),
    !options.detail && React.createElement('a', { href: OFFICIAL, target: '_blank', 'data-rack-funnel': 'unstop', id: 'unstop' }, 'Register on Unstop'));
  const settle = () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  await React.act(async () => root.render(element())); await settle();
  const route = async path => { dom.window.history.replaceState(null, '', path); await React.act(async () => root.render(element())); await settle(); };
  const click = async (selector, extra = {}) => {
    const node = dom.window.document.querySelector(selector); assert(node, selector);
    let preventedByTracker;
    const stopFixtureNavigation = e => { preventedByTracker = e.defaultPrevented; e.preventDefault(); };
    node.addEventListener('click', stopFixtureNavigation, { once: true });
    await React.act(async () => { node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...extra })); });
    return preventedByTracker;
  };
  return { dom, events, errors, rpcs, reads, options, funnel, route, click, settle, get text() { return dom.window.document.body.textContent; } };
}

test('portal view, both clicks, login and onboarding entries transmit only the fixed slug', async t => {
  const v = await view(t, { path: PORTAL + '?email=must-not-transmit&next=https://arbitrary.invalid' });
  assert.equal(await v.click('#find'), false); assert.equal(await v.click('#unstop'), false);
  await v.route('/login?next=' + encodeURIComponent(DESTINATION));
  await v.route('/onboarding?next=' + encodeURIComponent(DESTINATION));
  assert.deepEqual(v.events.map(e => e.name), ['rack_portal_view', 'rack_find_teammates_click', 'rack_unstop_click', 'rack_login_entry', 'rack_onboarding_entry']);
  for (const event of v.events) assert.deepEqual(event.properties, { event_slug: 'rack-it-up-2026' });
  assert.equal(v.reads.length, 0); assert.equal(v.rpcs.length, 0);
  await v.route('/onboarding?next=' + encodeURIComponent(DESTINATION)); assert.equal(v.events.length, 5);
});
test('entry observations require the exact same-tab destination and never imply completed signup', async t => {
  const v = await view(t, { path: '/login?next=' + encodeURIComponent(DESTINATION) }); assert.deepEqual(v.events, []);
  await v.route(PORTAL); await v.click('#find');
  await v.route('/login?next=' + encodeURIComponent(DESTINATION.replace('looking_for_teams', 'teams')));
  await v.route('/onboarding?next=' + encodeURIComponent('/hackathons/another-event'));
  assert.deepEqual(v.events.map(e => e.name), ['rack_portal_view', 'rack_find_teammates_click']);
});
for (const [name, context] of [
  ['corrupt', '{'], ['external', JSON.stringify({ destination: 'https://arbitrary.invalid', expiresAt: Date.now() + 10000 })],
  ['expired', JSON.stringify({ destination: DESTINATION, expiresAt: 1 })],
  ['unbounded lifetime', JSON.stringify({ destination: DESTINATION, expiresAt: Date.now() + 86400000 })],
]) test(`invalid attribution is ignored and removed: ${name}`, async t => {
  const v = await view(t, { path: '/hackathons' }); v.dom.window.sessionStorage.setItem(v.funnel.RACK_FUNNEL_KEY, context);
  await v.route('/login?next=' + encodeURIComponent(DESTINATION)); assert.deepEqual(v.events, []);
  assert.equal(v.dom.window.sessionStorage.getItem(v.funnel.RACK_FUNNEL_KEY), null);
});
test('new-tab intent counts the click without inventing a same-tab attribution', async t => {
  const v = await view(t); await v.click('#find', { ctrlKey: true });
  assert.equal(v.dom.window.sessionStorage.getItem(v.funnel.RACK_FUNNEL_KEY), null);
  await v.route('/login?next=' + encodeURIComponent(DESTINATION)); assert.equal(v.events.length, 2);
});
test('SDK and storage failures cannot cancel navigation or break rendering', async t => {
  const v = await view(t, { analyticsError: true });
  v.dom.window.Storage.prototype.setItem = () => { throw Error('Synthetic storage denied'); };
  v.dom.window.Storage.prototype.getItem = () => { throw Error('Synthetic storage denied'); };
  assert.equal(await v.click('#find'), false); assert.equal(await v.click('#unstop'), false);
  await v.route('/login?next=' + encodeURIComponent(DESTINATION)); assert.deepEqual(v.events, []);
});
test('SDK initialization may be delayed, but readiness checks are bounded and emit once', async t => {
  const v = await view(t, { path: '/hackathons' }); const pending = []; delete v.dom.window.va;
  v.dom.window.setTimeout = fn => { pending.push(fn); return pending.length; };
  await v.route(PORTAL); assert.equal(v.events.length, 0);
  v.dom.window.va = () => {}; pending.shift()(); assert.equal(v.events.length, 1);
  delete v.dom.window.va; await v.click('#find'); let attempts = 0;
  while (pending.length) { pending.shift()(); assert(++attempts <= 4); }
  assert.equal(v.events.length, 1);
});
test('other portals, forged click destinations and arbitrary redirects produce no Rack attribution', async t => {
  const v = await view(t, { path: '/partners/other-event' }); await v.click('#find'); assert.deepEqual(v.events, []);
  await v.route(PORTAL); v.dom.window.document.getElementById('find').setAttribute('href', '/hackathons/not-a-uuid?tab=looking_for_teams');
  await v.click('#find'); assert.equal(v.events.length, 1);
  for (const value of [null, 'https://arbitrary.invalid', DESTINATION + '&email=private', DESTINATION + '#private', '/login?next=' + DESTINATION]) assert.equal(v.funnel.rackFunnelDestination(value), null);
});
test('Rack guest discovers actual public-projection fixtures before sign-in, with the whole return path', async t => {
  const v = await view(t, { detail: true, path: DESTINATION });
  assert.match(v.text, /Synthetic Public Builder/); assert.match(v.text, /Synthetic Campus/); assert.match(v.text, /React/);
  const link = [...v.dom.window.document.querySelectorAll('a')].find(a => a.textContent === 'Sign in to list your profile');
  assert.equal(new URL(link.href).searchParams.get('next'), DESTINATION);
  assert.deepEqual(v.rpcs, [{ p_hackathon_id: EVENT, p_offset: 0, p_limit: 50 }]); assert.deepEqual(v.reads, ['hackathons']);
  assert(!v.text.includes('List my profile')); assert(!v.text.includes('Registered'));
});
test('incomplete account sees only the same public projection with an onboarding return', async t => {
  const v = await view(t, { detail: true, onboard: true, path: DESTINATION });
  assert.match(v.text, /Synthetic Public Builder/);
  assert(!v.text.includes('Sign up free')); assert(!v.text.includes('Sign in free'));
  const link = [...v.dom.window.document.querySelectorAll('a')].find(a => a.textContent === 'Complete onboarding to list your profile');
  assert.equal(new URL(link.href).pathname, '/onboarding'); assert.equal(new URL(link.href).searchParams.get('next'), DESTINATION);
});
test('empty means no public listings, while failed RPCs remain logged failures and can retry', async t => {
  const v = await view(t, { detail: true, path: DESTINATION, rows: [], rpcError: { code: '42501' } });
  assert.match(v.text, /Couldn't load public builder listings/); assert(!v.text.includes('No public builder listings yet')); assert.equal(v.errors.length, 1);
  v.options.rpcError = null; const retry = [...v.dom.window.document.querySelectorAll('button')].find(b => b.textContent.includes('Retry')); assert(retry);
  await React.act(async () => retry.click()); await v.settle(); assert.match(v.text, /No public builder listings yet/);
  assert(!v.text.includes('Nobody')); assert.equal(v.rpcs.length, 2);
});
test('guest pagination reads only bounded projection pages, never raw registrations or profiles', async t => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ user_id: 'synthetic-' + i, full_name: 'Synthetic Builder ' + i, college: null, avatar_url: null, skills: [] }));
  const v = await view(t, { detail: true, path: DESTINATION, rows });
  const more = [...v.dom.window.document.querySelectorAll('button')].find(b => b.textContent === 'More builders'); assert(more);
  await React.act(async () => more.click()); await v.settle();
  assert.equal(v.rpcs.at(-1).p_offset, 50); assert.match(v.text, /Synthetic Builder 50/); assert(!v.text.includes('Synthetic Builder 0'));
});
for (const [name, change] of [['other event', { website_url: 'https://example.invalid/other' }], ['unpublished', { status: 'pending' }], ['archived', { archived: true }]]) {
  test(`no Rack discovery or new query is mounted for ${name}`, async t => {
    const v = await view(t, { detail: true, path: DESTINATION, event: change }); assert.equal(v.rpcs.length, 0); assert(!v.text.includes('Synthetic Public Builder'));
  });
}
