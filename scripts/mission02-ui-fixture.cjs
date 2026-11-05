/* eslint-disable @typescript-eslint/no-require-imports -- Mounted production components, synthetic Supabase only. */
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const message = (conversation, id = conversation + '-message') => ({ id, conversation_id: conversation, sender_id: 'other', content: conversation + ' private message',
  is_read: false, created_at: '2026-11-05T10:00:00Z' });
const task = (id = 'task-one') => ({ id, team_id: 'team-one', title: id, description: '', status: 'todo', priority: 'medium', assignee_id: null, due_date: null, created_at: '2026-11-05T10:00:00Z' });

async function mount(t, kind, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' + (kind === 'messages' ? 'messages' : 'teams/team-one/workspace') });
  const keys = ['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'];
  const prior = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  dom.window.HTMLElement.prototype.scrollTo = function () {};
  dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  const state = { queries: [], rpc: [], channels: [], errors: [], toasts: [], confirmations: [], elements: [], route: 'team-one', ...options };
  const db = { auth: { async getUser() { return { data: { user: { id: 'me', email: 'me@example.invalid' } }, error: null }; } },
    rpc(name, args) {
      state.rpc.push({ name, args });
      if (state.onRpc) return state.onRpc(name, args);
      return Promise.resolve({ data: name === 'ensure_team_conversation' ? 'team-conversation' : name === 'get_my_dm_conversations' ?
        [{ conversation_id: 'one', other_user_id: 'other', last_message: 'Preview', unread_count: 3 }] : null, error: null });
    },
    from(table) {
      const q = { table, operation: 'select', filters: [], columns: '', single: false };
      const query = { select(columns) { q.columns = columns; return this; }, eq(...args) { q.filters.push(args); return this; },
        in(...args) { q.filters.push(args); return this; }, or(value) { q.or = value; return this; }, gt(...args) { q.filters.push(args); return this; }, lt(...args) { q.filters.push(args); return this; },
        order(...args) { (q.orders ||= []).push(args); return this; }, range(...args) { q.range = args; return this; }, limit(value) { q.limit = value; return this; }, neq() { return this; }, is() { return this; },
        insert(value) { q.operation = 'insert'; q.value = value; return this; }, update(value) { q.operation = 'update'; q.value = value; return this; },
        delete() { q.operation = 'delete'; return this; }, maybeSingle() { q.single = true; return this; }, single() { q.single = true; return this; },
        then(resolve, reject) {
          state.queries.push(q);
          return Promise.resolve().then(() => {
            if (state.onQuery) { const value = state.onQuery(q); if (value !== undefined) return value; }
            let rows = [];
            if (table === 'conversations') rows = [{ type: 'dm' }];
            if (table === 'conversation_participants') rows = [{ user_id: 'me', cleared_at: null }, { user_id: 'other' }];
            if (table === 'messages') rows = [message(q.filters.find(([key]) => key === 'conversation_id')?.[1] || 'one')];
            if (table === 'profiles') rows = ['me','other'].map(id => ({ id, full_name: id, email: id + '@example.invalid', avatar_url: null, college: null }));
            if (table === 'team_tasks') rows = [task(), task('task-two')];
            if (table === 'teams' && kind === 'workspace-route') {
              const id = q.filters.find(([column]) => column === 'id')?.[1];
              rows = [{ id, name: id, owner_id: id === 'team-one' ? 'me' : 'someone-else', team_hackathons: [] }];
            }
            return { data: q.single ? rows[0] || null : rows, error: null };
          }).then(resolve, reject);
        },
      }; return query;
    },
    channel(name) {
      const channel = { name, callbacks: [], removed: false, on(event, filter, callback) { this.callbacks.push({ event, filter, callback }); return this; },
        subscribe() { return this; }, unsubscribe() { this.removed = true; }, send() {}, track() {}, presenceState() { return {}; } };
      state.channels.push(channel); return channel;
    }, removeChannel(channel) { channel.removed = true; },
  };
  const jsx = require('react/jsx-runtime');
  const runtime = Object.fromEntries(['jsx','jsxs'].map(name => [name, (type, props, key) => { if (!type) throw Error('Fixture missing component: ' + Object.keys(props).join(',')); state.elements.push({ type, props }); return jsx[name](type, props, key); }]));
  runtime.Fragment = jsx.Fragment;
  const primitive = (tag = 'div') => function Primitive({ children, label, title, body, action, onClick, onChange, value, id, disabled, ...rest }) {
    const props = { id, onClick, onChange, value, disabled, 'aria-label': rest['aria-label'] || label };
    return tag === 'input' ? React.createElement(tag, props) : React.createElement(tag, props, title, body, children, action);
  };
  const system = new Proxy({ Dialog: ({ open, children }) => open ? React.createElement('div', null, children) : null,
    CountBadge: ({ value }) => React.createElement('span', { 'data-unread-count': value }, value),
    useMediaQuery: () => false, Menu: () => null, Avatar: () => null, Spinner: () => null,
    Button: primitive('button'), IconButton: primitive('button'), ButtonLink: primitive('a'), Input: primitive('input'), Textarea: primitive('textarea'), Select: primitive('select'),
  }, { get: (obj, key) => obj[key] || primitive() });
  const empty = () => null;
  const overrides = { 'react/jsx-runtime': runtime, '@/lib/supabase': { supabase: db, subscribeWithRetry: channel => () => { channel.removed = true; } },
    '@/components/system': system, '@/lib/safety': { moderateMessage: content => ({ isValid: true, sanitized: content }) },
    'next/link': primitive('a'), 'next/navigation': { useRouter: () => ({ replace() {} }), useSearchParams: () => new URLSearchParams(), useParams: () => ({ id: state.route }) },
    '@/components/AuthGuard': ({ children }) => children,
    '@/context/NotificationContext': { useNotification: () => ({ showToast: (...args) => state.toasts.push(args), confirm: value => state.confirmations.push(value) }) },
    '@/components/shell/ShellContext': { useImmersive() {} },
    '@/components/workspace/WorkspaceFrame': { WorkspaceFrame: ({ children }) => React.createElement('div', null, children) },
  };
  for (const name of ['LinkPreviewCard','ImageLightbox','VoiceNotePlayer','ShareModal','PPTEvaluatorTab','SmartGapFiller','workspace/SharedTeamDocument','workspace/HackathonRunMode']) overrides['@/components/' + name] = empty;
  overrides['@/components/workspace/WorkspaceSkeletons'] = { KanbanTasksSkeleton: empty, CommitsTimelineSkeleton: empty, IdeationBoardSkeleton: empty };
  if (kind !== 'chat') overrides['@/components/chatThread'] = empty;
  if (kind === 'workspace-route') overrides['@/components/TeamWorkspaceView'] = props => React.createElement('p', null, 'Private workspace:' + props.team.id);
  const timers = new Set();
  const h = harness(overrides, { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    setTimeout: (callback, delay) => { const timer = setTimeout(callback, delay); timers.add(timer); return timer; }, clearTimeout,
    ...options.globals,
    requestAnimationFrame: callback => callback(), console: { log() {}, warn() {}, error: (...args) => state.errors.push(args) } });
  const Component = h.load(kind === 'chat' ? 'src/components/chatThread.tsx' : kind === 'workspace' ? 'src/components/TeamWorkspaceView.tsx' :
    kind === 'workspace-route' ? 'src/app/teams/[id]/workspace/page.tsx' : 'src/app/messages/page.tsx').default;
  const root = require('react-dom/client').createRoot(dom.window.document.getElementById('root'));
  let props = kind === 'chat' ? { conversationId: 'one', currentUserId: 'me' } : kind === 'workspace' ? {
    team: { id: 'team-one', name: 'Fixture team', owner_id: 'me', skills: [], roles_needed: [] },
    members: [{ id: 'member-one', profiles: { id: 'me', full_name: 'me', email: 'me@example.invalid' } }], isOwner: true, initialTab: 'tasks',
  } : {};
  const flush = fn => React.act(async () => { fn?.(); for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); });
  const render = patch => flush(() => { props = { ...props, ...patch }; state.elements = []; root.render(React.createElement(Component, props)); });
  t.after(async () => { await React.act(() => root.unmount()); timers.forEach(clearTimeout); dom.window.close(); for (const [key, descriptor] of prior) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  } });
  await render();
  return { state, db, render, flush, dom, text: () => dom.window.document.body.textContent,
    element: predicate => state.elements.filter(predicate).at(-1)?.props,
    input: () => state.elements.filter(e => e.type === 'textarea' && e.props['aria-label'] === 'Message').at(-1)?.props,
  };
}
module.exports = { mount, message, task, deferred };
