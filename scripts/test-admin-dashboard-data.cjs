/* eslint-disable @typescript-eslint/no-require-imports -- Offline route and real React lifecycle regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { NextRequest, NextResponse } = require('next/server');
const { harness } = require('./ppt-vision-harness.cjs');

const user = (id = 'qa-user', complete = false) => ({ id, full_name: `Fixture ${id}`, email: `${id}@example.invalid`,
  role: 'user', is_banned: false, onboarding_completed: complete, created_at: '2026-01-01T00:00:00Z' });
const team = { id: 'qa-team', name: 'Fixture team', owner_id: 'qa-user', created_at: '2026-01-01T00:00:00Z' };
const data = () => ({ success: true, users: [user(), user('qa-complete', true)], teams: [team], reports: [], emailUsage: null });
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

async function view(t, initial = Promise.resolve(reply(data())), analytics = Promise.resolve(reply({ success: false }))) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true });
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  t.after(async () => { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  } });
  const responses = [initial], calls = [], errors = [], toast = [];
  let refresh;
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'qa-admin', email: 'admin@example.invalid' } }, error: null }),
    getSession: async () => ({ data: { session: null } }) }, from(table) {
    assert.equal(table, 'profiles'); return { select() { return this; }, eq() { return this; }, single: async () => ({ data: { role: 'admin' } }) };
  } };
  const overrides = { '@/lib/supabase': { supabase }, '@/components/AuthGuard': ({ children }) => children,
    'next/link': ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
    '@/context/NotificationContext': { useNotification: () => ({ showToast: (...args) => toast.push(args), confirm() { throw new Error('Email/action confirmation must not run'); } }) },
    '@/components/PartnerCompositionModal': () => null };
  for (const tab of ['ReportsTab', 'DeletedLogsTab', 'TeamsTab', 'BadgesTab', 'NativeHackathonsTab', 'OutreachTab', 'PartneringTab']) overrides[`./_tabs/${tab}`] = () => null;
  overrides['./_tabs/ReportsTab'] = props => { refresh = props.onRefresh; return null; };
  const Component = harness(overrides, { window: dom.window, document: dom.window.document,
    console: { log() {}, warn() {}, error: (...args) => errors.push(args) },
    fetch: async (url, options = {}) => {
      assert.equal(options.method || 'GET', 'GET', 'Dashboard loading must never send emails or mutate data'); calls.push(url);
      if (url === '/api/admin/dashboard-data') { assert(responses.length, 'Unexpected dashboard read'); return responses.shift(); }
      if (url === '/api/admin/email-analytics') return analytics;
      if (url === '/api/admin/hackathons' || url === '/api/admin/deleted-users-log') return reply({ success: true, hackathons: [], logs: [] });
      throw new Error(`Unexpected request: ${url}`);
    },
  }).load('src/app/admin/page.tsx').default;
  await React.act(async () => root.render(React.createElement(Component)));
  const text = () => dom.window.document.body.textContent.replace(/\s+/g, ' ');
  const button = name => [...dom.window.document.querySelectorAll('button')].find(node => node.textContent.replace(/\s+/g, ' ').trim().startsWith(name));
  return { text, button, responses, calls, errors, toast, dom, refresh: () => refresh(),
    settle: async fn => React.act(async () => { await fn?.(); await new Promise(resolve => setImmediate(resolve)); }),
    click: async name => { const control = button(name); assert(control, `Missing ${name}`); assert.equal(control.disabled, false); await React.act(async () => control.click()); } };
}

test('real admin lifecycle: pending, failed initial load, Retry and successful UsersTab counts', async t => {
  const first = deferred(), retry = deferred(); const ui = await view(t, first.promise);
  assert.match(ui.text(), /Loading (?:admin )?dashboard/i);
  await ui.settle(() => first.resolve(reply({ success: false }, 503)));
  assert.match(ui.text(), /Could not load dashboard data/);
  await ui.click('Users');
  assert(!ui.text().includes('Incomplete (0)')); assert(!ui.text().includes('No users matching'));
  assert(!ui.text().includes('Nudge Incomplete'));
  ui.responses.push(retry.promise); await ui.click('Retry dashboard data');
  assert.match(ui.text(), /Loading dashboard data/);
  await ui.settle(() => retry.resolve(reply(data())));
  assert.match(ui.text(), /Incomplete \(1\)/); assert.match(ui.text(), /Fixture qa-user/);
  assert(!ui.text().includes('Could not load dashboard data')); assert.equal(ui.calls.filter(url => url.endsWith('dashboard-data')).length, 2);
  assert(ui.errors.length > 0);
});

test('real admin lifecycle: refresh failure retains successful rows and counts, then Retry replaces them', async t => {
  const ui = await view(t); await ui.click('Users');
  const refresh = deferred(); ui.responses.push(refresh.promise); await ui.click('Refresh dashboard data');
  assert.match(ui.text(), /Refreshing dashboard data/); assert.match(ui.text(), /Fixture qa-user/);
  await ui.settle(() => refresh.resolve(reply({ success: true, users: [] })));
  assert.match(ui.text(), /Showing previously loaded data/); assert.match(ui.text(), /Incomplete \(1\)/);
  assert.match(ui.text(), /Fixture qa-user/);
  ui.responses.push(Promise.resolve(reply({ ...data(), users: [user('qa-new', true)] })));
  await ui.click('Retry dashboard data'); assert.match(ui.text(), /Fixture qa-new/);
  assert(!ui.text().includes('Fixture qa-user')); assert(!ui.text().includes('Showing previously loaded data'));
});

test('real admin lifecycle: confirmed empty data can show zero and an empty user table', async t => {
  const ui = await view(t, Promise.resolve(reply({ success: true, users: [], teams: [], reports: [] })));
  await ui.click('Users'); assert.match(ui.text(), /Incomplete \(0\)/); assert.match(ui.text(), /No users matching/);
  assert(!ui.text().includes('Could not load dashboard data'));
});

for (const failure of ['network', 'invalid-json', 'unsuccessful-contract', 'null-collection', 'malformed-row']) {
  test(`real admin lifecycle: ${failure} cannot become confirmed zero data`, async t => {
    const first = deferred(); const ui = await view(t, first.promise);
    await ui.settle(() => {
      if (failure === 'network') first.reject(new Error('Fixture network failure'));
      else if (failure === 'invalid-json') first.resolve(new Response('not json'));
      else first.resolve(reply(failure === 'null-collection' ? { ...data(), users: null } :
        failure === 'malformed-row' ? { ...data(), users: [null] } : { ...data(), success: false }));
    });
    assert.match(ui.text(), /Could not load dashboard data/); await ui.click('Users');
    assert(!ui.text().includes('Incomplete (0)')); assert(!ui.text().includes('No users matching'));
  });
}

test('real admin lifecycle: access-denied refresh clears retained private dashboard rows', async t => {
  const ui = await view(t); await ui.click('Users');
  ui.responses.push(Promise.resolve(reply({ success: false }, 403))); await ui.click('Refresh dashboard data');
  assert(!ui.text().includes('Fixture qa-user')); assert(!ui.text().includes('Incomplete (0)'));
  assert.match(ui.text(), /Could not load dashboard data/);
});

test('optional pending email analytics does not prevent core dashboard loading', async t => {
  const pending = deferred(); const ui = await view(t, Promise.resolve(reply(data())), pending.promise);
  await ui.click('Users'); assert.match(ui.text(), /Fixture qa-user/);
  await ui.settle(() => pending.resolve(reply({ success: false })));
});

test('overlapping refreshes cannot apply stale rows or clear the newer loading state', async t => {
  const ui = await view(t), older = deferred(), newer = deferred();
  ui.responses.push(older.promise, newer.promise);
  await ui.settle(() => { void ui.refresh(); });
  await ui.settle(() => { void ui.refresh(); });
  await ui.settle(() => older.resolve(reply({ ...data(), users: [user('qa-stale')] })));
  assert.match(ui.text(), /Refreshing dashboard data/);
  await ui.click('Users'); assert.match(ui.text(), /Fixture qa-user/); assert(!ui.text().includes('qa-stale'));
  await ui.settle(() => newer.resolve(reply({ ...data(), users: [user('qa-current')] })));
  assert.match(ui.text(), /Fixture qa-current/); assert(!ui.text().includes('qa-stale'));
  assert(!ui.text().includes('Refreshing dashboard data'));
});

function api(queues = {}, denied = false) {
  const errors = [], queries = [];
  const all = { profiles: [{ data: data().users, error: null }], teams: [{ data: [team], error: null }], user_reports: [{ data: [], error: null }], ...queues };
  const client = { from(table) { queries.push(table); const builder = { select() { return builder; }, order() { return builder; },
    then(resolve, reject) { assert(all[table].length, 'Unexpected collection retry'); return Promise.resolve(all[table].shift()).then(resolve, reject); } }; return builder; } };
  const { GET } = harness({ 'next/server': { NextRequest, NextResponse },
    '@/lib/admin/requireAdmin': { requireAdmin: async () => denied ? NextResponse.json({ error: 'Denied' }, { status: 403 }) : { supabaseAdmin: client } },
    '@/lib/admin/emailBudgetGuard': { getTodayEmailUsageSummary: async () => null },
  }, { console: { log() {}, warn() {}, error: (...args) => errors.push(args) } }).load('src/app/api/admin/dashboard-data/route.ts');
  return { GET: () => GET(new NextRequest('http://localhost/api/admin/dashboard-data')), errors, queries };
}
test('dashboard-data contract accepts successful collections including empty arrays', async () => {
  const h = api(); const response = await h.GET(); assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.success, true); assert.equal(body.users.length, 2); assert.equal(body.reports.length, 0);
});
for (const table of ['profiles', 'teams', 'user_reports']) {
  test(`dashboard-data contract rejects failed ${table} reads instead of returning success with zeros`, async () => {
    const failed = { data: null, error: { message: 'Fixture collection query failed' } };
    const h = api({ [table]: [failed, failed] }); const response = await h.GET(); assert.equal(response.status, 500);
    const body = await response.json(); assert.equal(body.success, false); assert(!Object.hasOwn(body, 'users')); assert(h.errors.length > 0);
  });
}
test('dashboard-data contract retains the existing profiles and teams fallback queries', async () => {
  const failed = { data: null, error: { message: 'Fixture optional column unavailable' } };
  const h = api({ profiles: [failed, { data: data().users, error: null }], teams: [failed, { data: [team], error: null }] });
  const response = await h.GET(); assert.equal(response.status, 200); assert.equal((await response.json()).users.length, 2);
});
test('dashboard-data contract rejects incomplete null query results', async () => {
  const response = await api({ profiles: [{ data: null, error: null }] }).GET(); assert.equal(response.status, 500);
});
test('dashboard-data authorization denial still returns before collection reads', async () => {
  const h = api({}, true); assert.equal((await h.GET()).status, 403); assert.equal(h.queries.length, 0);
});

for (const status of ['partial', 'unavailable']) test(`email metrics UI: ${status} evidence cannot imply confirmed quota or delivery`, async t => {
  const emailUsage = { date: '2026-10-15', status, note: 'Complete provider usage is unverified.', total_sent: status === 'partial' ? 4 : null,
    limit: 100, usage_percent: null, remaining_global: null, is_resend_live: false,
    categories: { outreach: null, test_dispatches: null, notifications: null, organizer_broadcasts: null, admin_reports: null, contact_submissions: null, onboarding_nudges: null } };
  const ui = await view(t, Promise.resolve(reply({ ...data(), emailUsage })));
  await ui.click("Users");
  assert.match(ui.text(), /Remaining provider quota unavailable/);
  assert.match(ui.text(), /Email delivery metrics unavailable/);
  assert(!ui.text().includes('Source of truth')); assert(!ui.text().includes('Healthy Send Budget'));
  assert(!ui.text().includes('0 emails remaining')); assert(!ui.text().includes('100.0%'));
  if (status === 'unavailable') assert.match(ui.text(), /Metrics unavailable/);
});
test('email metrics UI labels webhook evidence as a sample and does not invent delivery rates', async t => {
  const ui = await view(t, Promise.resolve(reply(data())), Promise.resolve(reply({ success: true,
    stats: { delivered: 1, opened: 1, clicked: 0, bounced: 0, deliveryRate: 'Unavailable', openRate: 'Unavailable', clickRate: 'Unavailable' }, recentEvents: [] })));
  await ui.click("Users");
  assert.match(ui.text(), /Recent event sample/); assert.match(ui.text(), /Complete delivery and engagement rates are unavailable/);
  assert(!ui.text().includes('Live Webhooks Active')); assert(!ui.text().includes('100.0%'));
});
