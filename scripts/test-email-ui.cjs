/* eslint-disable @typescript-eslint/no-require-imports -- Actual React lifecycle with synthetic responses and no network. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');

async function contact(t, response) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/contact' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const old = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key], configurable: true });
  const { createRoot } = require('react-dom/client'); const root = createRoot(dom.window.document.getElementById('root'));
  t.after(async () => { await React.act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of old) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  } });
  const calls = [], toasts = [];
  const wrapper = tag => ({ children, ...props }) => React.createElement(tag, props, children);
  const h = harness({
    '@/lib/supabase': { supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } },
    '@/context/NotificationContext': { useNotification: () => ({ showToast: (...args) => toasts.push(args) }) },
    '@/components/system': { Button: wrapper('button'), FieldLabel: wrapper('label'), Input: wrapper('input'), Textarea: wrapper('textarea') },
    '@/components/landing/primitives': { Container: wrapper('div'), Eyebrow: wrapper('p'), Lede: wrapper('p') },
    'next/link': ({ href, children }) => React.createElement('a', { href }, children),
  }, { window: dom.window, document: dom.window.document, fetch: async (url, config) => {
    assert.equal(url, '/api/contact'); calls.push(JSON.parse(config.body));
    if (response instanceof Error) throw response; return response;
  } });
  await React.act(async () => root.render(React.createElement(h.load('src/app/contact/page.tsx').default)));
  const props = node => node[Object.keys(node).find(key => key.startsWith('__reactProps$'))];
  for (const [id, value] of Object.entries({ name: 'Fixture', email: 'fixture@example.invalid', subject: 'Synthetic', message: 'A protected synthetic inquiry draft.' })) {
    await React.act(async () => props(dom.window.document.getElementById(`contact-${id}`)).onChange({ target: { value } }));
  }
  await React.act(async () => props(dom.window.document.querySelector('form')).onSubmit({ preventDefault() {} }));
  return { calls, toasts, dom, text: () => dom.window.document.body.textContent };
}
for (const [label, response] of [
  ['configuration unavailable', Response.json({ success: false, error: 'No provider configured.' }, { status: 503 })],
  ['sandbox accepted over HTTP 200', Response.json({ success: false, dispatch: { status: 'accepted', sandbox: true }, error: 'Sandbox only; intended contact not confirmed.' })],
  ['unknown provider outcome', Response.json({ success: false, error: 'Check provider records before resending.' }, { status: 502 })],
  ['network interruption', new Error('Synthetic network loss')],
]) test(`contact UI preserves draft instead of claiming success: ${label}`, async t => {
  const ui = await contact(t, response);
  assert.equal(ui.calls.length, 1); assert.equal(ui.toasts.at(-1)[1], 'error');
  assert.equal(ui.dom.window.document.getElementById('contact-message').value, 'A protected synthetic inquiry draft.');
  assert(!ui.text().includes('Inquiry Submitted'));
});
test('contact UI shows provider acceptance without claiming delivery', async t => {
  const ui = await contact(t, Response.json({ success: true, message: 'Provider accepted the email; delivery is not confirmed.' }));
  assert.equal(ui.calls.length, 1); assert.equal(ui.toasts.at(-1)[1], 'success'); assert.match(ui.text(), /Inquiry Submitted/);
  assert.match(ui.text(), /delivery is not confirmed/); assert(!ui.text().includes('Message Sent!'));
});
