/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-page regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function mount(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://offline.example/teams/fixture-team/requests' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  const root = require('react-dom/client').createRoot(document.getElementById('root'));
  const handlers = {};
  const server = { user: 'owner', count: 1, ...options }, writes = [], errors = [], toasts = [], listeners = new Set();
  const requests = [{ id: 'request-1', user_id: 'applicant', status: 'pending', profiles: { full_name: 'Synthetic Applicant' } }, { id: 'request-2', user_id: 'another', status: 'pending', profiles: { full_name: 'Another Applicant' } }];
  const client = {
    auth: { getUser: async () => ({ data: { user: server.user ? { id: server.user } : null }, error: null }),
      onAuthStateChange(fn) { listeners.add(fn); return { data: { subscription: { unsubscribe() { listeners.delete(fn); } } } }; } },
    from(table) {
      const q = { table, filters: {} };
      return { select(columns) { q.columns = columns; return this; }, eq(key, value) { q.filters[key] = value; return this; }, single() { return this; }, delete() { q.deleting = true; return this; },
        then(resolve, reject) {
          if (q.deleting) { writes.push(q); return Promise.resolve(server.result ?? { data: [{ id: q.filters.id }], error: null }).then(resolve, reject); }
          const result = table === 'teams' ? { data: { name: 'Synthetic Team', owner_id: 'owner', max_members: 4 }, error: null }
            : table === 'team_members' ? server.capacityResult ?? { count: server.count, error: server.capacityError || null }
            : server.pendingResult ?? { data: server.pendingRows ?? requests, error: server.pendingError || null };
          return Promise.resolve(result).then(resolve, reject);
        } };
    },
    async rpc(name, args) { writes.push({ name, args }); return server.result ?? { data: name === 'reject_team_join_request' ? args.p_request_id : 'fixture-team', error: null }; },
  };
  const passthrough = ({ children }) => React.createElement('div', null, children);
  const Component = harness({
    'next/navigation': { useParams: () => ({ id: 'fixture-team' }) },
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    '@/components/AuthGuard': passthrough, '@/lib/supabase': { supabase: client },
    '@/context/NotificationContext': { useNotification: () => ({ showToast: (...args) => toasts.push(args) }) },
    '@/components/system': {
      Page: passthrough, PageHeader: ({ title }) => React.createElement('h1', null, title),
      Avatar: () => null, SeatMeter: () => null, SkeletonRows: () => React.createElement('p', null, 'Loading'),
      ButtonLink: ({ children, href }) => React.createElement('a', { href }, children),
      EmptyState: ({ title }) => React.createElement('p', null, title),
      ErrorNotice: ({ detail, onRetry }) => React.createElement('div', { role: 'alert' }, detail, React.createElement('button', { onClick: onRetry }, 'Retry')),
      Button: ({ children, disabled, loading, onClick }) => { handlers[children] = onClick; return React.createElement('button', { disabled: disabled || loading, onClick }, children); },
    },
  }, { window: dom.window, document: dom.window.document, queueMicrotask, console: { error: (...args) => errors.push(args) } }).load('src/app/teams/[id]/requests/page.tsx').default;
  const flush = async fn => React.act(async () => { fn?.(); for (let i = 0; i < 4; ++i) await new Promise(resolve => setImmediate(resolve)); });
  t.after(async () => { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; } });
  await flush(() => root.render(React.createElement(Component)));
  return { server, writes, errors, toasts, flush, handler: name => handlers[name], buttons: name => [...document.querySelectorAll('button')].filter(b => b.textContent === name),
    auth: user => flush(() => { server.user = user; for (const fn of listeners) fn('SIGNED_IN', user ? { user: { id: user } } : null); }), text: () => document.body.textContent };
}

for (const data of [[], null, [{ id: 'wrong' }], [{ id: 'request-1' }, { id: 'request-2' }]]) test(`zero/malformed decline ${JSON.stringify(data)} cannot report success`, async t => {
  const ui = await mount(t, { result: { data, error: null } }); await ui.flush(() => ui.buttons('Decline')[0].click());
  assert.equal(ui.writes.length, 1); assert.equal(ui.toasts.filter(t => t[1] !== 'error').length, 0); assert(ui.errors.length);
});
test('decline confirms precisely the pending request on this team', async t => {
  const ui = await mount(t); await ui.flush(() => ui.buttons('Decline')[0].click());
  assert.deepEqual(JSON.parse(JSON.stringify(ui.writes[0])), { name: 'reject_team_join_request', args: { p_request_id: 'request-1' } }); assert.deepEqual(ui.toasts, [['Join request rejected.', 'info']]);
});
for (const data of [null, '', [], {}, 'another-team']) test(`acceptance requires intended team ID: ${JSON.stringify(data)}`, async t => {
  const ui = await mount(t, { result: { data, error: null } }); await ui.flush(() => ui.buttons('Accept')[0].click());
  assert.equal(ui.toasts.filter(t => t[1] === 'success').length, 0);
});
test('confirmed acceptance shows success', async t => {
  const ui = await mount(t); await ui.flush(() => ui.buttons('Accept')[0].click()); assert.deepEqual(ui.toasts, [['Join request accepted!', 'success']]);
});
for (const options of [{ capacityError: { message: 'Denied' }, count: null }, { count: null }, { count: -1 }]) test(`unknown capacity blocks acceptance: ${JSON.stringify(options)}`, async t => {
  const ui = await mount(t, options); assert.equal(ui.buttons('Accept').length, 0); assert.match(ui.text(), /Capacity is unavailable/); assert.equal(ui.buttons('Decline').length, 2);
});
test('all row actions lock synchronously while a mutation is in flight', async t => {
  const gate = deferred(), ui = await mount(t, { result: gate.promise });
  await ui.flush(() => { const buttons = ui.buttons('Accept'); buttons[0].click(); buttons[1].click(); });
  assert.equal(ui.writes.length, 1); assert(ui.buttons('Decline').every(b => b.disabled));
  await ui.flush(() => gate.resolve({ data: 'fixture-team', error: null })); assert.equal(ui.toasts.length, 1);
});
test('late acceptance result after account switch cannot show success', async t => {
  const gate = deferred(), ui = await mount(t, { result: gate.promise }); await ui.flush(() => ui.buttons('Accept')[0].click());
  await ui.auth('another-account'); await ui.flush(() => gate.resolve({ data: 'fixture-team', error: null }));
  assert.deepEqual(ui.toasts, []); assert.equal(ui.buttons('Accept').length, 0);
});
test('uncertain response never retries or reports success', async t => {
  const gate = deferred(), ui = await mount(t, { result: gate.promise }); await ui.flush(() => ui.buttons('Decline')[0].click());
  await ui.flush(() => gate.resolve(Promise.reject(new Error('Synthetic disconnect after possible commit'))));
  assert.equal(ui.writes.length, 1); assert.equal(ui.toasts.filter(t => t[1] !== 'error').length, 0);
});


test('failed pending refresh disables retained rows and saved actions; accessible Retry verifies recovery', async t => {
  const ui = await mount(t), staleDecline = ui.handler('Decline');
  assert(ui.buttons('Accept').every(b => !b.disabled));
  ui.server.pendingError = { code: '42501', message: 'Synthetic pending refresh denied' };
  await ui.flush(() => ui.buttons('Accept')[0].click());
  assert.equal(ui.writes.length, 1);
  assert.equal(ui.buttons('Accept').length, 2, 'previously loaded rows remain visible');
  assert(ui.buttons('Accept').every(b => b.disabled));
  assert(ui.buttons('Decline').every(b => b.disabled));
  assert.match(ui.text(), /Couldn.t verify the latest requests/);
  assert(ui.errors.some(args => args.includes(ui.server.pendingError)), 'actual query error logged');
  await ui.flush(() => { staleDecline(); ui.buttons('Decline')[0].click(); ui.buttons('Accept')[0].click(); });
  assert.equal(ui.writes.length, 1, 'unverified rows cannot issue another mutation');
  const retry = ui.buttons('Retry')[0]; assert(retry && !retry.disabled);
  retry.focus(); assert.equal(document.activeElement, retry);
  ui.server.pendingError = null;
  ui.server.pendingRows = [{ id: 'request-2', user_id: 'another', status: 'pending', profiles: { full_name: 'Verified Applicant' } }];
  await ui.flush(() => retry.click());
  assert.equal(ui.buttons('Accept').length, 1); assert.equal(ui.buttons('Accept')[0].disabled, false);
  assert.equal(ui.buttons('Decline')[0].disabled, false); assert.equal(ui.buttons('Retry').length, 0);
  assert.equal(ui.writes.length, 1, 'Retry only reads');
});

test('pending refresh in flight blocks retained decision callbacks before the response settles', async t => {
  const ui = await mount(t), staleDecline = ui.handler('Decline'), pending = deferred();
  ui.server.pendingResult = pending.promise;
  await ui.flush(() => ui.buttons('Accept')[0].click());
  assert(ui.buttons('Decline').every(b => b.disabled));
  await ui.flush(() => staleDecline()); assert.equal(ui.writes.length, 1);
  await ui.flush(() => pending.resolve({ data: [], error: null }));
  assert.equal(ui.buttons('Decline').length, 0); assert.match(ui.text(), /No pending requests/);
});

test('capacity-only failure leaves verified Decline available and Accept unavailable', async t => {
  const ui = await mount(t, { count: null, capacityError: { message: 'Synthetic capacity unavailable' } });
  assert.equal(ui.buttons('Accept').length, 0);
  assert(ui.buttons('Decline').every(b => !b.disabled));
  await ui.flush(() => ui.buttons('Decline')[0].click());
  assert.equal(ui.writes.length, 1); assert.deepEqual(ui.toasts, [['Join request rejected.', 'info']]);
  assert(ui.buttons('Decline').every(b => !b.disabled));
});

test('thrown capacity transport failure does not discard a verified pending list', async t => {
  const failure = new Error('Synthetic capacity transport failure');
  const ui = await mount(t, { capacityResult: { then(_resolve, reject) { reject(failure); } } });
  assert.equal(ui.buttons('Accept').length, 0); assert(ui.buttons('Decline').every(b => !b.disabled));
  assert(ui.errors.some(args => args.includes(failure)));
  await ui.flush(() => ui.buttons('Decline')[0].click()); assert.equal(ui.writes.length, 1);
});
