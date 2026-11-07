/* eslint-disable @typescript-eslint/no-require-imports -- Actual React admin tab; local responses and no live services. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const { EVENT } = require('./admin-hackathon-harness.cjs');

async function view(t, reply) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/admin' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const descriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true });
  const { createRoot } = require('react-dom/client'); const root = createRoot(dom.window.document.getElementById('root'));
  t.after(async () => { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const state = { requests: [], prompts: [], toasts: [], refreshes: 0 };
  const h = harness({ '@/context/NotificationContext': { useNotification: () => ({ confirm: prompt => state.prompts.push(prompt), showToast: (...args) => state.toasts.push(args) }) } }, {
    fetch: async (url, init) => { assert.equal(url, '/api/admin/hackathons'); state.requests.push(JSON.parse(init.body)); if (reply instanceof Error) throw reply; return reply; },
  });
  const Tab = h.load('src/app/admin/_tabs/NativeHackathonsTab.tsx').default;
  await React.act(async () => root.render(React.createElement(Tab, { nativeHackathons: [{ id: EVENT, name: 'Synthetic event', status: 'pending', created_at: '2026-01-01' }], onRefresh: async () => { state.refreshes++; } })));
  const click = async label => { const button = [...dom.window.document.querySelectorAll('button')].find(node => node.textContent.trim() === label); assert(button, label); await React.act(async () => button.click()); };
  const confirm = async () => React.act(async () => { await state.prompts[0].onConfirm(); await new Promise(resolve => setImmediate(resolve)); });
  return { state, click, confirm };
}

for (const [name, reply, success] of [
  ['deleted', Response.json({ success: true, message: 'Hackathon deleted; teams preserved.' }), true],
  ['missing', Response.json({ error: 'Hackathon not found.' }, { status: 404 }), false],
  ['restricted', Response.json({ error: 'Protected related data blocks deletion.' }, { status: 409 }), false],
  ['database error', Response.json({ error: 'Unable to confirm deletion.' }, { status: 500 }), false],
  ['incomplete receipt', Response.json({}), false],
  ['non-JSON', new Response('Synthetic HTML error', { status: 500 }), false],
  ['transport failure', Error('Synthetic network failure') , false],
]) test(`permanent-delete confirmation and ${name} feedback remain truthful`, async t => {
  const ui = await view(t, reply); await ui.click('Delete');
  assert.equal(ui.state.requests.length, 0, 'No mutation before explicit confirmation');
  const prompt = ui.state.prompts[0]; assert.equal(prompt.title, 'PERMANENTLY DELETE HACKATHON'); assert.equal(prompt.confirmText, 'Delete Permanently');
  assert.match(prompt.message, /cannot be undone/); assert.match(prompt.message, /Teams and user accounts are preserved/);
  assert.match(prompt.message, /registrations, team associations/); assert(!prompt.message.includes('remove all associated teams'));
  await ui.confirm(); assert.deepEqual(ui.state.requests, [{ hackathonId: EVENT, action: 'delete' }]);
  assert.equal(ui.state.toasts.at(-1)[1], success ? 'success' : 'error'); assert.equal(ui.state.refreshes, success ? 1 : 0);
});
for (const [label, action] of [['Approve', 'approve'], ['Reject', 'reject']]) test(`${label} remains an immediate explicit admin action`, async t => {
  const ui = await view(t, Response.json({ success: true, message: 'Reviewed.' })); await ui.click(label);
  assert.equal(ui.state.prompts.length, 0); assert.deepEqual(ui.state.requests, [{ hackathonId: EVENT, action }]);
  assert.equal(ui.state.toasts.at(-1)[1], 'success'); assert.equal(ui.state.refreshes, 1);
});
