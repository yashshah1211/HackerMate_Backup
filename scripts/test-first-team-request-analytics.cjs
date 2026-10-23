/* eslint-disable @typescript-eslint/no-require-imports -- Offline real React join-request tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');

async function mount(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://offline.example/teams/fixture-team' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  const { createRoot } = require('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const events = [], writes = [], errors = [];
  let overview;
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: options.visitor ? null : { id: 'fixture-viewer' } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from(table) {
      const q = { single: false };
      return {
        select() { return this; }, eq() { return this; }, order() { return this; },
        single() { q.single = true; return this; }, maybeSingle() { q.single = true; return this; },
        then(resolve, reject) {
          let data = [];
          if (table === 'teams') data = { id: 'fixture-team', name: 'Fixture team', owner_id: 'fixture-owner', skills: [], max_members: 4, team_hackathons: [] };
          else if (table === 'profiles') data = { skills: ['React'] };
          else if (q.single) data = table === 'team_members' && options.member ? { id: 'fixture-membership' } : null;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
    },
    async rpc(name, args) {
      writes.push({ name, args: JSON.parse(JSON.stringify(args)) });
      return { data: '10000000-0000-4000-8000-000000000001', error: options.rpcError || null };
    },
  };
  const Component = harness({
    'next/navigation': { useRouter: () => ({}), useParams: () => ({ id: 'fixture-team' }), useSearchParams: () => new URLSearchParams() },
    '@/lib/supabase': { supabase },
    '@/lib/posthog': { trackEvent: (name, properties) => { if (options.analyticsError) throw options.analyticsError; events.push({ name, properties: JSON.parse(JSON.stringify(properties)) }); } },
    '@/context/NotificationContext': { useNotification: () => ({ showToast() {}, confirm() { throw new Error('Unexpected confirmation'); } }) },
    '@/components/TeamOverviewView': props => {
      overview = props;
      return React.createElement('button', { disabled: props.requestLoading || props.requestSent || props.isMember || props.requestStatus !== 'ready', onClick: props.requestToJoin }, props.requestSent ? 'Request sent' : 'Request to join');
    },
    '@/components/system': { PageLoader: () => React.createElement('p', null, 'Loading') },
  }, { window: dom.window, document: dom.window.document, console: { error: (...args) => errors.push(args) } }).load('src/app/teams/[id]/page.tsx').default;
  t.after(async () => {
    await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  await React.act(async () => { root.render(React.createElement(Component)); await new Promise(resolve => setImmediate(resolve)); });
  await React.act(async () => { await new Promise(resolve => setImmediate(resolve)); });
  return { events, writes, errors, overview: () => overview, button: () => document.querySelector('button'),
    click: async () => React.act(async () => document.querySelector('button').click()) };
}

test('loading team details sends nothing; one explicit successful request emits one content-free event', async t => {
  const ui = await mount(t);
  assert.deepEqual(ui.events, []); assert.deepEqual(ui.writes, []);
  await ui.click();
  assert.deepEqual(ui.writes, [{ name: 'request_to_join_team', args: { p_team_id: 'fixture-team' } }]);
  assert.deepEqual(ui.events, [{ name: 'team_join_request_sent', properties: { source: 'team_detail' } }]);
  assert.equal(ui.button().textContent, 'Request sent'); assert.equal(ui.button().disabled, true);
  await ui.click(); assert.equal(ui.events.length, 1); assert.equal(ui.writes.length, 1);
});

for (const rpcError of [{ code: '23505', message: 'Already sent' }, { code: '42501', message: 'Permission denied' }]) {
  test(`failed/duplicate join request has no success analytics (${rpcError.code})`, async t => {
    const ui = await mount(t, { rpcError }); await ui.click();
    assert.equal(ui.writes.length, 1); assert.deepEqual(ui.events, []);
    assert.equal(ui.overview().requestSent, false); assert.equal(ui.button().disabled, false); assert.equal(ui.errors.length, 1);
  });
}

for (const options of [{ visitor: true }, { member: true }]) {
  test(`visitor/member preflight cannot emit a sent event (${JSON.stringify(options)})`, async t => {
    const ui = await mount(t, options);
    // Invoke the handler as well as checking mount; existing membership/auth checks must still apply.
    await React.act(async () => ui.overview().requestToJoin());
    assert.deepEqual(ui.writes, []); assert.deepEqual(ui.events, []);
  });
}

test('analytics failure preserves confirmed submission and never offers a duplicate', async t => {
  const ui = await mount(t, { analyticsError: new Error('Synthetic analytics unavailable') });
  await ui.click();
  assert.equal(ui.overview().requestSent, true); assert.equal(ui.overview().requestStatus, 'ready');
  assert.equal(ui.button().disabled, true); assert.equal(ui.writes.length, 1); assert.equal(ui.errors.length, 1);
});
