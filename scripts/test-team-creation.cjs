/* eslint-disable @typescript-eslint/no-require-imports -- Offline tests exercise the real page using the existing harness. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness, ROOT } = require('./ppt-vision-harness.cjs');

const TEAM = '10000000-0000-0000-0000-000000000001';
const BUILDER = '00000000-0000-0000-0000-000000000003';
const EVENT = '20000000-0000-0000-0000-000000000001';
const WORKSPACE = `/teams/${TEAM}/workspace`;
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

// Like test-squad-matching.cjs, run the real component with offline hooks/RPCs.
// Resolve fixture slots by declaration name rather than hard-coded hook indexes.
const source = fs.readFileSync(path.join(ROOT, 'src/app/teams/create/page.tsx'), 'utf8');
const stateNames = Array.from(source.matchAll(/const \[([A-Za-z_]+),[^\]]+\] = useState/g), match => match[1]);
function ui(options = {}) {
  const values = new Map();
  const refs = [];
  let cursor = 0;
  let refCursor = 0;
  const initial = {
    name: 'Fixture team', description: 'Build an offline fixture', selectedSkills: ['React'],
    selectedRoles: ['Backend Developer'], hackathonsLoading: false,
    hackathonId: options.event || '', hackathons: options.event ? [{ id: options.event, name: 'Fixture event' }] : [],
    ...options.initial,
  };
  const hooks = {
    ...React,
    useState(start) {
      const name = stateNames[cursor++];
      assert(name, 'Every state slot must have a known declaration');
      if (!values.has(name)) values.set(name, Object.hasOwn(initial, name) ? initial[name] : start);
      return [values.get(name), value => values.set(name, typeof value === 'function' ? value(values.get(name)) : value)];
    },
    useRef(start) { const index = refCursor++; return refs[index] ||= { current: start }; },
    useEffect() {},
  };
  const calls = [];
  const navigations = [];
  const toasts = [];
  const events = [];
  const dispatched = [];
  const client = {
    auth: { getUser: options.auth || (async () => ({ data: { user: { id: 'fixture-owner' } } })) },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'create_team_with_owner') return options.create ? options.create() : { data: TEAM, error: null };
      assert.equal(name, 'send_team_invite');
      return options.invite ? options.invite() : { error: null };
    },
    from(table) {
      assert.equal(table, 'team_hackathons');
      return { upsert: async (row, config) => {
        calls.push({ name: 'link_event', row, config });
        return options.link ? options.link() : { error: null };
      } };
    },
  };
  const element = tag => ({ children, href, className, role, disabled, loading, onClick, ...props }) =>
    React.createElement(tag, { href, className, role, disabled: disabled || loading, onClick, 'aria-live': props['aria-live'] }, children);
  const system = new Proxy({}, { get: (_, name) => element(name === 'Button' ? 'button' : name === 'ButtonLink' ? 'a' : 'div') });
  const overrides = {
    react: hooks,
    'next/navigation': {
      useRouter: () => ({ replace: href => navigations.push(href) }),
      useSearchParams: () => new URLSearchParams(options.invited ? { invite: BUILDER } : {}),
    },
    '@/lib/supabase': { supabase: client },
    '@/context/NotificationContext': { useNotification: () => ({ showToast: (message, type) => toasts.push({ message, type }) }) },
    '@/lib/posthog': { trackEvent: (name, props) => {
      events.push({ name, props });
      if (options.track) options.track();
    } },
    '@/components/system': system,
    '@/components/AuthGuard': ({ children }) => children,
    '@/components/ContextualProfileNudgeModal': () => null,
  };
  const Page = harness(overrides, { window: { dispatchEvent: event => dispatched.push(event.type) }, Event }).load('src/app/teams/create/page.tsx').default;
  const Form = Page().props.children.props.children.type;
  let tree;
  const render = () => { cursor = 0; refCursor = 0; tree = Form(); return tree; };
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  }
  render();
  return {
    calls, navigations, toasts, events, dispatched, values, render,
    html: () => renderToStaticMarkup(render()),
    submit: () => find(tree, node => node.props?.children === 'Create team' || node.props?.children === 'Creating team…'),
    nudge: () => find(tree, node => typeof node.props?.onProceed === 'function'),
  };
}

test('successful creation opens the workspace using the scalar returned UUID', async () => {
  const view = ui();
  view.submit().props.onClick();
  await settle();
  assert.deepEqual(view.navigations, [WORKSPACE]);
  assert.equal(view.calls.length, 1);
  assert.equal(view.calls[0].args.p_name, 'Fixture team');
  assert.equal(view.events[0].name, 'team_created');
  assert.equal(view.events[0].props.team_id, TEAM);
  assert.deepEqual(view.dispatched, ['hm:teams-changed']);
  assert(!view.html().includes('Create team</button>'));
});

test('event context and automatic invitation are preserved before navigating', async () => {
  const pending = deferred();
  const view = ui({ event: EVENT, invited: true, invite: () => pending.promise });
  view.submit().props.onClick();
  await settle();
  assert.deepEqual(view.calls.map(call => call.name), ['create_team_with_owner', 'link_event', 'send_team_invite']);
  assert.equal(view.calls[0].args.p_hackathon_id, EVENT);
  assert.equal(view.calls[1].row.team_id, TEAM);
  assert.equal(view.calls[2].args.p_team_id, TEAM);
  assert.equal(view.calls[2].args.p_invited_user_id, BUILDER);
  assert.deepEqual(view.navigations, []);
  pending.resolve({ error: null });
  await settle();
  assert.deepEqual(view.navigations, [`${WORKSPACE}?hackathon_id=${EVENT}`]);
  assert.match(view.toasts[0].message, /invite sent/);
});

for (const thrown of [false, true]) test(`invitation ${thrown ? 'exception' : 'RPC rejection'} retains the created team and offers recovery`, async () => {
  const view = ui({ invited: true, invite: async () => {
    if (thrown) throw new Error('Offline transport failure');
    return { error: { message: 'Invitation rejected' } };
  } });
  const oldSubmit = view.submit().props.onClick;
  oldSubmit();
  await settle();
  const html = view.html();
  assert.match(html, /invitation could not be confirmed/);
  assert.match(html, /role="status"/);
  assert.match(html, new RegExp(`href="${WORKSPACE}"`));
  assert.match(html, new RegExp(`href="/profile/${BUILDER}"`));
  assert(!html.includes('Create team</button>'));
  assert(!view.toasts.some(toast => toast.type === 'error'));
  assert.deepEqual(view.navigations, []);
  assert.deepEqual(view.dispatched, ['hm:teams-changed']);
  oldSubmit();
  await settle();
  assert.equal(view.calls.filter(call => call.name === 'create_team_with_owner').length, 1);
});

test('synchronous repeated clicks and clicks after success never create a second team', async () => {
  const pending = deferred();
  const view = ui({ create: () => pending.promise });
  const click = view.submit().props.onClick;
  click(); click();
  await settle();
  assert.equal(view.calls.length, 1);
  view.render();
  assert.equal(view.submit().props.disabled, true);
  pending.resolve({ data: TEAM, error: null });
  await settle();
  click();
  await settle();
  assert.equal(view.calls.length, 1);
});

test('creation RPC rejection retains the error and allows a deliberate retry', async () => {
  let attempts = 0;
  const view = ui({ create: async () => ++attempts === 1 ? { error: { message: 'Creation denied' } } : { data: TEAM, error: null } });
  view.submit().props.onClick();
  await settle();
  assert.deepEqual(view.toasts, [{ message: 'Creation denied', type: 'error' }]);
  assert.equal(view.values.get('loading'), false);
  assert.deepEqual(view.navigations, []);
  assert.deepEqual(view.dispatched, []);
  view.render(); view.submit().props.onClick();
  await settle();
  assert.deepEqual(view.navigations, [WORKSPACE]);
  assert.deepEqual(view.dispatched, ['hm:teams-changed']);
});

test('creation exception clears busy state without claiming success', async () => {
  const view = ui({ create: async () => { throw new Error('Offline transport failure'); } });
  view.submit().props.onClick();
  await settle();
  assert.equal(view.values.get('loading'), false);
  assert.equal(view.values.get('handoff'), null);
  assert.equal(view.toasts[0].type, 'error');
  assert.deepEqual(view.navigations, []);
});

test('a missing returned identifier never generates a success or workspace URL', async () => {
  const view = ui({ invited: true, create: async () => ({ data: null, error: null }) });
  view.submit().props.onClick();
  await settle();
  assert.match(view.toasts[0].message, /Check My teams/);
  assert.deepEqual(view.navigations, []);
  assert.equal(view.events.length, 0);
  assert.equal(view.calls.length, 1);
});

test('an expired session never invokes the creation RPC', async () => {
  const view = ui({ auth: async () => ({ data: { user: null } }) });
  view.submit().props.onClick();
  await settle();
  assert.equal(view.calls.length, 0);
  assert.equal(view.values.get('loading'), false);
  assert.equal(view.toasts[0].message, 'You must be logged in');
});

test('existing form validation still rejects missing required fields', async () => {
  const view = ui({ initial: { selectedRoles: [] } });
  view.submit().props.onClick();
  await settle();
  assert.equal(view.calls.length, 0);
  assert.match(view.toasts[0].message, /select at least one role/);
});

test('profile nudge still precedes creation and repeated proceed actions are guarded', async () => {
  const pending = deferred();
  const view = ui({ initial: { currentUserProfile: { id: 'fixture-owner', skills: ['React'] } }, create: () => pending.promise });
  view.submit().props.onClick();
  assert.equal(view.calls.length, 0);
  assert.equal(view.values.get('nudgeModalOpen'), true);
  view.render();
  const proceed = view.nudge().props.onProceed;
  proceed(); proceed();
  await settle();
  assert.equal(view.calls.length, 1);
  pending.resolve({ data: TEAM, error: null });
  await settle();
  assert.deepEqual(view.navigations, [WORKSPACE]);
});

test('optional event-link exceptions do not undo creation or prevent workspace handoff', async () => {
  const view = ui({ event: EVENT, link: async () => { throw new Error('Link unavailable'); } });
  view.submit().props.onClick();
  await settle();
  assert.deepEqual(view.navigations, [`${WORKSPACE}?hackathon_id=${EVENT}`]);
  assert(!view.toasts.some(toast => toast.type === 'error'));
});

test('analytics exceptions cannot prevent the invitation or workspace handoff', async () => {
  const view = ui({ invited: true, track: () => { throw new Error('Analytics unavailable'); } });
  view.submit().props.onClick();
  await settle();
  assert.deepEqual(view.calls.map(call => call.name), ['create_team_with_owner', 'send_team_invite']);
  assert.deepEqual(view.navigations, [WORKSPACE]);
});

// GL Bajaj college normalization (Phase A): team payloads use the same campus rules.
const MATHURA = 'GL Bajaj Group of Institutions, Mathura';
for (const [initial, expected] of [
  [{ college: 'Other', customCollege: 'G.L. Bajaj Group Of Institutions, Mathura' }, MATHURA],
  [{ college: 'Other', customCollege: ' Gl bajaj mathura ' }, MATHURA],
  [{ college: MATHURA }, MATHURA],
  [{ college: 'Other', customCollege: 'GL Bajaj Institute of Technology and Management, Greater Noida' }, 'GL Bajaj Institute of Technology & Management, Greater Noida'],
  [{ college: 'Other', customCollege: 'GL Bajaj' }, 'GL Bajaj'],
  [{ college: 'Other', customCollege: 'GL Bajaj Group of Institutions' }, 'GL Bajaj Group of Institutions'],
  [{ college: 'Other', customCollege: 'tcet' }, 'TCET Mumbai (Thakur College of Engineering and Technology)'],
  [{ college: 'Other', customCollege: 'Offline Campus' }, 'Offline Campus'],
]) test(`team creation sends normalized p_college for ${JSON.stringify(initial)}`, async () => {
  const view = ui({ initial });
  view.submit().props.onClick();
  await settle();
  assert.equal(view.calls[0].name, 'create_team_with_owner');
  assert.equal(view.calls[0].args.p_college, expected);
});

for (const [stored, expected] of [['Gl bajaj mathura', MATHURA], ['GL Bajaj Group of Institutions', 'GL Bajaj Group of Institutions']]) {
  test(`team creation falls back to the normalized profile college for ${JSON.stringify(stored)}`, async () => {
    const view = ui({ initial: { currentUserProfile: { id: 'fixture-owner', skills: ['React'], college: stored } } });
    view.submit().props.onClick();
    view.render();
    view.nudge().props.onProceed();
    await settle();
    assert.equal(view.calls[0].args.p_college, expected);
  });
}

test('team college search finds Mathura only for "g.l bajaj mathura" and keeps Other for an empty search', () => {
  const html = ui({ initial: { showCollegeDropdown: true, collegeSearch: 'g.l bajaj mathura' } }).html();
  assert(html.includes(MATHURA));
  assert(!html.includes('Greater Noida'));
  const both = ui({ initial: { showCollegeDropdown: true, collegeSearch: 'GL Bajaj' } }).html();
  assert(both.includes(MATHURA) && both.includes('Greater Noida'));
  const all = ui({ initial: { showCollegeDropdown: true, collegeSearch: '' } }).html();
  assert(all.includes('>Other</button>'));
});
