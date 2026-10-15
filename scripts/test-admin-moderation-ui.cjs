/* eslint-disable @typescript-eslint/no-require-imports -- Real React UI with isolated services. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const ACTOR = '00000000-0000-4000-8000-000000000001';
const TARGET = '00000000-0000-4000-8000-000000000002';
const reply = (data, status = 200) => Response.json(data, { status });
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }

async function view(t, reportsOnly = false) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const descriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true });
  const { createRoot } = require('react-dom/client'); const root = createRoot(dom.window.document.getElementById('root'));
  t.after(async () => { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, value] of descriptors) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; } });
  const state = { calls: [], toasts: [], prompts: [], responses: [], reads: 0, refreshes: 0, dismisses: 0 };
  const user = (id, role = 'user', email = 'builder@example.invalid') => ({ id, role, email, full_name: id === TARGET ? 'Fixture target' : 'Protected account', is_banned: false, onboarding_completed: true, created_at: '2026-01-01' });
  const report = { id: 'fixture-report', reporter_id: ACTOR, reported_id: TARGET, reportedName: 'Fixture target', reporterName: 'Fixture reporter', reason: 'spam', details: 'Fixture report', created_at: '2026-01-01' };
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: ACTOR, email: 'operator@example.invalid' } } }), getSession: async () => ({ data: { session: null } }) }, from(table) {
    const query = { select() { return query; }, eq() { return query; }, single: async () => ({ data: { role: 'admin' } }), delete() { assert.equal(table, 'user_reports'); state.dismisses++; return query; }, then: yes => yes({ error: null }) }; return query;
  } };
  const overrides = { '@/lib/supabase': { supabase }, '@/components/AuthGuard': ({ children }) => children,
    'next/link': ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children),
    '@/context/NotificationContext': { useNotification: () => ({ showToast: (...args) => state.toasts.push(args), confirm: config => state.prompts.push(config) }) },
    '@/components/PartnerCompositionModal': () => null };
  for (const tab of ['DeletedLogsTab', 'TeamsTab', 'BadgesTab', 'NativeHackathonsTab', 'OutreachTab', 'PartneringTab']) overrides[`./_tabs/${tab}`] = () => null;
  const loader = harness(overrides, { window: dom.window, document: dom.window.document, Error,
    fetch: async (url, config = {}) => {
      if (config.method === 'POST') { state.calls.push({ url, body: JSON.parse(config.body) }); assert(state.responses.length, 'Unplanned mutation'); const next = state.responses.shift(); if (next instanceof Error) throw next; return next; }
      if (url === '/api/admin/dashboard-data') { state.reads++; return reply({ success: true, users: [user(TARGET), user(ACTOR, 'admin'), user('00000000-0000-4000-8000-000000000003', 'admin'), user('00000000-0000-4000-8000-000000000004', 'user', 'yashshah7117@gmail.com')], teams: [], reports: [report] }); }
      if (url === '/api/admin/email-analytics') return reply({ success: false });
      if (url === '/api/admin/hackathons') return reply({ success: true, hackathons: [] });
      if (url === '/api/admin/deleted-users-log') return reply({ success: true, logs: [] });
      throw Error(`Unexpected local fixture request ${url}`);
    } });
  const Component = loader.load(reportsOnly ? 'src/app/admin/_tabs/ReportsTab.tsx' : 'src/app/admin/page.tsx').default;
  await React.act(async () => root.render(React.createElement(Component, reportsOnly ? { reports: [report], currentUserId: ACTOR, onRefresh: async () => { state.refreshes++; }, onToggleBan() {} } : {})));
  const button = label => [...dom.window.document.querySelectorAll('button')].find(item => { const text = item.textContent.replace(/\s+/g, ' ').trim(); return text === label || (label === 'Users' && /^Users\s*\d+$/.test(text)); });
  const click = async label => { const control = button(label); assert(control, `Missing ${label}; rendered: ${dom.window.document.body.textContent}`); assert(!control.disabled, `${label} disabled`); await React.act(async () => control.click()); };
  const setWarning = async value => {
    const input = dom.window.document.querySelector('textarea'); assert(input);
    // Invoke React's actual onChange prop, then execute effects/render with act.
    const props = input[Object.keys(input).find(key => key.startsWith('__reactProps$'))];
    await React.act(async () => props.onChange({ target: { value } }));
  };
  return { state, button, click, setWarning, dom, settle: async callback => React.act(async () => { await callback?.(); await new Promise(resolve => setImmediate(resolve)); }) };
}

test('Users UI disables role changes and protected moderation targets', async t => {
  const ui = await view(t); await ui.click('Users');
  assert.match(ui.dom.window.document.body.textContent, /founder approves an administrator/);
  const buttons = [...ui.dom.window.document.querySelectorAll('button')];
  assert(buttons.filter(node => /^(Promote|Demote)$/.test(node.textContent.trim())).every(node => node.disabled));
  assert.equal(buttons.filter(node => node.textContent.trim() === 'Suspend' && !node.disabled).length, 1);
  assert.equal(buttons.filter(node => node.textContent.trim() === 'Warn' && !node.disabled).length, 1);
  assert.equal(ui.state.calls.length, 0);
});

for (const response of [reply({ success: true, userId: TARGET, is_banned: true, changed: true }), reply({ success: true, userId: TARGET, is_banned: true, changed: false }), reply({ success: false, error: 'Account changed. Refresh.' }, 409), reply({ success: true }), new Error('offline')]) {
  test('Users ban confirmation validates result, prevents duplicate sends and refreshes only verified outcomes', async t => {
    const ui = await view(t); await ui.click('Users'); await ui.click('Suspend');
    assert.equal(ui.state.calls.length, 0); assert.match(ui.state.prompts[0].message, /does not revoke active sessions/);
    const pending = deferred(); ui.state.responses.push(pending.promise); let action;
    await ui.settle(() => { action = ui.state.prompts[0].onConfirm(); });
    await ui.settle(() => ui.state.prompts[0].onConfirm()); assert.equal(ui.state.calls.length, 1); assert(ui.button('Suspend').disabled);
    const readsBefore = ui.state.reads;
    await ui.settle(() => { pending.resolve(response instanceof Error ? Promise.reject(response) : response); return action; });
    const toast = ui.state.toasts.at(-1); const verified = response instanceof Response && response.status === 200 && ui.state.reads > readsBefore;
    assert.equal(verified, toast[1] !== 'error');
    assert(!ui.button('Suspend').disabled); assert.equal(ui.state.calls[0].url, '/api/admin/ban-user');
  });
}

for (const reportsOnly of [false, true]) {
  for (const [label, response, accepted] of [
    ['accepted', reply({ success: true, status: 'accepted' }), true],
    ['provider failure', reply({ error: 'Provider did not confirm acceptance.' }, 502), false],
    ['mock', reply({ success: true, status: 'accepted', mock: true }), false],
    ['sandbox', reply({ success: true, status: 'accepted', sandbox: true }), false],
    ['incomplete success', reply({ success: true }), false],
    ['transport failure', new Error('offline'), false],
  ]) test(`${reportsOnly ? 'Reports' : 'Users'} warning ${label} has accurate status and no duplicate requests`, async t => {
    const ui = await view(t, reportsOnly); if (!reportsOnly) await ui.click('Users');
    await ui.click(reportsOnly ? 'Warn User' : 'Warn'); await ui.setWarning('Fixture warning');
    const label = reportsOnly ? 'Send Warning' : 'Send Official Warning Email';
    const control = ui.button(label); assert(control); const props = control[Object.keys(control).find(key => key.startsWith('__reactProps$'))];
    const pending = deferred(); ui.state.responses.push(pending.promise); let action;
    await ui.settle(() => { action = props.onClick(); });
    await ui.settle(() => props.onClick()); assert.equal(ui.state.calls.length, 1);
    await ui.settle(() => { pending.resolve(response instanceof Error ? Promise.reject(response) : response); return action; });
    const toast = ui.state.toasts.at(-1); assert.equal(toast[1], accepted ? 'success' : 'error');
    if (accepted) assert.match(toast[0], /accepted.*Delivery is not confirmed/); else assert(ui.dom.window.document.querySelector('textarea'));
    assert.equal(ui.state.calls[0].url, '/api/send-email'); assert.equal(ui.state.calls[0].body.type, 'moderation_warning');
    assert.equal(reportsOnly ? ui.state.refreshes : ui.state.reads - 1, accepted ? 1 : 0);
  });
}

test('Reports dismissal keeps its existing confirmation, database action and refresh', async t => {
  const ui = await view(t, true); await ui.click('Dismiss Report'); assert.equal(ui.state.dismisses, 0);
  await ui.settle(() => ui.state.prompts[0].onConfirm()); assert.equal(ui.state.dismisses, 1); assert.equal(ui.state.refreshes, 1);
});
