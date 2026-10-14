/* eslint-disable @typescript-eslint/no-require-imports -- Offline React and read-only client regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness } = require('./ppt-vision-harness.cjs');

const TEAM = 'fixture-team', EVENT = 'fixture-event', USER = 'fixture-user';
const tasks = () => [
  { id: 'done', team_id: TEAM, title: 'Already built', status: 'completed', assignee_id: USER, due_date: '2026-01-01T00:00:00Z' },
  { id: 'open', team_id: TEAM, title: 'Build the demo', status: 'in_progress', assignee_id: USER, due_date: '2026-10-21T12:00:00Z' },
  { id: 'todo', team_id: TEAM, title: 'Prepare slides', status: 'todo', assignee_id: null, due_date: null },
];
const event = id => ({ id, name: `Event ${id}`, start_date: '2026-10-20', end_date: '2026-10-22', website_url: 'https://example.test/event', rounds_info: [{ name: 'Idea screening', end_date: '2026-10-19' }] });
const submission = id => ({ team_id: TEAM, hackathon_id: id, project_title: 'Fixture project', demo_url: 'https://example.test/demo', github_url: '', pitch_video_url: null, slides_url: 'javascript:alert(1)', completion_status: 'submitted', updated_at: '2026-10-14T12:00:00Z', checklist: [true, true, true] });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function client(options = {}) {
  const rows = {
    teams: { id: TEAM, owner_id: 'fixture-owner', hackathon_id: null },
    team_members: [{ user_id: USER, project_role: 'Frontend', profiles: { full_name: 'Fixture Builder' } }],
    team_tasks: tasks(), team_hackathons: [{ hackathon_id: EVENT }], hackathons: [event(EVENT)],
    hackathon_stages: [{ id: 'stage', hackathon_id: EVENT, title: 'Demo delivery', stage_type: 'deadline', start_time: '2026-10-22T12:00:00Z', end_time: null }],
    team_submissions: [submission(EVENT)], ...options.rows,
  };
  const calls = [], responses = new Map(), failures = options.failures || {};
  return {
    rows, calls, responses,
    auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: options.user || USER } }, error: null }) },
    from(table) {
      const call = { table, filters: {}, columns: null };
      const query = {
        select(columns, settings) { call.columns = columns; call.settings = settings; return this; },
        eq(key, value) { call.filters[key] = value; return this; }, in(key, value) { call.filters[key] = value; return this; },
        order() { return this; }, maybeSingle() { call.single = true; return this; },
        then(resolve, reject) {
          calls.push(call);
          let result;
          if (responses.get(table)?.length) result = responses.get(table).shift();
          else if (failures[table]) result = failures[table];
          else {
            const data = rows[table];
            assert.notEqual(data, undefined, `Unexpected table ${table}`);
            result = { data, error: null, count: Array.isArray(data) ? data.length : null };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      // No write methods, channels, or RPCs exist in this offline adapter.
      return query;
    },
  };
}
const errors = [];
const api = harness({}, { console: { error: (...args) => errors.push(args) } }).load('src/lib/hackathonRunMode.ts');

test('progress uses actual completed statuses, including unknown statuses in the denominator', () => {
  const summary = api.taskProgress([...tasks(), { ...tasks()[0], id: 'unknown', status: 'archived' }]);
  assert.equal(summary.percent, 25); assert.equal(summary.completed, 1); assert.equal(summary.total, 4); assert.equal(summary.unknown, 1);
  assert.equal(api.taskProgress([]).percent, null);
});
test('percentage rounding cannot show 100% with an unfinished task', () => {
  const nearlyDone = Array.from({ length: 200 }, (_, id) => ({ ...tasks()[0], id: String(id), status: id === 199 ? 'todo' : 'completed' }));
  assert.equal(api.taskProgress(nearlyDone).percent, 99);
});
test('open responsibilities exclude completed tasks and place undated tasks last', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(api.openResponsibilities(tasks()).map(t => t.id))), ['open', 'todo']);
  assert.equal(api.assigneeLabel(tasks()[1], []), 'Assignee no longer in team');
  assert.equal(api.assigneeLabel(tasks()[1], null), 'Assignment unavailable');
  assert.equal(api.assigneeLabel(tasks()[2], []), 'Unassigned');
});
test('deadline parsing does not fabricate dates or mark calendar-only due-today records overdue', () => {
  assert.equal(api.dateValue('not a date'), null); assert.equal(api.dateValue('2026-02-30'), null);
  assert.equal(api.dateValue('1'), null); assert.equal(api.dateValue('2026-02-30T12:00:00Z'), null);
  const now = new Date(2026, 9, 14, 14).getTime();
  assert.equal(api.deadlineState('2026-10-14', now), 'today');
  assert.equal(api.deadlineState('2026-10-13', now), 'overdue');
  assert.equal(api.deadlineState('2026-10-15', now), 'upcoming');
  assert.equal(api.deadlineState(null, now), 'unknown');
});
test('recorded links require safe HTTP(S) syntax and never accept embedded credentials or active schemes', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,hello', 'file:///c:/private', 'https://user:pass@example.test', '', null, 'not a URL']) assert.equal(api.recordedUrl(value), null);
  assert.equal(api.recordedUrl(' https://example.test/demo '), 'https://example.test/demo');
});

for (const who of ['member', 'owner']) test(`${who} can read a complete team-scoped overview using existing projections`, async () => {
  const db = client(who === 'owner' ? { user: 'fixture-owner' } : {});
  const result = await api.loadRunMode(db, TEAM); assert.equal(result.kind, 'ready'); assert.equal(result.tasks.data.length, 3);
  for (const call of db.calls) { assert(!call.columns.includes('*')); assert(!call.columns.includes('email')); }
  for (const table of ['team_tasks', 'team_members', 'team_hackathons', 'team_submissions']) assert.equal(db.calls.find(c => c.table === table).filters.team_id, TEAM);
  assert.deepEqual(JSON.parse(JSON.stringify(db.calls.find(c => c.table === 'team_submissions').filters.hackathon_id)), [EVENT]);
});
test('signed-out and nonmember callers perform no private overview reads', async () => {
  for (const options of [{ signedOut: true }, { user: 'fixture-visitor' }]) {
    const db = client(options); const result = await api.loadRunMode(db, TEAM); assert.equal(result.kind, 'denied');
    assert(!db.calls.some(c => ['team_tasks', 'team_submissions'].includes(c.table)));
  }
});
test('membership read failure fails closed for members while owners get an explicit responsibility error', async () => {
  const failures = { team_members: { data: null, error: { message: 'Fixture denied' }, count: null } };
  const db = client({ failures }); assert.equal((await api.loadRunMode(db, TEAM)).kind, 'error');
  assert(!db.calls.some(c => c.table === 'team_tasks'));
  const owner = await api.loadRunMode(client({ user: 'fixture-owner', failures }), TEAM);
  assert.equal(owner.kind, 'ready'); assert.equal(owner.members.data, null); assert(owner.members.error);
});
for (const table of ['team_tasks', 'team_submissions', 'hackathon_stages', 'team_hackathons']) test(`${table} read failure is unknown evidence, not empty or complete`, async () => {
  const result = await api.loadRunMode(client({ failures: { [table]: { data: null, error: { message: 'Fixture failed' }, count: null } } }), TEAM);
  assert.equal(result.kind, 'ready');
  const key = { team_tasks: 'tasks', team_submissions: 'submissions', hackathon_stages: 'stages', team_hackathons: 'events' }[table];
  assert.equal(result[key].data, null); assert(result[key].error);
});
test('truncated task response cannot produce a fabricated completion percentage', async () => {
  const result = await api.loadRunMode(client({ failures: { team_tasks: { data: [tasks()[0]], error: null, count: 20 } } }), TEAM);
  assert.equal(result.tasks.data, null); assert(result.tasks.error);
});
test('legacy linked event is included once; missing event details remain an error', async () => {
  const db = client({ rows: { teams: { id: TEAM, owner_id: USER, hackathon_id: EVENT }, team_hackathons: [] } });
  assert.equal((await api.loadRunMode(db, TEAM)).events.data.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(db.calls.find(c => c.table === 'hackathons').filters.id)), [EVENT]);
  assert((await api.loadRunMode(client({ rows: { hackathons: [] } }), TEAM)).events.error);
});
test('project-only team skips event and submission lookups without inventing a hackathon', async () => {
  const db = client({ rows: { team_hackathons: [] } }); const result = await api.loadRunMode(db, TEAM);
  assert.equal(result.events.data.length, 0); assert(!db.calls.some(c => ['hackathons', 'team_submissions', 'hackathon_stages'].includes(c.table)));
});

async function view(t, db = client(), props = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/teams/fixture-team/workspace?tab=run' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const prior = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  const root = require('react-dom/client').createRoot(dom.window.document.getElementById('root'));
  let mounted = true; const tabs = [], logs = [];
  t.after(async () => {
    if (mounted) await React.act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of prior) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  const overrides = {
    'next/link': ({ href, children, className }) => React.createElement('a', { href, className }, children),
    '@/lib/supabase': { supabase: db },
  };
  const loader = harness(overrides, { window: dom.window, console: { error: (...args) => logs.push(args) } });
  overrides['@/components/system'] = loader.load('src/components/system/index.ts');
  const Component = loader.load('src/components/workspace/HackathonRunMode.tsx').default;
  let current = { teamId: TEAM, canAccess: true, onTabChange: tab => tabs.push(tab), ...props };
  const settle = fn => React.act(async () => { await fn?.(); await new Promise(resolve => setImmediate(resolve)); });
  await settle(() => root.render(React.createElement(Component, current)));
  const button = label => [...dom.window.document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
  return { db, dom, logs, tabs, settle, text: () => dom.window.document.body.textContent,
    click: label => settle(() => { const control = button(label); assert(control, `Missing ${label}`); control.click(); }),
    render: patch => settle(() => { current = { ...current, ...patch }; root.render(React.createElement(Component, current)); }),
    unmount: async () => { await settle(() => root.unmount()); mounted = false; },
  };
}

test('real overview renders task progress, responsibilities and dates without declaring submission complete', async t => {
  const ui = await view(t); assert.match(ui.text(), /1 of 3 tasks completed · 33%/);
  assert.match(ui.text(), /Build the demo/); assert.match(ui.text(), /Fixture Builder · Frontend/); assert.match(ui.text(), /Unassigned/);
  assert.match(ui.text(), /Idea screening/); assert.match(ui.text(), /Demo delivery/);
  assert.match(ui.text(), /Stored status: submitted/); assert.match(ui.text(), /Record updated:/);
  assert.match(ui.text(), /organizer receipt are not verified/); assert.match(ui.text(), /Invalid link recorded/);
  assert(!ui.dom.window.document.querySelector('a[href^="javascript:"]'));
  assert.equal(ui.dom.window.document.querySelectorAll('#run-submissions a').length, 1);
  assert(ui.dom.window.document.querySelector(`a[href="/hackathons/${EVENT}"]`));
});
test('real overview navigation calls existing workspace sections without adding an editor', async t => {
  const ui = await view(t);
  for (const label of ['Tasks', 'GitHub', 'Deployments', 'Resources', 'Pitch review', 'Team chat']) await ui.click(label);
  assert.deepEqual(ui.tabs, ['tasks', 'github', 'deployments', 'resources', 'ppt', 'chat']);
  assert.equal(ui.dom.window.document.querySelectorAll('input,textarea').length, 0);
});
test('no tasks or submission rows remain missing evidence, never 100% or submitted', async t => {
  const ui = await view(t, client({ rows: { team_tasks: [], team_submissions: [] } }));
  assert.match(ui.text(), /Progress is unknown/); assert.match(ui.text(), /No saved submission record/);
  assert(!ui.text().includes('100%')); assert(!ui.text().includes('Stored status: submitted'));
});
test('fully completed tasks and saved artifacts still do not claim organizer delivery', async t => {
  const saved = submission(EVENT); saved.github_url = 'https://example.test/repo'; saved.pitch_video_url = 'https://example.test/video'; saved.slides_url = 'https://example.test/slides'; saved.completion_status = 'completed';
  const ui = await view(t, client({ rows: { team_tasks: [tasks()[0]], team_submissions: [saved] } }));
  assert.match(ui.text(), /1 of 1 tasks completed · 100%/); assert.match(ui.text(), /This does not confirm a submission/);
  assert.match(ui.text(), /organizer receipt are not verified/); assert.equal(ui.dom.window.document.querySelectorAll('#run-submissions a').length, 4);
});
test('an owner sees unknown assignments when responsibility metadata fails to load', async t => {
  const ui = await view(t, client({ user: 'fixture-owner', failures: { team_members: { data: null, error: { message: 'Fixture denied' }, count: null } } }));
  assert.match(ui.text(), /Assignments unavailable/); assert.match(ui.text(), /Assignment unavailable/);
  assert(!ui.text().includes('Fixture Builder')); assert.match(ui.text(), /1 of 3 tasks completed/);
});
test('missing dates and missing artifact links remain explicit unknowns', async t => {
  const missing = { ...event(EVENT), start_date: null, end_date: null, rounds_info: null };
  const saved = { ...submission(EVENT), demo_url: '', slides_url: '', project_title: '', completion_status: 'draft' };
  const ui = await view(t, client({ rows: { hackathons: [missing], hackathon_stages: [], team_submissions: [saved] } }));
  assert.match(ui.text(), /Starts: Not recorded · Ends: Not recorded/); assert.match(ui.text(), /No scheduled submission deadline recorded/);
  assert.match(ui.text(), /Project title: Not recorded/); assert.match(ui.text(), /Stored status: draft/);
  assert.equal(ui.dom.window.document.querySelectorAll('#run-submissions a').length, 0);
});
test('initial access read failure offers Retry without rendering private task or submission information', async t => {
  const db = client(); db.responses.set('teams', [{ data: null, error: { message: 'Fixture denied' }, count: null }]);
  const ui = await view(t, db); assert.match(ui.text(), /Couldn't load run mode/); assert(!ui.text().includes('Build the demo'));
  assert(!db.calls.some(c => c.table === 'team_submissions')); await ui.click('Retry'); assert.match(ui.text(), /1 of 3 tasks completed/);
});
test('submission artifacts from one event never populate another event readiness', async t => {
  const ui = await view(t, client({ rows: { team_hackathons: [{ hackathon_id: EVENT }, { hackathon_id: 'other' }], hackathons: [event(EVENT), event('other')] } }));
  assert.equal(ui.dom.window.document.querySelectorAll('#run-submissions a').length, 1);
  assert.match(ui.text(), /No saved submission record available for this event/);
});
test('failed progress read displays an error and refresh recovers the verified overview', async t => {
  const db = client(); db.responses.set('team_tasks', [{ data: null, error: { message: 'Fixture denied' }, count: null }]);
  const ui = await view(t, db); assert.match(ui.text(), /Task progress unavailable/); assert(!ui.text().includes('tasks completed ·'));
  assert(ui.logs.length); await ui.click('Refresh overview'); assert.match(ui.text(), /1 of 3 tasks completed/);
});
test('prop access revocation clears the UI and does not issue additional private reads', async t => {
  const ui = await view(t); const reads = ui.db.calls.length; await ui.render({ canAccess: false });
  assert.match(ui.text(), /Team members only/); assert(!ui.text().includes('Build the demo')); assert.equal(ui.db.calls.length, reads);
});
test('pending reads cannot show a previous team after switching', async t => {
  const db = client(), held = deferred(); db.responses.set('team_tasks', [held.promise]);
  const ui = await view(t, db); assert.match(ui.text(), /Loading run mode/);
  db.rows.teams = { id: 'next-team', owner_id: USER, hackathon_id: null }; db.rows.team_tasks = []; db.rows.team_hackathons = [];
  await ui.render({ teamId: 'next-team' }); assert.match(ui.text(), /No tasks yet/);
  await ui.settle(() => held.resolve({ data: tasks(), error: null, count: 3 }));
  assert(!ui.text().includes('Build the demo')); assert.match(ui.text(), /No tasks yet/);
});
test('an older refresh cannot replace the newest verified task snapshot', async t => {
  const db = client(), ui = await view(t, db), held = deferred(); db.responses.set('team_tasks', [held.promise]);
  await ui.click('Refresh overview'); assert.match(ui.text(), /Loading run mode/);
  // Refresh button disappears while loading; switch props to establish a new lifecycle instead.
  await ui.render({ canAccess: false }); await ui.render({ canAccess: true }); assert.match(ui.text(), /1 of 3 tasks completed/);
  await ui.settle(() => held.resolve({ data: [tasks()[0]], error: null, count: 1 }));
  assert(!ui.text().includes('100%'));
});
test('unmount ignores a delayed result without console cleanup errors', async t => {
  const db = client(), held = deferred(); db.responses.set('team_tasks', [held.promise]); const ui = await view(t, db);
  await ui.unmount(); await ui.settle(() => held.resolve({ data: tasks(), error: null, count: 3 }));
  assert.equal(ui.logs.length, 0);
});
test('workspace navigation keeps every existing section and adds a canonical Run mode entry', () => {
  const overrides = { 'next/navigation': { useRouter: () => ({}) }, '@/components/shell/ShellContext': { useImmersive() {}, useShell: () => null },
    'next/link': ({ href, children }) => React.createElement('a', { href }, children) };
  const loader = harness(overrides);
  overrides['@/components/system'] = loader.load('src/components/system/index.ts');
  const { WORKSPACE_SECTIONS, WorkspaceFrame } = loader.load('src/components/workspace/WorkspaceFrame.tsx');
  assert.deepEqual(JSON.parse(JSON.stringify(WORKSPACE_SECTIONS.map(s => s.id))), ['run', 'chat', 'tasks', 'brainstorm', 'resources', 'github', 'deployments', 'activity', 'ppt', 'gap_filler']);
  const html = renderToStaticMarkup(React.createElement(WorkspaceFrame, { team: { id: TEAM, name: 'Fixture Team' }, tone: 'hack', isOwner: false, canShare: false, tab: 'run',
    onTabChange() {}, listedHackathons: [], activeHackathon: null, countdown: { ended: false, days: 0, hours: 0, minutes: 0, seconds: 0 },
    tasks: { done: 0, total: 0, pct: 0 }, coverage: { desired: [], covered: [], missing: [] }, onlineTeammates: [], members: [], onShare() {}, onFindBuilders() {}, children: 'Fixture overview' }));
  assert.match(html, /Run mode/); assert.match(html, /Fixture overview/); assert(!html.includes('Share workspace'));
});
