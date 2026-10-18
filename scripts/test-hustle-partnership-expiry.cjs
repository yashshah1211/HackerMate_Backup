/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic clock and real React SSR/hydration regression tests. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToString } = require('react-dom/server');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const expiry = Date.parse('2026-10-25T00:00:00+05:30');

function fixture() {
  const clock = { now: expiry - 1, timers: new Map(), id: 0 };
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/dashboard' });
  const Component = harness({
    './HustlePartnershipBanner.module.css': {},
    'next/link': ({ children, prefetch, ...props }) => { void prefetch; return React.createElement('a', props, children); },
  }, {
    Date: class extends Date { static now() { return clock.now; } },
    window: dom.window, document: dom.window.document,
    setTimeout: (callback, delay) => { const id = ++clock.id; clock.timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => clock.timers.delete(id),
  }).load('src/components/partners/HustlePartnershipBanner.tsx').default;
  return { clock, dom, Component, element: React.createElement(Component) };
}

async function hydrate(t, f, markup = renderToString(f.element)) {
  const globals = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const prior = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : f.dom.window[key] });
  const container = f.dom.window.document.getElementById('root');
  container.innerHTML = markup;
  const errors = [];
  let root;
  t.after(async () => {
    if (root) await React.act(async () => root.unmount());
    assert.equal(f.clock.timers.size, 0, 'Expiry timers cleaned up');
    assert.deepEqual(errors, [], 'No hydration errors');
    f.dom.window.close();
    for (const [key, value] of prior) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  });
  await React.act(async () => {
    root = require('react-dom/client').hydrateRoot(container, f.element, { onRecoverableError: error => errors.push(error.message) });
  });
  return container;
}

test('SSR stays hidden before, exactly at and after midnight IST, independent of server time', () => {
  const f = fixture();
  try {
    for (const now of [expiry - 1, expiry, expiry + 1]) {
      f.clock.now = now;
      assert.equal(renderToString(f.element), '');
    }
    assert.equal(new Date(expiry).toISOString(), '2026-10-24T18:30:00.000Z');
  } finally { f.dom.window.close(); }
});

test('banner appears after hydration one millisecond before expiry', async t => {
  const f = fixture();
  const container = await hydrate(t, f);
  assert.match(container.textContent, /Hustle Carnival/);
  assert.equal(container.querySelectorAll('a').length, 2);
  assert.equal([...f.clock.timers.values()][0].delay, 1);
});

test('banner stays absent when hydration crosses the expiry boundary', async t => {
  const f = fixture();
  const markup = renderToString(f.element);
  f.clock.now = expiry;
  const container = await hydrate(t, f, markup);
  assert.equal(container.innerHTML, '');
  assert.equal(f.clock.timers.size, 0);
});

test('banner stays absent on a visit after expiry', async t => {
  const f = fixture();
  f.clock.now = expiry + 1;
  const container = await hydrate(t, f);
  assert.equal(container.innerHTML, '');
  assert.equal(f.clock.timers.size, 0);
});

test('an already-open dashboard removes the banner at the exact boundary without navigation', async t => {
  const f = fixture();
  const container = await hydrate(t, f);
  assert.ok(container.querySelector('section'));
  f.clock.now = expiry;
  await React.act(async () => { [...f.clock.timers.values()][0].callback(); });
  assert.equal(container.innerHTML, '');
  assert.equal(f.clock.timers.size, 0);
});

test('a resumed background tab rechecks expiry even if its timer was suspended', async t => {
  const f = fixture();
  const container = await hydrate(t, f);
  f.clock.now = expiry + 60_000;
  await React.act(async () => f.dom.window.document.dispatchEvent(new f.dom.window.Event('visibilitychange')));
  assert.equal(container.innerHTML, '');
  assert.equal(f.clock.timers.size, 0);
});
