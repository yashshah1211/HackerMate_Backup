/* eslint-disable @typescript-eslint/no-require-imports -- Offline real React lifecycle and public-contract tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const api = harness().load('src/lib/hackathons/publicBrowsing.ts');
class FixtureDate extends Date { constructor(...args){super(...(args.length?args:['2026-10-31T12:00:00+05:30']));} static now(){return Date.parse('2026-10-31T12:00:00+05:30');} }
const USER = { id: 'synthetic-member' };
const event = (id = 'synthetic-event', extra = {}) => ({ id, name: `Public ${id}`, description: '<p>Build useful tools</p>', status: 'approved', archived: false,
  type: 'external', tags: ['React'], start_date: '2026-11-01', end_date: '2026-11-03', registration_start: '2026-10-01', registration_end: '2026-11-02',
  prize_pool: 'INR 10000', currency: 'INR', location: 'Mumbai', mode: 'hybrid', website_url: 'https://unstop.com/synthetic', ...extra });
function client(options = {}) {
  const reads = [], writes = [], listeners = new Set(), signOutCalls = []; let user = options.user ?? null, stopped = 0;
  const c = { reads, writes, listeners, get stopped() { return stopped; }, auth: {
    getSession: async () => ({ data: { session: user || options.stale ? { user: user || USER } : null }, error: options.sessionError }),
    getUser: async () => { const current = user; if (options.userDelay) await options.userDelay(); return { data: { user: current }, error: options.authError }; },
    async signOut(settings) {
      signOutCalls.push(settings);
      if (options.signOutDelay) await options.signOutDelay();
      if (options.signOutError) return { error: options.signOutError };
      if (!options.retainSession) c.signOut();
      return { error: null };
    },
    onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe() { stopped++; listeners.delete(fn); } } } }; },
  }, from(table) {
    const filters = []; let columns, cursor = null, batchSize = Infinity, signal;
    const execute = async () => {
      reads.push({ table, columns, filters: [...filters], cursor, signal });
      if (options.delay) await options.delay(table, { cursor, signal });
      if (table === 'profiles') return { data: options.noProfile ? null : { id: filters.find(([key]) => key === 'id')?.[1], is_banned: false, onboarding_completed: true, skills: [], ...options.profile }, error: options.profileError };
      if (table === 'saved_hackathons') return { data: options.savedRows?.[filters.find(([key]) => key === 'user_id')?.[1]] || [], error: options.savedError };
      assert.equal(table, 'hackathons', 'Guest must not access private relations');
      assert.equal(columns, api.PUBLIC_EVENT_COLUMNS);
      if (options.eventError || (cursor && options.laterPageError)) return { data: null, error: options.eventError || options.laterPageError };
      let rows = [...(options.events || [event()])].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      if (!options.ignoreFilters) rows = rows.filter(row => filters.every(([key, value]) => row[key] === value));
      if (cursor !== null) rows = rows.filter(row => row.id > cursor);
      rows = rows.slice(0, Math.min(batchSize, options.responseCap || Infinity));
      return { data: filters.some(([key]) => key === 'id') ? rows[0] || null : rows, error: null };
    };
    return { select(value) { columns = value; assert(!value.includes('*')); return this; }, eq(key, value) { filters.push([key, value]); return this; }, order() { return this; },
      gt(key, value) { assert.equal(key, 'id'); cursor = value; return this; }, limit(value) { batchSize = value; return this; }, abortSignal(value) { signal = value; return this; },
      maybeSingle: execute, single: execute, then(resolve, reject) { return execute().then(resolve, reject); },
      insert(value) { writes.push(value); throw new Error('No protected mutation expected'); }, delete() { throw new Error('No protected mutation expected'); },
    };
  }, signIn(nextUser = USER) { user = nextUser; listeners.forEach(fn => fn('SIGNED_IN', { user })); },
  signOut() { user = null; listeners.forEach(fn => fn('SIGNED_OUT', null)); },
  emit(name, nextUser = user) { user = nextUser; listeners.forEach(fn => fn(name, user ? { user } : null)); }, signOutCalls };
  return c;
}
for (const [name, options, expected] of [
  ['anonymous', {}, 'guest'], ['missing-session guest', { authError: { name: 'AuthSessionMissingError' } }, 'guest'],
  ['active', { user: USER }, 'member'], ['incomplete', { user: USER, profile: { onboarding_completed: false } }, 'member'],
  ['suspended', { user: USER, profile: { is_banned: true } }, 'suspended'],
  ['unverifiable session', { user: USER, authError: { name: 'AuthApiError' } }, 'unavailable'],
  ['session lookup fails', { sessionError: new Error('offline') }, 'unavailable'],
  ['stale session', { stale: true, authError: { name: 'AuthSessionMissingError' } }, 'unavailable'],
  ['missing profile', { user: USER, noProfile: true }, 'unavailable'],
  ['profile permission failure', { user: USER, profileError: { message: 'denied' } }, 'unavailable'],
  ['unknown suspension state', { user: USER, profile: { is_banned: null } }, 'unavailable'],
]) test(`account boundary: ${name}`, async () => {
  const c = client(options), state = await api.verifyBrowsingAccess(c); assert.equal(state.kind, expected);
  if (!options.user) assert.equal(c.reads.length, 0);
  if (name === 'incomplete') assert.equal(state.onboarded, false);
});
for (const type of ['external', 'native', null]) for (const status of ['pending', 'rejected', null, 'approved']) test(`public listing and direct-ID visibility: ${type}/${status}`, async () => {
  const c = client({ events: [event('candidate', { type, status })], ignoreFilters: true });
  assert.equal((await api.loadPublicEvents(c)).length, status === 'approved' ? 1 : 0);
  assert.equal(Boolean(await api.loadPublicEvent(c, 'candidate')), status === 'approved');
  for (const read of c.reads) { assert(read.filters.some(([key, value]) => key === 'status' && value === 'approved')); assert(read.filters.some(([key, value]) => key === 'archived' && value === false)); }
});
test('archived and unspecified archive visibility fail closed; no owner exception or feedback shortcut', async () => {
  for (const extra of [{ archived: true }, { archived: null }, { status: null, ai_feedback: { status: 'approved' }, organizer_id: USER.id }]) {
    const c = client({ events: [event('private', extra)], ignoreFilters: true });
    assert.equal((await api.loadPublicEvents(c)).length, 0); assert.equal(await api.loadPublicEvent(c, 'private'), null);
  }
  for (const secret of ['organizer_id', 'organizer_email', 'ai_feedback']) assert(!api.PUBLIC_EVENT_COLUMNS.split(',').includes(secret));
});
test('public query failures are failures, not empty listings or missing events', async () => {
  const c = client({ eventError: { message: 'denied' } });
  await assert.rejects(api.loadPublicEvents(c)); await assert.rejects(api.loadPublicEvent(c, 'x'));
});
for (const unsafe of ['//evil.invalid', '/\\evil.invalid', 'https://evil.invalid', '/%5cevil.invalid', '/%0aevil', '/%2f%2fevil', '/admin', '/hackathons/../admin']) test(`return destination rejects ${unsafe}`, () => assert.equal(api.safeBrowsingDestination(unsafe), '/hackathons'));
test('login and onboarding transport filters and event tab without an automatic-action flag', () => {
  for (const next of ['/hackathons?tab=past&q=water+energy&mode=online&source=partner', '/hackathons/synthetic-event?tab=builders']) for (const onboard of [false, true]) {
    const url = new URL(api.browsingActionHref(next, onboard), 'https://offline.invalid');
    assert.equal(url.pathname, onboard ? '/onboarding' : '/login'); assert.equal(url.searchParams.get('next'), next);
    assert.equal(url.searchParams.size, 1);
  }
});
const system = new Proxy({}, { get: (_, name) => {
  if (name === '__esModule') return false;
  return props => {
    if (name === 'Sheet' && !props.open) return null;
    if (name === 'PageLoader') return React.createElement('p', { role: 'status' }, props.label);
    if (name === 'PageHeader') return React.createElement('header', null, props.title, props.meta, props.actions);
    if (name === 'ErrorNotice') return React.createElement('div', { role: 'alert' }, props.title, props.detail, props.onRetry && React.createElement('button', { onClick: props.onRetry }, 'Retry'));
    if (name === 'EmptyState') return React.createElement('section', null, props.title, props.body, props.action);
    if (name === 'ButtonLink') return React.createElement('a', { href: props.href }, props.children);
    if (name === 'IconButton') return React.createElement('button', { 'aria-label': props.label, onClick: props.onClick }, props.children);
    if (name === 'Button') return React.createElement('button', { onClick: props.onClick }, props.children);
    if (name === 'SearchField') return React.createElement('input', { 'aria-label': props.label, value: props.value, onChange: e => props.onChange(e.target.value) });
    if (name === 'Select') return React.createElement('select', { id: props.id, value: props.value, onChange: props.onChange }, props.children);
    return React.createElement('section', null, props.title, props.children, props.footer);
  };
} });
async function mount(options = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: `http://localhost/hackathons${options.detail ? '/synthetic-event' : ''}${options.query || ''}` });
  const previous = { window: global.window, document: global.document, IS_REACT_ACT_ENVIRONMENT: global.IS_REACT_ACT_ENVIRONMENT };
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  const c = options.client || client(options), errors = [];
  const loader = harness({ '@/lib/supabase': { supabase: c }, '@/components/system': system,
    'next/navigation': { useParams: () => ({ id: 'synthetic-event' }), useSearchParams: () => new URLSearchParams(dom.window.location.search) },
    'next/link': props => React.createElement('a', { href: props.href }, props.children),
    '@/context/NotificationContext': { useNotification: () => ({ showToast() {} }) }, '@/components/Logo': { LogoMark: () => null },
  }, { Date:FixtureDate, window: dom.window, URLSearchParams, AbortController, setInterval, clearInterval, console: { ...console, error: (...args) => errors.push(args) } });
  const Boundary = options.boundary && loader.load('src/components/hackathons/BrowsingBoundary.tsx').default;
  const Component = options.boundary ? () => React.createElement(Boundary, null, access => React.createElement('div', null,
    access.kind === 'guest' ? 'Genuine guest subtree' : `Member subtree ${access.userId} onboarded=${access.onboarded}`))
    : loader.load(options.detail ? 'src/app/hackathons/[id]/page.tsx' : 'src/app/hackathons/page.tsx').default;
  const root = createRoot(dom.window.document.getElementById('root'));
  const element = React.createElement(Component);
  await React.act(async () => root.render(element));
  const settle = async () => { for (let i = 0; i < 4; i++) await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 8)); }); };
  await settle();
  return { c, dom, errors, get html() { return dom.window.document.body.innerHTML; },
    async click(label) { const button = [...dom.window.document.querySelectorAll('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label); assert(button, `Missing ${label}`); await React.act(async () => button.click()); await settle(); },
    async change(fn) { await React.act(async () => fn()); await settle(); },
    async close() { await React.act(async () => root.unmount()); dom.window.close(); Object.assign(global, previous); },
  };
}
test('real directory effects: guests browse/filter, Saved and bookmarks offer sign-in, no private reads or writes', async () => {
  const view = await mount({ query: '?tab=upcoming&q=Public&mode=hybrid&source=partner' });
  try {
    assert.match(view.html, /Public synthetic-event/); assert.match(view.html, /Discover/); assert(!view.html.includes('0 saved'));
    await view.click('Save hackathon');
    const link = [...view.dom.window.document.querySelectorAll('a')].find(a => a.textContent === 'Sign in');
    assert(link); assert.equal(new URL(link.href).searchParams.get('next'), '/hackathons?tab=upcoming&q=Public&mode=hybrid&source=partner');
    await view.click('Saved'); assert.equal(new URL(view.dom.window.location.href).searchParams.get('tab'), 'saved'); assert.match(view.html, /Sign in to save events/); assert(!view.html.includes('haven\u0027t saved'));
    assert(view.c.reads.every(read => read.table === 'hackathons')); assert.equal(view.c.writes.length, 0);
  } finally { await view.close(); }
});
test('real public detail effects show description/dates/prizes, safe actions, and no participation/team/builder/resource reads', async () => {
  const view = await mount({ detail: true, query: '?tab=builders' });
  try {
    assert.match(view.html, /Build useful tools/); assert.match(view.html, /10,000/); assert.match(view.html, /Nov/);
    assert.match(view.html, /Sign in for teammate matching/); assert(view.c.reads.every(read => read.table === 'hackathons'));
    assert.equal(view.c.writes.length, 0); assert(!view.html.includes('Registered'));
    const next = new URL([...view.dom.window.document.querySelectorAll('a')].find(a => a.textContent === 'Sign in to save').href).searchParams.get('next');
    assert.equal(next, '/hackathons/synthetic-event?tab=builders');
    assert.match(view.html, /lg:grid-cols/); // Same content stacks before the desktop breakpoint.
  } finally { await view.close(); }
});
test('real effects deny suspended/unverified sessions without rendering the guest event UI', async () => {
  for (const options of [{ user: USER, profile: { is_banned: true } }, { user: USER, profileError: { message: 'offline' } }]) {
    const view = await mount(options);
    try { assert.match(view.html, /Account suspended|Account verification unavailable/); assert(!view.html.includes('Public synthetic')); assert(!view.c.reads.some(r => r.table === 'hackathons')); }
    finally { await view.close(); }
  }
});
test('incomplete onboarding reads public detail and offers a safe onboarding return, without participation queries', async () => {
  const view = await mount({ detail: true, user: USER, profile: { onboarding_completed: false } });
  try { assert.match(view.html, /Complete onboarding/); assert.match(view.html, /onboarding\?next=/); assert(view.c.reads.every(r => ['profiles', 'hackathons'].includes(r.table))); assert.equal(view.c.writes.length, 0); }
  finally { await view.close(); }
});
test('event error, retry and empty states execute actual effects; a failed request is never not-found', async () => {
  const options = { detail: true, eventError: { message: 'offline' } }, c = client(options), view = await mount({ detail: true, client: c });
  try { assert.match(view.html, /Couldn.t load event/); assert(!view.html.includes('not publicly listed')); options.eventError = null; await view.click('Retry'); assert.match(view.html, /Public synthetic-event/); }
  finally { await view.close(); }
  const missing = await mount({ detail: true, events: [event('synthetic-event', { status: 'pending' })] });
  try { assert.match(missing.html, /not publicly listed/); assert(!missing.html.includes('Build useful tools')); } finally { await missing.close(); }
});
test('account transitions discard stale private renders and unsubscribe on unmount', async () => {
  const view = await mount({ user: USER });
  try {
    assert(view.c.reads.some(r => r.table === 'saved_hackathons'));
    await view.change(() => view.c.signOut()); assert.match(view.html, /Account verification unavailable/);
    await view.click('Sign out and browse public events'); assert.match(view.html, /Discover/);
    assert(!view.html.includes('0 saved')); assert.equal(view.c.listeners.size, 1);
  } finally { await view.close(); }
  assert.equal(view.c.listeners.size, 0); assert.equal(view.c.stopped, 1);
});

test('late verification after sign-out cannot restore the previous account subtree', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const view = await mount({ user: USER, delay: table => table === 'profiles' ? pending : undefined });
  try {
    assert.match(view.html, /Checking account access/);
    await view.change(() => view.c.signOut()); assert.match(view.html, /Account verification unavailable/);
    await view.change(release); assert.match(view.html, /Account verification unavailable/); assert(!view.c.reads.some(read => read.table === 'saved_hackathons'));
  } finally { release(); await view.close(); }
});
test('directory load failure and retry preserve the URL; incomplete accounts cannot bookmark', async () => {
  const options = { eventError: { message: 'offline' } }, view = await mount({ client: client(options), query: '?q=Public&mode=hybrid' });
  try {
    assert.match(view.html, /Couldn.t load hackathons/); assert(!view.html.includes('No events found'));
    options.eventError = null; await view.click('Retry'); assert.match(view.html, /Public synthetic-event/);
    assert.equal(view.dom.window.location.search, '?q=Public&mode=hybrid');
  } finally { await view.close(); }
  const incomplete = await mount({ user: USER, profile: { onboarding_completed: false } });
  try { await incomplete.click('Save hackathon'); assert.match(incomplete.html, /Complete your profile/); assert.equal(incomplete.c.writes.length, 0); }
  finally { await incomplete.close(); }
});

test('later-page failure never renders the partial list; Retry reloads all pages with current filters', async () => {
  const options = { events: [event('a'), event('b')], responseCap: 1, laterPageError: { message: 'offline second page' } };
  const view = await mount({ client: client(options), query: '?q=Public&mode=hybrid' });
  try {
    assert.match(view.html, /Couldn.t load hackathons/); assert(!view.html.includes('Public a')); assert(!view.html.includes('Public b'));
    const before = view.c.reads.length; options.laterPageError = null; await view.click('Retry');
    assert.match(view.html, /Public a/); assert.match(view.html, /Public b/); assert(!view.html.includes('Couldn.t load hackathons'));
    assert.equal(view.c.reads[before].cursor, null); assert.equal(view.dom.window.location.search, '?q=Public&mode=hybrid');
  } finally { await view.close(); }
});
test('a newer Retry aborts an obsolete in-flight page and delayed completion cannot replace current results', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const options = { eventError: { message: 'offline first attempt' }, events: [event('a'), event('b')], responseCap: 1 };
  const view = await mount({ client: client(options) });
  try {
    options.eventError = null; options.delay = (table, { cursor }) => table === 'hackathons' && cursor === 'a' ? pending : undefined;
    await view.click('Retry');
    const obsolete = view.c.reads.find(read => read.cursor === 'a'); assert(obsolete); assert.equal(obsolete.signal.aborted, false);
    assert(!view.html.includes('Public a'));
    options.events = [event('z', { name: 'Fresh completed listing' })]; options.delay = null;
    await view.click('Retry'); assert.equal(obsolete.signal.aborted, true); assert.match(view.html, /Fresh completed listing/);
    await view.change(release); assert.match(view.html, /Fresh completed listing/); assert(!view.html.includes('Public a'));
    assert.equal(view.c.reads.filter(read => read.signal === obsolete.signal).length, 2);
  } finally { release(); await view.close(); }
});
test('unmount cancels a pending pagination request and stops traversal after delayed completion', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const options = { events: [event('a'), event('b')], responseCap: 1, delay: (table, { cursor }) => table === 'hackathons' && cursor === 'a' ? pending : undefined };
  const view = await mount({ client: client(options) });
  const request = view.c.reads.find(read => read.cursor === 'a');
  try { assert(request); assert(!view.html.includes('Public a')); }
  finally { await view.close(); release(); await new Promise(resolve => setImmediate(resolve)); }
  assert.equal(request.signal.aborted, true); assert.equal(view.c.reads.length, 2);
});

for (const [name, options] of [
  ['suspended', { user: USER, profile: { is_banned: true } }],
  ['missing profile', { user: USER, noProfile: true }],
  ['null ban', { user: USER, profile: { is_banned: null } }],
  ['verification error', { user: USER, authError: { name: 'AuthApiError' } }],
  ['expired credentials', { stale: true, authError: { name: 'AuthSessionMissingError' } }],
]) test(`real boundary: ${name} cannot downgrade on automatic credential removal, focus or Retry`, async () => {
  const c = client(options), view = await mount({ client: c, boundary: true });
  try {
    assert.match(view.html, /Account suspended|Account verification unavailable/);
    options.stale = false; options.authError = { name: 'AuthSessionMissingError' };
    await view.change(() => view.c.signOut());
    assert(!view.html.includes('Genuine guest subtree'));
    await view.change(() => view.dom.window.dispatchEvent(new view.dom.window.Event('focus')));
    await view.click('Retry');
    assert.match(view.html, /Account verification unavailable/);
    assert(!view.html.includes('Genuine guest subtree'));
    assert(view.c.reads.every(read => read.table === 'profiles')); assert.equal(view.c.writes.length, 0);
  } finally { await view.close(); }
});

test('real boundary: explicit local sign-out confirms guest access and never infers intent from SIGNED_OUT', async () => {
  const view = await mount({ user: USER, profile: { is_banned: true }, boundary: true });
  try {
    await view.click('Sign out and browse public events');
    assert.match(view.html, /Genuine guest subtree/);
    assert.deepEqual(view.c.signOutCalls.map(call => call.scope), ['local']);
    await view.change(() => view.dom.window.dispatchEvent(new view.dom.window.Event('focus')));
    assert.match(view.html, /Genuine guest subtree/);
    await view.change(() => view.c.emit('SIGNED_OUT', null));
    assert.match(view.html, /Account verification unavailable/);
    await view.click('Sign out and browse public events');
    assert.match(view.html, /Genuine guest subtree/);
  } finally { await view.close(); }
});

test('real boundary: fresh anonymous INITIAL_SESSION, focus and retry do not require sign-in', async () => {
  const view = await mount({ boundary: true });
  try {
    assert.match(view.html, /Genuine guest subtree/);
    await view.change(() => view.c.emit('INITIAL_SESSION', null));
    await view.change(() => view.dom.window.dispatchEvent(new view.dom.window.Event('focus')));
    assert.match(view.html, /Genuine guest subtree/); assert.equal(view.c.reads.length, 0);
    assert.equal(view.c.writes.length, 0); assert.equal(view.c.signOutCalls.length, 0);
  } finally { await view.close(); }
});

test('real boundary: pending initial verification cannot publish guest or member after automatic SIGNED_OUT', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const options = { user: USER, boundary: true, userDelay: () => pending };
  const view = await mount(options);
  try {
    assert.match(view.html, /Checking account access/);
    await view.change(() => view.c.signOut());
    await view.change(release);
    assert.match(view.html, /Account verification unavailable/);
    assert(!view.html.includes('Member subtree')); assert(!view.html.includes('Genuine guest subtree'));
  } finally { release(); await view.close(); }
});

test('real boundary: SIGNED_IN, TOKEN_REFRESHED, focus and Retry reverify active/incomplete accounts', async () => {
  const options = { boundary: true }, c = client(options), view = await mount({ boundary: true, client: c });
  try {
    await view.change(() => c.signIn(USER)); assert.match(view.html, /onboarded=true/);
    options.profile = { onboarding_completed: false };
    await view.change(() => c.emit('TOKEN_REFRESHED')); assert.match(view.html, /onboarded=false/);
    options.profile = { is_banned: true };
    await view.change(() => view.dom.window.dispatchEvent(new view.dom.window.Event('focus')));
    assert.match(view.html, /Account suspended/);
    options.profile = { is_banned: false, onboarding_completed: true };
    await view.click('Retry'); assert.match(view.html, /onboarded=true/);
    assert.equal(c.listeners.size, 1);
  } finally { await view.close(); }
});

for (const options of [{ signOutError: new Error('offline') }, { retainSession: true }]) {
  test(`real boundary: failed/unconfirmed intentional sign-out remains blocked ${JSON.stringify(options)}`, async () => {
    const view = await mount({ user: USER, profile: { is_banned: true }, boundary: true, ...options });
    try {
      await view.click('Sign out and browse public events');
      assert.match(view.html, /Account verification unavailable/);
      assert(!view.html.includes('Genuine guest subtree')); assert.equal(view.c.signOutCalls.length, 1);
      assert(view.errors.length > 0);
    } finally { await view.close(); }
  });
}

test('real boundary: user B supersedes delayed user A verification', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const options = { user: USER, boundary: true, delay: (table) => table === 'profiles' ? pending : undefined };
  const c = client(options), view = await mount({ boundary: true, client: c });
  try {
    options.delay = null;
    await view.change(() => c.signIn({ id: 'synthetic-user-b' }));
    assert.match(view.html, /Member subtree synthetic-user-b/);
    await view.change(release);
    assert.match(view.html, /Member subtree synthetic-user-b/); assert(!view.html.includes('Member subtree synthetic-member'));
  } finally { release(); await view.close(); }
});

test('real directory: delayed user A bookmarks cannot appear under user B', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const options = { user: USER, savedRows: { [USER.id]: [{ hackathon_id: 'synthetic-event' }] },
    delay: table => table === 'saved_hackathons' ? pending : undefined };
  const c = client(options), view = await mount({ client: c });
  try {
    options.delay = null;
    await view.change(() => c.signIn({ id: 'synthetic-user-b' }));
    assert.match(view.html, /Save hackathon/); assert(!view.html.includes('Remove from saved'));
    await view.change(release);
    assert(!view.html.includes('Remove from saved'));
    assert(c.reads.some(read => read.table === 'saved_hackathons' && read.filters.some(([, value]) => value === 'synthetic-user-b')));
    assert.equal(c.writes.length, 0);
  } finally { release(); await view.close(); }
});

test('real boundary: account arrival invalidates pending intentional guest transition', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const options = { user: USER, profile: { is_banned: true }, signOutDelay: () => pending };
  const c = client(options), view = await mount({ boundary: true, client: c });
  try {
    await view.click('Sign out and browse public events');
    options.profile = { is_banned: false };
    await view.change(() => c.signIn({ id: 'synthetic-user-b' }));
    assert.match(view.html, /Member subtree synthetic-user-b/);
    await view.change(release);
    assert(!view.html.includes('Genuine guest subtree'));
    assert.match(view.html, /Account verification unavailable/);
  } finally { release(); await view.close(); }
});

test('real boundary: unmount during verification removes listeners and ignores delayed completion', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const options = { user: USER, userDelay: () => pending }, c = client(options);
  const view = await mount({ client: c, boundary: true });
  try { assert.match(view.html, /Checking account access/); }
  finally { await view.close(); }
  const before = c.reads.length;
  release(); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(c.listeners.size, 0); assert.equal(c.stopped, 1);
  assert.equal(c.reads.length, before + 1); // Already-started verifier may finish its own profile read, never a member subtree.
  assert.equal(c.writes.length, 0); assert.equal(view.errors.length, 0);
});

test('real boundary: refresh-triggered credential removal inside initial getSession is not a fresh guest visit', async () => {
  const c = client({ user: USER }); let initial = true;
  c.auth.getSession = async () => {
    if (initial) { initial = false; c.signOut(); }
    return { data: { session: null }, error: null };
  };
  const view = await mount({ boundary: true, client: c });
  try {
    assert.match(view.html, /Account verification unavailable/);
    assert(!view.html.includes('Genuine guest subtree')); assert.equal(c.reads.length, 0);
    await view.click('Sign out and browse public events'); assert.match(view.html, /Genuine guest subtree/);
  } finally { await view.close(); }
});

test('real boundary: repeated recovery clicks issue only one local sign-out', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const c = client({ user: USER, profile: { is_banned: true }, signOutDelay: () => pending });
  const view = await mount({ boundary: true, client: c });
  try {
    const button = [...view.dom.window.document.querySelectorAll('button')].find(button => button.textContent === 'Sign out and browse public events');
    assert(button);
    await view.change(() => { button.click(); button.click(); });
    assert.equal(c.signOutCalls.length, 1); assert.match(view.html, /Checking account access/);
    await view.change(release); assert.match(view.html, /Genuine guest subtree/);
  } finally { release(); await view.close(); }
});

test('real directory: account switching during bookmark authorization cannot write as user A or B', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const options = { user: USER }, c = client(options), view = await mount({ client: c });
  try {
    options.userDelay = () => pending;
    await view.click('Save hackathon'); assert.equal(c.writes.length, 0);
    options.userDelay = null;
    await view.change(() => c.signIn({ id: 'synthetic-user-b' }));
    await view.change(release);
    assert.equal(c.writes.length, 0); assert(!view.html.includes('Remove from saved'));
  } finally { release(); await view.close(); }
});
