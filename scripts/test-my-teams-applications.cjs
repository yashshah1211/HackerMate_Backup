/* eslint-disable @typescript-eslint/no-require-imports -- Offline real React/hook tests; all mutations fail. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const A = 'fixture-user-a', B = 'fixture-user-b';
const team = (id, owner = A) => ({ id, name: `QA Team ${id}`, description: 'Synthetic project', owner_id: owner, team_ppt_evaluations: [] });
const member = (id = 'member-team', user = A) => ({ user_id: user, teams: team(id, user) });
const request = (id = 'request-a', teamId = 'pending-team', user = A, extra = {}) => ({ id, team_id: teamId, user_id: user, status: 'pending', created_at: '2026-10-18T10:00:00Z', teams: { id: teamId, name: `QA Team ${teamId}` }, ...extra });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function mount(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://offline.example/my-teams', pretendToBeVisual: true });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  const { createRoot } = require('react-dom/client');
  let root = createRoot(document.getElementById('root')), active = true, hook, nextTimer = 0;
  const timers = new Map(), listeners = new Set(), reads = [], errors = [];
  const gates = { team_members: [], team_join_requests: [], auth: [] };
  const server = { user: A, members: [member()], requests: [request(), request('request-b', 'other-team', B)], ...options };
  const client = {
    auth: {
      async getUser() {
        if (gates.auth.length) return gates.auth.shift();
        return { data: { user: server.user ? { id: server.user } : null }, error: server.authError || null };
      },
      onAuthStateChange(callback) { listeners.add(callback); return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } }; },
    },
    from(tableName) {
      assert(['team_members', 'team_join_requests'].includes(tableName));
      const q = { table: tableName, filters: {}, order: [] };
      return {
        select(columns, settings) { q.columns = columns; q.settings = settings; return this; },
        eq(column, value) { q.filters[column] = value; return this; },
        order(column, settings) { q.order.push({ column, settings }); return this; },
        abortSignal(signal) { q.signal = signal; return this; },
        delete() { throw new Error('Mutations are forbidden'); }, insert() { throw new Error('Mutations are forbidden'); }, update() { throw new Error('Mutations are forbidden'); },
        then(resolve, reject) {
          reads.push(q);
          if (gates[tableName].length) return Promise.resolve(gates[tableName].shift()).then(resolve, reject);
          const all = tableName === 'team_members' ? server.members : server.requests;
          const rows = server.leakRows ? all : all.filter(row => Object.entries(q.filters).every(([key, value]) => row[key] === value));
          const data = tableName === 'team_join_requests' ? [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)) : rows;
          return Promise.resolve({ data, error: server[tableName + 'Error'] || null, count: server.count ?? rows.length }).then(resolve, reject);
        },
      };
    },
    rpc() { throw new Error('RPCs are forbidden'); },
  };
  const componentCache = new Map();
  const element = tag => props => React.createElement(tag, { id: props.id, href: props.href, onClick: props.onClick,
    disabled: props.disabled || props.loading, role: props.role, 'aria-label': props['aria-label'], dateTime: props.dateTime }, props.children);
  const system = new Proxy({}, { get(_, name) {
    if (componentCache.has(name)) return componentCache.get(name);
    let Component;
    if (name === 'Section') Component = props => React.createElement('section', { id: props.id, 'data-count': props.count }, React.createElement('h2', null, props.title), props.description, props.action, props.children);
    else if (name === 'PageHeader') Component = props => React.createElement('header', null, React.createElement('h1', null, props.title), props.meta, props.actions, props.tabs);
    else if (name === 'ErrorNotice') Component = props => React.createElement('div', { role: 'alert' }, props.title, props.detail, React.createElement('button', { onClick: props.onRetry }, 'Retry'));
    else if (name === 'EmptyState') Component = props => React.createElement('div', null, props.title, props.body, props.action);
    else if (name === 'SkeletonRows') Component = () => React.createElement('p', { 'aria-label': 'Skeleton' }, 'Loading…');
    else if (name === 'PageLoader') Component = props => React.createElement('p', { role: 'status' }, props.label);
    else Component = element(name === 'Button' ? 'button' : name === 'ButtonLink' ? 'a' : 'div');
    componentCache.set(name, Component); return Component;
  } });
  const loader = harness({
    '@/lib/supabase': { supabase: client }, 'next/link': element('a'), '@/components/system': system,
    '@/app/teams/TeamsTabs': { TeamsTabs: () => null },
  }, { window: dom.window, document: dom.window.document, AbortController, console: { error: (...args) => errors.push(args) },
    setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
  const { useMyTeamsData } = loader.load('src/app/my-teams/useMyTeamsData.ts');
  const { MyTeamsView } = loader.load('src/app/my-teams/MyTeamsView.tsx');
  function Probe() { hook = useMyTeamsData(); return React.createElement(MyTeamsView, { data: hook.data, handlers: hook }); }
  const flush = async fn => React.act(async () => {
    fn?.();
    for (let i = 0; i < 5; i++) {
      for (const [id, task] of [...timers]) { timers.delete(id); task(); }
      await new Promise(resolve => setImmediate(resolve));
    }
  });
  t.after(async () => {
    if (active) await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  const render = () => root.render(options.strict ? React.createElement(React.StrictMode, null, React.createElement(Probe)) : React.createElement(Probe));
  await flush(render); await flush();
  return { dom, server, reads, errors, listeners, flush, data: () => hook.data, hook: () => hook,
    section: id => dom.window.document.getElementById(id), text: () => dom.window.document.body.textContent,
    gate: (table, promise) => gates[table].push(promise),
    auth: async (user, event = user ? 'SIGNED_IN' : 'SIGNED_OUT') => flush(() => {
      server.user = user; for (const listener of listeners) listener(event, user ? { user: { id: user } } : null);
    }),
    unmount: async () => { await React.act(async () => root.unmount()); active = false; },
    remount: async () => { root = createRoot(document.getElementById('root')); active = true; await flush(render); await flush(); },
  };
}

test('queries use verified user filters and explicit safe columns; only pending rows become applications', async t => {
  const ui = await mount(t);
  assert.equal(ui.reads.length, 2);
  for (const q of ui.reads) { assert.equal(q.filters.user_id, A); assert(!q.columns.includes('*')); assert(!/profiles|email|message/.test(q.columns)); }
  const q = ui.reads.find(q => q.table === 'team_join_requests');
  assert.deepEqual(q.filters, { user_id: A, status: 'pending' }); assert.equal(q.settings.count, 'exact');
  assert.deepEqual(q.order.map(o => o.column), ['created_at', 'id']);
  assert.equal(ui.data().applications.data.length, 1); assert(!ui.text().includes('other-team'));
});

test('pending names, dates, status and canonical links are separate from membership counts/workspaces', async t => {
  const ui = await mount(t), applications = ui.section('pending-applications');
  assert.match(applications.textContent, /QA Team pending-team/); assert.match(applications.textContent, /Pending/);
  assert.equal(applications.querySelector('time').dateTime, '2026-10-18T10:00:00Z');
  assert(applications.querySelector('a[href="/teams/pending-team"]')); assert(!applications.querySelector('a[href*="workspace"]'));
  assert.equal(ui.section('your-memberships').dataset.count, '1'); assert.equal(applications.dataset.count, '1');
  assert(ui.section('your-memberships').querySelector('a[href="/teams/member-team/workspace"]'));
});

test('only pending requests never create memberships or expose internal team controls', async t => {
  const ui = await mount(t, { members: [] });
  assert.equal(ui.section('your-memberships').dataset.count, '0'); assert.match(ui.section('your-memberships').textContent, /No teams yet/);
  assert.equal(ui.section('pending-applications').dataset.count, '1');
  assert(!ui.section('pending-applications').textContent.match(/Workspace|Share team|Invite builders|Withdraw/));
});

test('legacy duplicates, wrong-user rows and non-pending rows cannot inflate applications', async t => {
  const ui = await mount(t, { leakRows: true, requests: [request(), request('newest', 'pending-team', A, { created_at: '2026-10-19T10:00:00Z' }), request('foreign', 'private-team', B), request('done', 'closed-team', A, { status: 'accepted' })] });
  assert.equal(ui.data().applications.data.length, 1); assert.equal(ui.data().applications.data[0].id, 'newest');
  assert(!ui.text().includes('private-team')); assert(!ui.text().includes('closed-team'));
});

test('missing nested team details and malformed dates stay truthful without dropping the pending row', async t => {
  const ui = await mount(t, { requests: [request('missing', 'hidden-team', A, { teams: null, created_at: 'not-a-date' })] });
  const section = ui.section('pending-applications');
  assert.match(section.textContent, /Team details unavailable/); assert.match(section.textContent, /Request date unavailable/);
  assert(section.querySelector('a[href="/teams/hidden-team"]')); assert.equal(section.dataset.count, '1');
});

test('application read failure preserves memberships and never displays a false zero or empty state', async t => {
  const ui = await mount(t, { team_join_requestsError: { code: '42501', message: 'Fixture denied' } });
  assert.equal(ui.section('your-memberships').dataset.count, '1'); assert.match(ui.text(), /QA Team member-team/);
  assert.equal(ui.section('pending-applications').dataset.count, undefined); assert(!ui.text().includes('No pending applications'));
  assert(ui.errors.some(args => JSON.stringify(args).includes('Fixture denied')));
  ui.server.team_join_requestsError = null;
  const before = ui.reads.filter(q => q.table === 'team_members').length;
  await ui.flush(() => ui.section('pending-applications').querySelector('button:not([aria-label])').click());
  assert.equal(ui.section('pending-applications').dataset.count, '1'); assert.equal(ui.reads.filter(q => q.table === 'team_members').length, before);
});

test('membership failure leaves applications usable and suppresses membership totals/empty state', async t => {
  const ui = await mount(t, { team_membersError: { message: 'Membership denied' } });
  assert.equal(ui.section('your-memberships').dataset.count, undefined); assert(!ui.text().includes('No teams yet'));
  assert.match(ui.text(), /membership count is unavailable/); assert.equal(ui.section('pending-applications').dataset.count, '1');
});

test('failed application refresh retains labeled last-loaded rows and an unknown count', async t => {
  const ui = await mount(t); ui.server.team_join_requestsError = { message: 'Offline' };
  await ui.flush(() => { void ui.hook().refreshApplications(); });
  assert.match(ui.section('pending-applications').textContent, /Showing last loaded/); assert.match(ui.text(), /QA Team pending-team/);
  assert.equal(ui.section('pending-applications').dataset.count, undefined); assert.equal(ui.section('your-memberships').dataset.count, '1');
});

test('row-cap partial responses show available rows but no complete/zero count', async t => {
  const ui = await mount(t, { count: 1001 });
  assert.equal(ui.data().applications.status, 'error'); assert.match(ui.text(), /Only part of your applications loaded/);
  assert.equal(ui.section('pending-applications').dataset.count, undefined); assert.match(ui.text(), /QA Team pending-team/);
});

test('refreshing a verified-empty application list shows loading rather than a blank or false empty section', async t => {
  const ui = await mount(t, { requests: [] }), gate = deferred();
  ui.gate('team_join_requests', gate.promise);
  await ui.flush(() => { void ui.hook().refreshApplications(); });
  assert(ui.section('pending-applications').querySelector('[aria-label="Loading applications"]'));
  assert.equal(ui.section('pending-applications').dataset.count, undefined);
  assert(!ui.section('pending-applications').textContent.includes('No pending applications'));
  await ui.flush(() => gate.resolve({ data: [], error: null, count: 0 }));
  assert.match(ui.section('pending-applications').textContent, /No pending applications/);
});

for (const outcome of ['success', 'error']) test(`superseded ${outcome} cannot overwrite a newer application refresh`, async t => {
  const ui = await mount(t), gate = deferred(); ui.gate('team_join_requests', gate.promise);
  await ui.flush(() => { void ui.hook().refreshApplications(); });
  const pending = ui.reads.at(-1); ui.server.requests = [request('fresh', 'fresh-team')];
  await ui.flush(() => { void ui.hook().refreshApplications(); });
  assert(pending.signal.aborted);
  await ui.flush(() => gate.resolve(outcome === 'error' ? { data: null, error: { message: 'Stale denied' } } : { data: [request()], error: null, count: 1 }));
  assert.equal(ui.data().applications.status, 'success'); assert.match(ui.text(), /fresh-team/); assert(!ui.text().includes('QA Team pending-team'));
});

test('logout clears all private rows and stale responses cannot restore them', async t => {
  const ui = await mount(t), gate = deferred(); ui.gate('team_join_requests', gate.promise);
  await ui.flush(() => { void ui.hook().refreshApplications(); }); await ui.auth(null);
  assert.equal(ui.data().viewerId, null); assert(!ui.text().includes('QA Team'));
  await ui.flush(() => gate.resolve({ data: [request()], error: null, count: 1 }));
  assert.equal(ui.data().applications.data, null); assert(!ui.text().includes('QA Team'));
});

test('account switch discards old rows before the next user read; old pending results cannot cross accounts', async t => {
  const ui = await mount(t), gate = deferred(); ui.gate('team_join_requests', gate.promise);
  await ui.flush(() => { void ui.hook().refreshApplications(); });
  ui.server.members = [member('b-member', B)]; ui.server.requests.push(request('b-request', 'b-team', B));
  await ui.auth(B); assert.equal(ui.data().viewerId, B); assert.match(ui.text(), /b-team/); assert(!ui.text().includes('QA Team pending-team'));
  await ui.flush(() => gate.resolve({ data: [request()], error: null, count: 1 }));
  assert(!ui.text().includes('QA Team pending-team')); assert(ui.reads.slice(-2).every(q => q.filters.user_id === B));
});

test('an older auth lookup cannot initiate reads after switching accounts', async t => {
  const ui = await mount(t), gate = deferred(); ui.gate('auth', gate.promise);
  await ui.flush(() => { void ui.hook().refresh(); }); await ui.auth(B);
  const before = ui.reads.length;
  await ui.flush(() => gate.resolve({ data: { user: { id: A } }, error: null }));
  assert.equal(ui.data().viewerId, B); assert.equal(ui.reads.length, before);
});

for (const outcome of ['success', 'error', 'signed-out']) test(`an older auth ${outcome} cannot supersede the latest explicit refresh`, async t => {
  const ui = await mount(t), gate = deferred(); ui.gate('auth', gate.promise);
  await ui.flush(() => { void ui.hook().refreshApplications(); });
  ui.server.requests = [request('latest', 'latest-team')];
  await ui.flush(() => { void ui.hook().refreshApplications(); });
  const before = ui.reads.length;
  await ui.flush(() => gate.resolve({ data: { user: outcome === 'signed-out' ? null : { id: A } }, error: outcome === 'error' ? { message: 'Stale auth error' } : null }));
  assert.equal(ui.reads.length, before);
  assert.match(ui.text(), /latest-team/);
});

test('auth lookup failure clears cached private rows and retry verifies identity again', async t => {
  const ui = await mount(t); ui.server.authError = { message: 'Auth offline' };
  await ui.flush(() => { void ui.hook().refresh(); });
  assert.equal(ui.data().viewerId, null); assert(!ui.text().includes('QA Team')); assert.match(ui.text(), /Couldn't verify your account/);
  ui.server.authError = null; await ui.flush(() => { void ui.hook().refresh(); });
  assert.equal(ui.data().viewerId, A); assert.equal(ui.data().memberships.status, 'success');
});

test('unmount aborts reads/unsubscribes/listeners; remount loads fresh current rows', async t => {
  const ui = await mount(t), gate = deferred(); ui.gate('team_join_requests', gate.promise);
  await ui.flush(() => { void ui.hook().refreshApplications(); }); const pending = ui.reads.at(-1);
  await ui.unmount(); assert(pending.signal.aborted); assert.equal(ui.listeners.size, 0);
  const before = ui.reads.length;
  await ui.flush(() => { ui.dom.window.dispatchEvent(new ui.dom.window.Event('focus')); gate.resolve({ data: [request()], error: null, count: 1 }); });
  assert.equal(ui.reads.length, before);
  ui.server.requests = []; await ui.remount(); assert.match(ui.text(), /No pending applications/);
});

test('joining refreshes memberships and removes applications without inventing a historical outcome', async t => {
  const ui = await mount(t); ui.server.members.push(member('pending-team')); ui.server.requests = [];
  await ui.flush(() => ui.dom.window.dispatchEvent(new ui.dom.window.Event('hm:teams-changed')));
  assert.equal(ui.section('your-memberships').dataset.count, '2'); assert.equal(ui.section('pending-applications').dataset.count, '0');
  assert(!ui.text().match(/accepted|rejected|withdrawn/i));
});

test('a lingering request for a confirmed member team is not a second application or membership', async t => {
  const ui = await mount(t, { requests: [request('lingering', 'member-team')] });
  assert.equal(ui.section('your-memberships').dataset.count, '1'); assert.equal(ui.section('pending-applications').dataset.count, '0');
});

test('previously loaded membership is not used to hide a current application after membership verification fails', async t => {
  const ui = await mount(t);
  ui.server.team_membersError = { message: 'Membership refresh failed' };
  ui.server.requests = [request('new-request', 'member-team')];
  await ui.flush(() => { void ui.hook().refresh(); });
  assert.equal(ui.section('your-memberships').dataset.count, undefined);
  assert.equal(ui.section('pending-applications').dataset.count, '1');
  assert(ui.section('pending-applications').querySelector('a[href="/teams/member-team"]'));
});

for (const event of ['focus', 'visibilitychange']) test(`returning through ${event} refreshes without polling`, async t => {
  const ui = await mount(t); ui.server.requests = [];
  await ui.flush(() => (event === 'focus' ? ui.dom.window : ui.dom.window.document).dispatchEvent(new ui.dom.window.Event(event)));
  assert.equal(ui.section('pending-applications').dataset.count, '0');
});

test('Strict Mode leaves one auth subscription, scoped current rows and no duplicate applications', async t => {
  const ui = await mount(t, { strict: true });
  assert.equal(ui.listeners.size, 1); assert.equal(ui.section('pending-applications').querySelectorAll('li').length, 1);
});

test('an unauthenticated user never starts table reads or exposes a private count', async t => {
  const ui = await mount(t, { user: null }); assert.deepEqual(ui.reads, []); assert.equal(ui.data().viewerId, null); assert(!ui.text().includes('QA Team'));
});
