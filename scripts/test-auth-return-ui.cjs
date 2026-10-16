/* eslint-disable @typescript-eslint/no-require-imports -- Offline real React OAuth/login lifecycle tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const ORIGIN = 'https://offline.example';

async function mount(t, { path = '/login', next, login = false, landing = false, user = null, completed = true, authError = null, profileError = null } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: ORIGIN + path });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const prior = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true });
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  const calls = [], navigation = [], reads = [];
  const router = { push: value => navigation.push(value) };
  const supabase = {
    auth: {
      async getUser() { if (authError instanceof Error) throw authError; return { data: { user }, error: authError }; },
      async signInWithOAuth(options) { calls.push(options); return { error: null }; },
    },
    from(table) {
      reads.push(table); assert.equal(table, 'profiles');
      return { select(columns) { assert.equal(columns, 'onboarding_completed'); return this; },
        eq() { return this; }, async maybeSingle() { return { data: completed === null ? null : { onboarding_completed: completed }, error: profileError }; } };
    },
  };
  const landingParts = {};
  for (const name of ['LandingHero', 'ScrambleSection', 'FindSection', 'ReviewSection', 'MergeSection', 'BuildSection', 'LandingFaq']) {
    landingParts[`@/components/landing/${name}`] = { [name]: props => React.createElement('section', { 'data-section': name },
      name === 'LandingHero' ? JSON.stringify(props) : name,
      props.onOrganizer && React.createElement('button', { onClick: props.onOrganizer }, 'Organizer details')) };
  }
  const loader = harness({
    ...landingParts,
    '@/components/landing/ShipSection': {
      ShipSection: ({ onOrganizer }) => React.createElement('button', { onClick: onOrganizer }, 'Ship organizer'),
      OrganizerDialog: ({ open, onClose }) => open ? React.createElement('button', { onClick: onClose }, 'Close organizer') : null,
    },
    '@/lib/supabase': { supabase },
    'next/navigation': { useRouter: () => router, useSearchParams: () => new URLSearchParams(dom.window.location.search) },
    'next/link': ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
    '@/components/Logo': { __esModule: true, default: () => null },
    '@/components/landing/primitives': { STAGES: [] },
    '@/components/system': { GithubIcon: () => null, PageLoader: ({ label }) => React.createElement('p', null, label), ButtonLink: ({ href, children }) => React.createElement('a', { href }, children) },
  }, { window: dom.window, URLSearchParams });
  loader.env.NEXT_PUBLIC_SITE_URL = ORIGIN + '/';
  const Component = landing ? loader.load('src/app/LandingPageClient.tsx').LandingPageClient
    : login ? loader.load('src/app/login/page.tsx').default : loader.load('src/components/auth/SignInPanel.tsx').SignInPanel;
  t.after(async () => {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  await React.act(async () => root.render(React.createElement(Component, landing ? { initialData: { builderCount: 10, teamCount: 2, hackathonCount: 3, upcoming: [] } } : login ? {} : { nextUrl: next })));
  const consent = async () => {
    const input = dom.window.document.querySelector('input[type="checkbox"]');
    const props = input[Object.keys(input).find(key => key.startsWith('__reactProps$'))];
    await React.act(async () => props.onChange({ target: { checked: true } }));
  };
  const provider = async name => {
    const button = [...dom.window.document.querySelectorAll('button')].find(node => node.textContent === `Continue with ${name}`);
    assert(button); await React.act(async () => button.click());
  };
  return { dom, calls, navigation, reads, consent, provider };
}

for (const provider of ['Google', 'GitHub']) {
  for (const [name, next, expected] of [
    ['event', '/hackathons/event-1?tab=builders#teams', '/hackathons/event-1?tab=builders#teams'],
    ['invitation', '/invites?college=Offline%20Campus#pending', '/invites?college=Offline%20Campus#pending'],
    ['nested query', '/hackathons?q=water+energy&filter=a%26b%3Dc#results', '/hackathons?q=water+energy&filter=a%26b%3Dc#results'],
    ['userinfo injection', '@evil.invalid', '/dashboard'],
    ['backslash authority', '/\\evil.invalid', '/dashboard'],
    ['double encoding', '/%252f%252fevil.invalid', '/dashboard'],
    ['auth loop', '/login?next=/onboarding', '/dashboard'],
  ]) test(`${provider} button sends only a local validated ${name} through OAuth`, async t => {
    const view = await mount(t, { next });
    await view.provider(provider); assert.equal(view.calls.length, 0, 'consent is still required');
    await view.consent(); await view.provider(provider);
    assert.equal(view.calls.length, 1); assert.equal(view.calls[0].provider, provider.toLowerCase());
    const callback = new URL(view.calls[0].options.redirectTo);
    assert.equal(callback.origin, ORIGIN); assert.equal(callback.pathname, '/auth/callback');
    assert.equal(callback.searchParams.size, 1); assert.equal(callback.searchParams.get('next'), expected);
    assert.deepEqual(view.navigation, []); assert.deepEqual(view.reads, []);
  });
  test(`${provider} modal default captures relative current path/query/fragment`, async t => {
    const path = '/challenges/synthetic?tab=submissions#submit';
    const view = await mount(t, { path }); await view.consent(); await view.provider(provider);
    assert.equal(new URL(view.calls[0].options.redirectTo).searchParams.get('next'), path);
  });
}

for (const completed of [true, false, null]) {
  for (const [name, value, expected] of [
    ['event', '/hackathons/event-1?tab=builders#teams', '/hackathons/event-1?tab=builders#teams'],
    ['team join handoff', '/teams/team-1?college=Offline%20Campus#join', '/teams/team-1?college=Offline%20Campus#join'],
    ['invalid authority', '/\\evil.invalid', '/dashboard'],
    ['encoded authority', '/%252f%252fevil.invalid', '/dashboard'],
    ['root redirect chain', '/?next=@evil.invalid', '/dashboard'],
  ]) test(`login ${name}, existing completion=${completed}`, async t => {
    const view = await mount(t, { login: true, path: '/login?next=' + encodeURIComponent(value) + '&college=Offline%20Campus', user: { id: 'fixture-user' }, completed });
    assert.equal(view.navigation.length, 1);
    const target = new URL(view.navigation[0], ORIGIN);
    assert.equal(target.origin, ORIGIN);
    if (completed) assert.equal(target.pathname + target.search + target.hash, expected);
    else {
      assert.equal(target.pathname, '/onboarding'); assert.equal(target.searchParams.get('next'), expected);
      assert.equal(target.searchParams.get('college'), 'Offline Campus');
    }
    assert.deepEqual(view.calls, []); assert.deepEqual(view.reads, ['profiles']);
  });
}
test('legacy redirect alias uses the same validator and keeps a valid invitation', async t => {
  const next = '/invites?college=Offline%20Campus#pending';
  const view = await mount(t, { login: true, path: '/login?redirect=' + encodeURIComponent(next), user: { id: 'fixture-user' } });
  assert.deepEqual(view.navigation, [next]);
});
test('an invalid explicit next cannot fall back to a different redirect alias', async t => {
  const view = await mount(t, { login: true, path: '/login?next=%40evil.invalid&redirect=%2Finvites', user: { id: 'fixture-user' } });
  assert.deepEqual(view.navigation, ['/dashboard']);
});
test('unverified login identity does not navigate or invoke protected actions', async t => {
  const view = await mount(t, { login: true, path: '/login?next=%2Fhackathons', authError: { message: 'offline' } });
  assert.deepEqual(view.navigation, []); assert.deepEqual(view.reads, []); assert.deepEqual(view.calls, []);
});

const unsafeLandingPaths = [
  undefined, '', '@evil.invalid', '.evil.invalid', 'https://evil.invalid', 'https://offline.example/hackathons',
  '//evil.invalid', '/\\evil.invalid', '/\\/evil.invalid', '/%2f%2fevil.invalid', '/%5cevil.invalid',
  '/%252f%252fevil.invalid', '/%255cevil.invalid', '/x/..//evil.invalid', '/x/%252e%252e//evil.invalid',
  'javascript:alert(1)', 'data:text/html,evil', '/hackathons\r\nLocation:evil', '/hackathons?q=%250aevil',
  '/hackathons#%c2%85', '/%ZZ', '/%E0%A4%A', '/login?next=/hackathons', '/%256cogin',
  '/onboarding?next=/invites', '/auth/callback', '/api/cron/example', '/?next=/login', '/x/..?redirect=/onboarding',
];
for (const completed of [true, false]) {
  for (const next of unsafeLandingPaths) test(`landing uses common fallback without an auth loop: completed=${completed}, next=${JSON.stringify(next)}`, async t => {
    const query = next === undefined ? '' : '?next=' + encodeURIComponent(next);
    const view = await mount(t, { landing: true, path: '/' + query, user: { id: 'fixture-user' }, completed });
    assert.equal(view.navigation.length, 1);
    const target = new URL(view.navigation[0], ORIGIN);
    assert.equal(target.origin, ORIGIN);
    if (completed) assert.equal(target.pathname + target.search + target.hash, '/dashboard');
    else { assert.equal(target.pathname, '/onboarding'); assert.equal(target.searchParams.get('next'), '/dashboard'); }
    assert.deepEqual(view.calls, []); assert.deepEqual(view.reads, ['profiles']);
  });
  for (const next of [
    '/hackathons?tab=past&q=water+energy#results', '/hackathons/event-1?tab=builders#teams',
    '/profile/builder-1', '/developers?skills=React%2CNode.js#builders',
    '/teams/team-1?filter=a%26b%3Dc#join', '/invites?college=Offline%20Campus#pending',
    '/teams/create?invite=fixture-inviter&college=Offline%20Campus',
    '/hackathons?url=https%3A%2F%2Fexample.invalid%2Fx%3Fa%3D1%26b%3D2#results',
  ]) test(`landing preserves legitimate return through completion=${completed}: ${next}`, async t => {
    const view = await mount(t, { landing: true, path: '/?next=' + encodeURIComponent(next), user: { id: 'fixture-user' }, completed });
    assert.equal(view.navigation.length, 1);
    if (completed) assert.equal(view.navigation[0], next);
    else {
      const target = new URL(view.navigation[0], ORIGIN);
      assert.equal(target.pathname, '/onboarding'); assert.equal(target.searchParams.get('next'), next);
    }
    assert.deepEqual(view.calls, []); assert.deepEqual(view.reads, ['profiles'], 'Only existing onboarding lookup, no action replay');
  });
}
test('landing retains missing-profile onboarding and dashboard fallback', async t => {
  const view = await mount(t, { landing: true, path: '/?next=%2F%5Cevil.invalid', user: { id: 'fixture-user' }, completed: null });
  assert.deepEqual(view.navigation, ['/onboarding?next=%2Fdashboard']);
});
test('landing retains existing profile-error handoff with a validated destination', async t => {
  const view = await mount(t, { landing: true, path: '/?next=%2F%5Cevil.invalid', user: { id: 'fixture-user' }, completed: null, profileError: { message: 'offline' } });
  assert.deepEqual(view.navigation, ['/onboarding?next=%2Fdashboard']);
});
for (const authError of [null, { message: 'offline' }, new Error('offline')]) test(`landing without a verified identity preserves public presentation: ${authError ? 'failed lookup' : 'guest'}`, async t => {
  const view = await mount(t, { landing: true, path: '/?next=%40evil.invalid&error=AuthCallbackError', authError });
  assert.deepEqual(view.navigation, []); assert.deepEqual(view.reads, []); assert.deepEqual(view.calls, []);
  const doc = view.dom.window.document;
  assert.equal(doc.querySelector('main').className, 'relative flex min-h-screen flex-col overflow-x-clip bg-canvas text-ink');
  assert.deepEqual([...doc.querySelectorAll('[data-section]')].map(node => node.dataset.section), ['LandingHero', 'ScrambleSection', 'FindSection', 'ReviewSection', 'MergeSection', 'BuildSection', 'LandingFaq']);
  assert.deepEqual(JSON.parse(doc.querySelector('[data-section="LandingHero"]').textContent), { builderCount: 10, teamCount: 2, hackathonCount: 3, upcoming: [] });
  assert.match(doc.querySelector('[role="alert"]').textContent, /Sign-in didn.t finish/);
  assert.equal(doc.querySelector('[role="alert"] a').getAttribute('href'), '/login');
  await React.act(async () => [...doc.querySelectorAll('button')].find(button => button.textContent === 'Organizer details').click());
  const close = [...doc.querySelectorAll('button')].find(button => button.textContent === 'Close organizer'); assert(close);
  await React.act(async () => close.click());
  assert(!doc.body.textContent.includes('Close organizer'));
});
