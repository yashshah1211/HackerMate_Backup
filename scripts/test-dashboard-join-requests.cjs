/* eslint-disable @typescript-eslint/no-require-imports -- Offline React lifecycle regression tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');

const OWNER = 'fixture-owner', TEAM = 'fixture-team';
const builder = id => ({ id, full_name: `Builder ${id}`, college: 'Fixture College', year_of_study: '3rd Year', skills: ['Python', 'React'], bio: 'Builds accessible tools', avatar_url: null });
const request = id => ({ id, team_id: TEAM, user_id: `user-${id}`, status: 'pending', created_at: new Date(Date.now() - 8 * 86400000).toISOString(), profiles: builder(`user-${id}`) });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function view(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/dashboard' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const prior = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  const { createRoot } = require('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root'));
  let mounted = true, dash;
  t.after(async () => {
    if (mounted) await React.act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of prior) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const server = {
    user: OWNER, owner: OWNER, max: 4, members: [{ user_id: OWNER, role: 'owner', profiles: builder(OWNER) }],
    requests: [request('a'), request('b')], joinError: null, teamError: null, ...options.server,
  };
  const queries = [], mutations = [], toasts = [], errors = [], analytics = [], navigation = [];
  let nextList = null, nextProfile = null;
  const team = () => ({ id: TEAM, name: 'Fixture Team', owner_id: server.owner, max_members: server.max, hackathon_id: null, team_members: server.members, team_hackathons: [] });
  function from(table) {
    const q = { table, columns: '', filters: {}, mode: 'read' };
    const chain = {
      select(columns, settings) { q.columns = columns; q.settings = settings; return this; },
      eq(key, value) { q.filters[key] = value; return this; },
      in(key, values) { q.filters[key] = values; return this; },
      neq() { return this; }, or() { return this; }, gte() { return this; }, lte() { return this; }, limit() { return this; },
      order(column, settings) { q.order = { column, settings }; return this; },
      single() { q.single = true; return this; }, maybeSingle() { q.single = true; return this; },
      delete() { q.mode = 'delete'; return this; },
      then(resolve, reject) {
        queries.push(q);
        return Promise.resolve().then(async () => {
          if (q.mode === 'delete') {
            mutations.push(q);
            if (options.decline) return options.decline(q);
            const matches = server.requests.filter(r => r.id === q.filters.id && r.team_id === q.filters.team_id && r.status === q.filters.status);
            server.requests = server.requests.filter(r => !matches.includes(r));
            return { data: matches.map(r => ({ id: r.id })), error: null };
          }
          if (table === 'profiles') {
            if (q.single && nextProfile) { const response = nextProfile; nextProfile = null; return response; }
            return { data: q.single ? server.profileError ? null : { ...builder(server.user), onboarding_completed: true, ...server.profile } : [], error: server.profileError || null, count: 0 };
          }
          if (table === 'team_members' && q.mode === 'read') return { data: server.memberOfTeam ? [{ team_id: TEAM, teams: { id: TEAM } }] : [], error: server.membershipError || null };
          if (table === 'teams') return { data: q.settings?.head ? null : q.single ? team() : q.filters.owner_id && server.owner !== server.user ? [] : [team()], error: server.teamError, count: 1 };
          if (table === 'team_join_requests') {
            if (!q.single && nextList) { const response = nextList; nextList = null; return response; }
            return { data: q.single ? server.requests.find(r => r.id === q.filters.id && r.team_id === q.filters.team_id && r.status === q.filters.status) || null : server.requests.filter(r => q.filters.team_id.includes(r.team_id)), error: server.joinError };
          }
          if (table === 'partner_configs') return { data: server.partners || [], error: server.partnerError || null };
          return { data: [], error: null, count: 0 };
        }).then(resolve, reject);
      },
    };
    return chain;
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: server.user ? { id: server.user } : null }, error: null }) },
    from,
    rpc: async (name, args) => {
      mutations.push({ name, args });
      if (options.rpc) return options.rpc(name, args);
      const row = server.requests.find(r => r.id === args.p_request_id);
      assert(row, 'RPC fixture expects a pending request');
      server.members.push({ user_id: row.user_id, role: 'member', profiles: row.profiles });
      server.requests = server.requests.filter(r => r !== row);
      return { data: TEAM, error: null };
    },
    channel: () => ({ on() { return this; } }),
  };
  const element = tag => props => React.createElement(tag, {
    href: props.href, id: props.id, onClick: props.onClick, disabled: props.disabled || props.loading, title: props.title, 'data-variant': props.variant,
  }, props.children);
  const componentCache = new Map();
  const system = new Proxy({}, { get: (_, name) => {
    if (componentCache.has(name)) return componentCache.get(name);
    const Component = (() => {
    if (name === 'Section') return props => React.createElement('section', { id: props.id }, props.title, props.children);
    if (name === 'ErrorNotice') return props => React.createElement('div', { role: 'alert' }, props.title, props.detail, React.createElement('button', { onClick: props.onRetry }, 'Retry'));
    if (name === 'PageHeader') return props => React.createElement('header', null, props.title, props.meta);
    if (name === 'EmptyState') return props => React.createElement('div', null, props.title, props.body, props.action);
    return element(name === 'Button' ? 'button' : name === 'ButtonLink' ? 'a' : 'div');
    })();
    componentCache.set(name, Component);
    return Component;
  } });
  const router = { push(path) { navigation.push(path); } };
  const showToast = (message, type) => toasts.push({ message, type });
  const loader = harness({
    // The new presentation-only banner imports a CSS module; this lifecycle harness does not load styles.
    './HustlePartnershipBanner.module.css': {},
    './FeaturedPartnerEvents.module.css': { __esModule: true, default: {} },
    '@/components/partners/HustlePartnershipBanner': () => null,
    'next/link': element('a'), 'next/navigation': { useRouter: () => router },
    'motion/react': { AnimatePresence: ({ children }) => children, motion: { li: element('li') } },
    '@/lib/supabase': { supabase: client, subscribeWithRetry: () => () => {} },
    '@/lib/matchingClient': { loadTeammateRecommendations: async () => ({ data: [], error: null }) },
    '@/context/NotificationContext': { useNotification: () => ({ showToast }) },
    '@/lib/posthog': { trackEvent: (name, properties) => analytics.push({ name, properties: JSON.parse(JSON.stringify(properties)) }) }, '@/components/StreakWidget': () => null,
    '@/components/system': system,
  }, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, Event: dom.window.Event, console: { error: (...args) => errors.push(args) } });
  const { useDashboardData } = loader.load('src/app/dashboard/useDashboardData.ts');
  const { DashboardView } = loader.load('src/app/dashboard/DashboardView.tsx');
  function Probe() {
    dash = useDashboardData();
    return React.createElement(DashboardView, { data: dash.data, unreadMessages: 0, handlers: {
      onAcceptJoin: dash.acceptJoinRequest, onDeclineJoin: dash.declineJoinRequest, onReload: dash.reload,
      onConfirmYear() {}, onYearChange() {}, onOpenProfileSetup() {}, onOpenInbox() {},
    } });
  }
  await React.act(async () => { root.render(options.strict ? React.createElement(React.StrictMode, null, React.createElement(Probe)) : React.createElement(Probe)); await new Promise(resolve => setImmediate(resolve)); });
  const pending = () => dom.window.document.querySelector('#needs-you');
  const settle = async fn => React.act(async () => { await fn?.(); await new Promise(resolve => setImmediate(resolve)); });
  return {
    server, queries, mutations, toasts, errors, analytics, navigation, dom, settle, data: () => dash.data,
    pending, text: () => pending().textContent,
    rows: () => [...pending().querySelectorAll('li')],
    button: (label, index = 0) => [...pending().querySelectorAll('button')].filter(b => b.textContent === label)[index],
    click: async (label, index = 0) => { const button = [...pending().querySelectorAll('button')].filter(b => b.textContent === label)[index]; assert(button, `Missing ${label}`); assert.equal(button.disabled, false); await settle(() => button.click()); },
    reload: () => settle(() => dash.reload()),
    startReload: () => dash.reload(),
    action: (id = 'a', accept = true) => accept ? dash.acceptJoinRequest(id) : dash.declineJoinRequest(id),
    holdNextList: response => { nextList = response; },
    holdNextProfile: response => { nextProfile = response; },
    unmount: async () => { await React.act(async () => root.unmount()); mounted = false; },
  };
}

test('individual owner requests show builder details, age, team and canonical review links', async t => {
  const ui = await view(t);
  assert.equal(ui.rows().length, 2);
  assert.match(ui.text(), /Builder user-a/); assert.match(ui.text(), /Fixture College/);
  assert.match(ui.text(), /Python/); assert.match(ui.text(), /Builds accessible tools/);
  assert.match(ui.text(), /Requested \d/);
  assert(ui.pending().querySelector('a[href="/profile/user-a"]'));
  assert(ui.pending().querySelector(`a[href="/teams/${TEAM}/requests"]`));
  assert.equal([...ui.pending().querySelectorAll('button')].filter(b => b.textContent === 'Accept').length, 2);
  const query = ui.queries.find(q => q.table === 'team_join_requests' && q.mode === 'read');
  assert(!query.columns.includes('*')); assert(!query.columns.includes('email'));
  assert.equal(query.order.settings.ascending, true);
});

test('accept confirms RPC result, removes only that row and refreshes capacity', async t => {
  const ui = await view(t); await ui.click('Accept');
  assert.deepEqual(ui.mutations.map(m => JSON.parse(JSON.stringify(m))), [{ name: 'accept_team_join_request', args: { p_request_id: 'a' } }]);
  assert.equal(ui.rows().length, 1); assert.match(ui.text(), /Builder user-b/);
  assert.equal(ui.data().teams[0].memberCount, 2);
  assert.equal(ui.toasts.filter(t => t.type === 'success').length, 1);
});

test('decline only deletes the pending request for its team and confirms the returned row', async t => {
  const ui = await view(t); await ui.click('Decline');
  assert.equal(ui.mutations.length, 1); assert.equal(ui.mutations[0].columns, 'id');
  assert.deepEqual(ui.mutations[0].filters, { id: 'a', team_id: TEAM, status: 'pending' });
  assert.equal(ui.rows().length, 1); assert.equal(ui.toasts[0].type, 'info');
});

test('duplicate and competing row actions are locked before React rerenders', async t => {
  const result = deferred(); const ui = await view(t, { rpc: () => result.promise });
  let first;
  await ui.settle(() => { first = ui.action(); ui.action(); ui.action('b', false); });
  assert.equal(ui.mutations.length, 1);
  assert.equal(ui.button('Accept', 1).disabled, true); assert.equal(ui.button('Decline', 1).disabled, true);
  await ui.settle(() => result.resolve({ data: TEAM, error: null })); await first;
  assert.equal(ui.data().joinBusyId, null);
});

for (const response of [{ data: null, error: null }, { data: 'other-team', error: null }, { data: null, error: { message: 'This team is full' } }]) {
  test(`unconfirmed acceptance never reports success: ${JSON.stringify(response)}`, async t => {
    const ui = await view(t, { rpc: async () => response }); await ui.click('Accept');
    assert.equal(ui.toasts.some(t => t.type === 'success'), false);
    assert.equal(ui.rows().length, 2); assert.equal(ui.data().joinBusyId, null); assert(ui.errors.length);
  });
}

test('RLS zero-row decline is not presented as a successful rejection', async t => {
  const ui = await view(t, { decline: async () => ({ data: [], error: null }) }); await ui.click('Decline');
  assert.equal(ui.toasts.some(t => t.type === 'info'), false); assert.equal(ui.rows().length, 2);
});

test('network rejection unlocks controls and supports a fresh retry', async t => {
  let fail = true;
  const ui = await view(t, { rpc: async () => { if (fail) throw new Error('Fixture network failure'); return { data: TEAM, error: null }; } });
  await ui.click('Accept'); assert.equal(ui.button('Accept').disabled, false); assert(ui.errors.length);
  fail = false; await ui.click('Accept'); assert.equal(ui.toasts.filter(t => t.type === 'success').length, 1);
});

test('full teams disable accept while decline remains available', async t => {
  const ui = await view(t, { server: { max: 1 } }); assert.equal(ui.button('Accept').disabled, true);
  assert.match(ui.text(), /Team full/); await ui.click('Decline'); assert.equal(ui.mutations[0].mode, 'delete');
});

for (const change of ['owner', 'capacity', 'membership', 'pending', 'identity']) {
  test(`fresh preflight prevents writes after ${change} changes`, async t => {
    const ui = await view(t);
    if (change === 'owner') ui.server.owner = 'fixture-other-owner';
    if (change === 'capacity') ui.server.max = 1;
    if (change === 'membership') ui.server.members.push({ user_id: 'user-a', profiles: builder('user-a') });
    if (change === 'pending') ui.server.requests = [];
    if (change === 'identity') ui.server.user = 'fixture-other-user';
    await ui.click('Accept'); assert.equal(ui.mutations.length, 0); assert.equal(ui.toasts.some(t => t.type === 'success'), false);
  });
}

test('non-owner teams expose no request actions or request query', async t => {
  const ui = await view(t, { server: { owner: 'fixture-other-owner' } });
  assert.equal(ui.rows().length, 0); assert(!ui.queries.some(q => q.table === 'team_join_requests'));
  await ui.settle(() => ui.action()); assert.equal(ui.mutations.length, 0);
});

test('failed request refresh preserves rows, disables actions and exposes a successful Retry', async t => {
  const ui = await view(t); ui.server.joinError = { message: 'Fixture denied' }; await ui.reload();
  assert.equal(ui.rows().length, 2); assert.match(ui.text(), /Couldn't load join requests/);
  assert.equal(ui.button('Accept').disabled, true); assert(!ui.text().includes('all caught up'));
  ui.server.joinError = null; await ui.click('Retry'); assert.equal(ui.button('Accept').disabled, false);
  assert(ui.errors.length);
});

test('initial join-read failure does not show caught-up empty state', async t => {
  const ui = await view(t, { server: { joinError: { message: 'Fixture denied' } } });
  assert.match(ui.text(), /Couldn't load join requests/); assert(!ui.text().includes('all caught up'));
});

test('stale reload cannot resurrect a request after acceptance', async t => {
  const ui = await view(t); const stale = deferred(); ui.holdNextList(stale.promise);
  let reload;
  await ui.settle(() => { reload = ui.startReload(); });
  await ui.click('Accept'); assert.equal(ui.rows().length, 1);
  await ui.settle(() => stale.resolve({ data: [request('a'), request('b')], error: null })); await reload;
  assert.equal(ui.rows().length, 1); assert(!ui.text().includes('Builder user-a'));
});

test('settling an action after unmount has no toast or follow-up reload', async t => {
  const result = deferred(); const ui = await view(t, { rpc: () => result.promise });
  let action; await ui.settle(() => { action = ui.action(); }); await ui.unmount();
  const reads = ui.queries.length; result.resolve({ data: TEAM, error: null }); await action;
  assert.equal(ui.toasts.length, 0); assert.equal(ui.queries.length, reads);
});

test('missing builder profile still retains the pending request and profile link', async t => {
  const row = request('a'); row.profiles = null;
  const ui = await view(t, { server: { requests: [row] } });
  assert.match(ui.text(), /Unnamed builder/); assert.equal(ui.rows().length, 1);
  assert(ui.pending().querySelector('a[href="/profile/user-a"]'));
  await ui.click('Accept'); assert.equal(ui.toasts[0].type, 'success');
});

test('owner read failure disables preserved request actions until Retry verifies ownership', async t => {
  const ui = await view(t); ui.server.teamError = { message: 'Fixture permission failure' }; await ui.reload();
  assert.match(ui.text(), /ownership could not be verified/); assert.equal(ui.button('Decline').disabled, true);
  await ui.settle(() => ui.action('a', false)); assert.equal(ui.mutations.length, 0);
  ui.server.teamError = null; await ui.click('Retry'); assert.equal(ui.button('Decline').disabled, false);
});

test('permission revoked between preflight and delete never produces a success message', async t => {
  const ui = await view(t, { decline: async () => ({ data: null, error: { message: 'Fixture denied' } }) });
  await ui.click('Decline'); assert.equal(ui.toasts.some(t => t.type === 'info'), false);
  assert(ui.errors.length); assert.equal(ui.button('Decline').disabled, false);
});

test('refresh after a confirmed action fails safely without restoring the acted-on request', async t => {
  let ui;
  ui = await view(t, { rpc: async () => { ui.server.joinError = { message: 'Fixture network failure' }; return { data: TEAM, error: null }; } });
  await ui.click('Accept'); assert.equal(ui.rows().length, 1);
  assert(!ui.text().includes('Builder user-a')); assert.match(ui.text(), /Couldn't load join requests/);
  assert.equal(ui.button('Accept').disabled, true); assert.equal(ui.toasts.filter(t => t.type === 'success').length, 1);
});

test('identity change during a pending action suppresses its stale toast and preserves the new list', async t => {
  const result = deferred(); const ui = await view(t, { rpc: () => result.promise });
  let action; await ui.settle(() => { action = ui.action(); });
  ui.server.user = 'fixture-other-user'; ui.server.owner = 'fixture-another-owner'; await ui.reload();
  assert.equal(ui.rows().length, 0); assert.equal(ui.data().joinBusyId, null);
  await ui.settle(() => result.resolve({ data: TEAM, error: null })); await action;
  assert.equal(ui.toasts.length, 0); assert.equal(ui.rows().length, 0);
});

const promptEvents = ui => ui.analytics.filter(event => event.name.startsWith('first_team_prompt_'));
const teamSection = ui => ui.dom.window.document.querySelector('#your-teams');

test('verified teamless user sees a join-first path using existing routes, without any mutation', async t => {
  const ui = await view(t, { server: { owner: 'fixture-other-owner' } });
  const section = teamSection(ui), links = [...section.querySelectorAll('a')];
  assert.match(section.textContent, /Find a hackathon team/);
  assert.match(section.textContent, /Review a team, then send a join request/);
  assert.deepEqual(links.map(a => [a.textContent, a.getAttribute('href'), a.dataset.variant]), [
    ['Find a team', '/teams', 'primary'], ['Create a team', '/teams/create', 'secondary'],
  ]);
  assert.deepEqual(ui.mutations, []);
  assert.deepEqual(promptEvents(ui), [{ name: 'first_team_prompt_shown', properties: { source: 'dashboard_empty_teams' } }]);
});

for (const server of [{}, { owner: 'fixture-other-owner', memberOfTeam: true }]) {
  test(`returning team owner/member retains workspace navigation (${JSON.stringify(server)})`, async t => {
    const ui = await view(t, { server });
    assert(teamSection(ui).querySelector(`a[href="/teams/${TEAM}/workspace"]`));
    assert(!teamSection(ui).textContent.includes('Find a hackathon team'));
    assert.deepEqual(promptEvents(ui), []);
  });
}

for (const field of ['teamError', 'membershipError']) {
  test(`failed membership read never looks like no teams; Retry restores prompt (${field})`, async t => {
    const ui = await view(t, { server: { owner: 'fixture-other-owner', [field]: { message: 'Fixture permission denied' } } });
    assert.match(teamSection(ui).textContent, /Couldn't verify your teams/);
    assert.equal(teamSection(ui).querySelectorAll('a').length, 0);
    assert.deepEqual(promptEvents(ui), []); assert(ui.errors.some(args => JSON.stringify(args).includes('Fixture permission denied')));
    ui.server[field] = null;
    await ui.settle(() => teamSection(ui).querySelector('button').click());
    assert.match(teamSection(ui).textContent, /Find a hackathon team/);
    assert.equal(promptEvents(ui).length, 1);
  });
}

test('refresh hides stale teamless prompt until reads settle and does not duplicate its impression', async t => {
  const ui = await view(t, { server: { owner: 'fixture-other-owner' } });
  const gate = deferred(); ui.holdNextProfile(gate.promise);
  let reload; await ui.settle(() => { reload = ui.startReload(); });
  assert.equal(ui.data().teamsRefreshing, true);
  assert(!teamSection(ui).textContent.includes('Find a hackathon team'));
  assert.equal(teamSection(ui).querySelectorAll('a').length, 0);
  await ui.settle(() => gate.resolve({ data: { ...builder(OWNER), onboarding_completed: true }, error: null }));
  await reload;
  assert.match(teamSection(ui).textContent, /Find a hackathon team/);
  assert.equal(promptEvents(ui).length, 1);
});

test('incomplete onboarding follows the existing onboarding route without exposure or writes', async t => {
  const ui = await view(t, { server: { owner: 'fixture-other-owner', profile: { onboarding_completed: false } } });
  assert.deepEqual(ui.navigation, ['/onboarding']);
  assert.deepEqual(promptEvents(ui), []); assert.deepEqual(ui.mutations, []);
  assert.equal(teamSection(ui).querySelectorAll('a').length, 0);
});

test('profile errors cannot produce the first-team prompt or a false impression', async t => {
  const ui = await view(t, { server: { owner: 'fixture-other-owner', profileError: { message: 'Fixture profile denied' }, profile: { onboarding_completed: null } } });
  assert.match(teamSection(ui).textContent, /Couldn't verify your teams/);
  assert.deepEqual(promptEvents(ui), []);
});

test('each explicit path click records only its enum and source, without sending any request', async t => {
  const ui = await view(t, { server: { owner: 'fixture-other-owner' } });
  for (const [label, path] of [['Find a team', 'join'], ['Create a team', 'create']]) {
    const link = [...teamSection(ui).querySelectorAll('a')].find(a => a.textContent === label);
    link.addEventListener('click', event => event.preventDefault());
    await ui.settle(() => link.click());
    assert.deepEqual(promptEvents(ui).at(-1), { name: 'first_team_prompt_selected', properties: { source: 'dashboard_empty_teams', path } });
  }
  assert.deepEqual(ui.mutations, []);
  assert.equal(promptEvents(ui).filter(event => event.name === 'first_team_prompt_shown').length, 1);
});

test('React Strict Mode and subsequent reloads emit only one prompt impression per mounted viewer', async t => {
  const ui = await view(t, { strict: true, server: { owner: 'fixture-other-owner' } });
  assert.equal(promptEvents(ui).length, 1);
  await ui.reload(); await ui.reload();
  assert.equal(promptEvents(ui).length, 1); assert.deepEqual(ui.mutations, []);
});

// GL Bajaj college normalization (Phase A): same-campus query compatibility.
const campusQuery = ui => ui.queries.find(q => q.table === 'profiles' && q.settings?.count === 'exact' && !q.settings?.head && q.columns.includes('is_available'));
for (const [college, expected] of [
  ['Fixture College', 'Fixture College'],
  ['tcet', 'TCET Mumbai (Thakur College of Engineering and Technology)'],
  ['GL Bajaj', 'GL Bajaj'],
]) test(`dashboard campus query keeps the exact .eq match for ${JSON.stringify(college)}`, async t => {
  const ui = await view(t, { server: { owner: 'fixture-other-owner', profile: { college } } });
  assert.equal(campusQuery(ui).filters.college, expected);
});
test('dashboard campus query widens a legacy Mathura spelling to reviewed spellings without Greater Noida', async t => {
  const ui = await view(t, { server: { owner: 'fixture-other-owner', profile: { college: 'Gl bajaj mathura' } } });
  const values = Array.from(campusQuery(ui).filters.college);
  assert.equal(values[0], 'GL Bajaj Group of Institutions, Mathura');
  assert(values.includes('Gl bajaj mathura'));
  assert(values.includes('G.L. Bajaj Group Of Institutions, Mathura'));
  assert(!values.some(value => /noida/i.test(value)));
  assert(!values.includes('GL Bajaj') && !values.includes('GL Bajaj Group of Institutions'));
  assert.equal(campusQuery(ui).filters.is_banned, false);
  assert.equal(campusQuery(ui).filters.onboarding_completed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(campusQuery(ui).order)), { column: 'last_active_date', settings: { ascending: false } });
});

test('actual dashboard load selects partners deterministically through one existing public-field read', async t => {
  const end = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const row = (slug, endDate = end) => ({ slug, partner_name: slug, logo_url: null, hackathons: { id: slug, name: slug, end_date: endDate } });
  const ui = await view(t, { server: { partners: [row('z'), row('expired', '2020-01-01'), row('a'), row('undated', null)] } });
  assert.deepEqual(Array.from(ui.data().partners, p => p.slug), ['a', 'z', 'undated']);
  const queries = ui.queries.filter(q => q.table === 'partner_configs');
  assert.equal(queries.length, 1);
  assert.equal(queries[0].columns, 'slug, partner_name, logo_url, hackathons(id, name, end_date)');
  assert.equal(ui.dom.window.document.querySelectorAll('#featured-partner-title').length, 1);
  assert.equal(ui.mutations.length, 0);
});
test('partner read failure does not display partial promotions or break pending/team state', async t => {
  const ui = await view(t, { server: { partners: [{ slug: 'partial', partner_name: 'Partial record', hackathons: null }], partnerError: { code: '42501', message: 'Synthetic denial' } } });
  assert.equal(ui.data().partners.length, 0);
  assert.equal(ui.dom.window.document.querySelector('#featured-partner-title'), null);
  assert.equal(ui.rows().length, 2); assert.equal(ui.data().teams.length, 1);
  assert(ui.errors.some(args => args[0].includes('partner_configs failed')));
  assert.equal(ui.mutations.length, 0);
});
test('successful empty partner refresh clears previously rendered promotions', async t => {
  const ui = await view(t, { server: { partners: [{ slug: 'undated', partner_name: 'Configured partner', logo_url: null, hackathons: null }] } });
  assert.equal(ui.data().partners.length, 1);
  ui.server.partners = []; await ui.reload();
  assert.equal(ui.data().partners.length, 0);
  assert.equal(ui.dom.window.document.querySelector('#featured-partner-title'), null);
});
