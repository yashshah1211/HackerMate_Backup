/* eslint-disable @typescript-eslint/no-require-imports -- Offline navigation/auth regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { harness } = require('./ppt-vision-harness.cjs');
const { load } = require('./partner-presentation-harness.cjs');
const api = harness().load('src/lib/hackathons/discoveryNavigation.ts');
const EVENT = '00000000-0000-4000-8000-000000000006';
const target = api.eventDiscoveryHref(EVENT);
const ORIGIN = 'https://offline.example';
const USER = { id: 'offline-user' };

for (const tab of ['teams', 'builders', 'looking_for_teams', 'looking_for_builders']) test(`valid discovery link round-trips: ${tab}`, () => {
  const url = new URL(api.eventDiscoveryHref(EVENT, tab), ORIGIN);
  assert.equal(url.pathname, `/hackathons/${EVENT}`);
  assert.equal(api.eventDiscoveryTab(url.searchParams.getAll('tab')), tab);
});
for (const id of [null, undefined, '', 'event-slug', '../private', `${EVENT}?tab=organizer`, '//outside.example', 12]) test(`invalid event ID cannot produce a link: ${String(id)}`, () => {
  assert.equal(api.eventDiscoveryHref(id), null);
});
for (const tab of ['organizer', 'resources', '', 'Builders', '../private', null]) test(`unsupported tab cannot produce a link: ${String(tab)}`, () => {
  assert.equal(api.eventDiscoveryHref(EVENT, tab), null);
});

function hooks() {
  let cursor = 0; const values = [], effects = [];
  return { effects, reset() { cursor = 0; }, react: { ...React,
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial;
      return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return values[i] ||= { current: initial }; },
    useEffect(callback) { effects.push(callback); }, useId: () => 'offline-consent',
  } };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
const system = { PageLoader: () => null, Button: props => React.createElement('button', null, props.children), GithubIcon: () => null };

test('signed-out event visitors are sent to login with the entire intended event/tab destination', async () => {
  const state = hooks(), redirects = [];
  const client = { auth: {
    getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }),
    onAuthStateChange(callback) { callback('INITIAL_SESSION', null); return { data: { subscription: { unsubscribe() {} } } }; },
  }, from() { throw new Error('Signed-out flow must not read a profile'); } };
  const url = new URL(target, ORIGIN);
  const Guard = harness({ react: state.react, 'next/navigation': { useRouter: () => ({ replace: value => redirects.push(value) }) },
    '@/lib/supabase': { supabase: client }, '@/lib/posthog': { identifyUser() {} }, '@/components/system': system,
  }, { window: { location: url } }).load('src/components/AuthGuard.tsx').default;
  Guard({ children: 'Discovery', adminOnly: false });
  for (const effect of state.effects.splice(0)) effect(); await new Promise(resolve => setImmediate(resolve));
  assert(redirects.length); const login = new URL(redirects.at(-1), ORIGIN);
  assert.equal(login.pathname, '/login'); assert.equal(login.searchParams.get('next'), target);
});

test('the existing sign-in panel preserves the deep link in its OAuth callback without real sign-in', async () => {
  const state = hooks(); const calls = [];
  const Panel = harness({ react: state.react, '@/components/system': system,
    '@/lib/supabase': { supabase: { auth: { async signInWithOAuth(args) { calls.push(args); return { error: { message: 'Offline fixture stops navigation' } }; } } } },
  }, { window: { location: { origin: ORIGIN, href: `${ORIGIN}/login` } } }).load('src/components/auth/SignInPanel.tsx').SignInPanel;
  const render = () => { state.reset(); return Panel({ nextUrl: target }); };
  let tree = render();
  await find(tree, node => node.type === 'button').props.onClick(); assert.equal(calls.length, 0); // Preserve required consent.
  find(tree, node => node.type === 'input').props.onChange({ target: { checked: true } }); tree = render();
  await find(tree, node => node.type === 'button').props.onClick();
  assert.equal(calls.length, 1);
  const callback = new URL(calls[0].options.redirectTo);
  assert.equal(callback.origin, ORIGIN); assert.equal(callback.pathname, '/auth/callback');
  assert.equal(callback.searchParams.get('next'), target);
});

for (const completed of [true, false]) test(`existing auth callback retains the discovery destination; onboarding_completed=${completed}`, async () => {
  const response = url => ({ url, cookies: { set() {}, getAll: () => [] } });
  const callback = load('src/app/auth/callback/route.ts', {
    '@supabase/ssr': { createServerClient() { return {
      auth: { exchangeCodeForSession: async () => ({ data: { user: USER }, error: null }) },
      from(table) { assert.equal(table, 'profiles'); return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { onboarding_completed: completed }, error: null }) }) }) }; },
    }; } },
    'next/server': { NextResponse: { redirect: response } },
  });
  const result = await callback.GET({ url: `${ORIGIN}/auth/callback?code=offline-code&next=${encodeURIComponent(target)}`, cookies: { getAll: () => [] } });
  const destination = new URL(result.url);
  if (completed) assert.equal(destination.pathname + destination.search, target);
  else { assert.equal(destination.pathname, '/onboarding'); assert.equal(destination.searchParams.get('next'), target); }
});
