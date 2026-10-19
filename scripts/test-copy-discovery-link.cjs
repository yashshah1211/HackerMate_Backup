/* eslint-disable @typescript-eslint/no-require-imports -- Offline link contract and real component clipboard tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { JSDOM } = require('jsdom');
const { harness } = require('./ppt-vision-harness.cjs');
const loader = harness({}, { URLSearchParams });
const { publicDiscoveryLink } = loader.load('src/lib/hackathons/shareDiscovery.ts');
const { readDiscoverySettings, discoverEvents } = loader.load('src/lib/hackathons/discovery.ts');
const link = query => publicDiscoveryLink(new URLSearchParams(query));
const params = result => new URL(result.url).searchParams;

test('fixed HTTPS origin/path, no authentication/context/hash or arbitrary parameters', () => {
  const result = link('tab=upcoming&q=climate&source=college&utm_source=wa&email=private@example.test&token=secret&next=https://evil.test&redirect=/admin&page=3');
  const url = new URL(result.url);
  assert.equal(url.origin, 'https://www.hackermate.in'); assert.equal(url.pathname, '/hackathons'); assert.equal(url.hash, '');
  assert.deepEqual([...url.searchParams.keys()], ['tab', 'q']);
  assert(!/secret|private|college|evil|admin/.test(result.url));
});
test('all meaningful public selections survive the existing validation/serialization contract', () => {
  const query = 'tab=upcoming&q=water+energy&mode=hybrid&platform=devfolio&topic=climate&from=2026-11-01&to=2026-12-01&participation=team&registration=not-closed&sort=prize-usd';
  assert.equal(JSON.stringify(readDiscoverySettings(params(link(query)))), JSON.stringify(readDiscoverySettings(new URLSearchParams(query))));
});
for (const query of ['q=AI%2FML+%26+C%2B%2B+%23campus', 'q=%E0%A4%B9%E0%A4%BF%E0%A4%82%E0%A4%A6%E0%A5%80+%F0%9F%9A%80', 'q=%3Cscript%3E%26%22%27%25', 'q=water+']) {
  test(`encoded search round-trips without changing its text: ${query}`, () => {
    assert.equal(params(link(query)).get('q'), new URLSearchParams(query).get('q'));
  });
}
test('search limit and exact topic normalization reuse existing behavior', () => {
  const p = params(link('q=' + 'a'.repeat(220) + '&topic=%20AI%2FML%20'));
  assert.equal(p.get('q').length, 200); assert.equal(p.get('topic'), 'ai/ml');
});
test('duplicate supported keys and invalid values are not transported', () => {
  const p = params(link('tab=past&tab=saved&q=first&q=second&mode=online&mode=hybrid&platform=bad&from=2026-02-30&to=nope&sort=bad&participation=bad&registration=bad&topic=a&topic=b'));
  assert.deepEqual([...p.entries()], [['sort', 'date']]);
});
test('empty view becomes explicit non-personal date order; default public settings stay compact', () => {
  assert.equal(link('').url, 'https://www.hackermate.in/hackathons?sort=date');
  assert.equal(link('tab=upcoming&sort=date').url, 'https://www.hackermate.in/hackathons?tab=upcoming');
  assert.equal(link('sort=prize').url, 'https://www.hackermate.in/hackathons?sort=prize-inr');
});
for (const tab of ['recommended', 'upcoming', 'ongoing', 'past', 'saved']) {
  test(`relevance order is never presented as portable: ${tab}`, () => {
    const result = link(`tab=${tab}&sort=relevant&q=React&mode=online`);
    assert.equal(readDiscoverySettings(params(result)).sort, 'date');
    assert.equal(readDiscoverySettings(params(result)).tab, tab === 'saved' ? 'recommended' : tab);
    assert.match(result.explanation, /date order/);
  });
}
test('Saved converts explicitly to public discovery and preserves a non-personal sort and filters', () => {
  const result = link('tab=saved&sort=recent&topic=climate&mode=hybrid');
  assert.equal(readDiscoverySettings(params(result)).tab, 'recommended');
  assert.equal(params(result).get('sort'), 'recent'); assert.equal(params(result).get('topic'), 'climate');
  assert.match(result.explanation, /not your saved list/); assert(!result.url.includes('saved'));
});
test('reversed valid dates cannot produce a misleading shareable view', () => {
  const result = link('from=2026-12-01&to=2026-11-01');
  assert.equal(result.url, null); assert.match(result.explanation, /Fix the date range/);
});
test('helper never mutates the current URL or params', () => {
  const p = new URLSearchParams('tab=saved&q=AI%2FML&source=private'); const snapshot = p.toString();
  publicDiscoveryLink(p); assert.equal(p.toString(), snapshot);
});
test('non-personal public views preserve result membership/order after a fresh guest restore', () => {
  const event = (id, extra = {}) => ({ id, name: 'AI/ML campus', description: 'Build tools', tags: ['AI/ML'], start_date: '2028-01-01', end_date: '2028-01-03',
    mode: 'online', website_url: 'https://devfolio.co/fixture', type: 'external', ...extra });
  const events = [event('b'), event('a'), event('other', { tags: ['Climate'] })];
  const query = 'tab=upcoming&topic=ai%2Fml&mode=online&sort=date';
  const source = readDiscoverySettings(new URLSearchParams(query)), restored = readDiscoverySettings(params(link(query)));
  const ids = settings => Array.from(discoverEvents(events, settings, [], new Set(), Date.parse('2026-10-19T12:00:00Z')), row => row.id);
  assert.deepEqual(ids(restored), ['a', 'b']); assert.deepEqual(ids(source), ids(restored));
});

async function mounted(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid/hackathons' });
  const keys = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const prior = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  Object.defineProperty(dom.window, 'isSecureContext', { value: options.secure !== false, configurable: true });
  const calls = [], toasts = [];
  if (!options.unsupported) Object.defineProperty(dom.window.navigator, 'clipboard', { configurable: true, value: { writeText(value) {
    calls.push(value); return options.write ? options.write(value) : Promise.resolve();
  } } });
  const widgets = { ...harness().load('src/components/system/Button.tsx'), ...harness().load('src/components/system/Field.tsx') };
  const { CopyDiscoveryLink } = harness({ '@/components/system': widgets, '@/context/NotificationContext': { useNotification: () => ({ showToast: (message, type) => toasts.push({ message, type }) }) } },
    { URLSearchParams, window: dom.window, navigator: dom.window.navigator }).load('src/components/hackathons/CopyDiscoveryLink.tsx');
  const root = require('react-dom/client').createRoot(dom.window.document.getElementById('root'));
  t.after(async () => { await React.act(() => root.unmount()); dom.window.close(); for (const [key, descriptor] of prior) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  } });
  const render = async query => React.act(async () => root.render(React.createElement(CopyDiscoveryLink, { searchParams: new URLSearchParams(query) })));
  await render(options.query || 'topic=ai%2Fml&source=private');
  return { dom, calls, toasts, render, button: () => dom.window.document.querySelector('button'),
    click: () => React.act(async () => dom.window.document.querySelector('button').click()), input: () => dom.window.document.querySelector('input') };
}
test('accessible action describes public conversion before copying, then reports only actual success', async t => {
  const v = await mounted(t, { query: 'tab=saved&sort=relevant&q=AI%2FML' });
  assert.equal(v.button().textContent, 'Copy link'); assert.equal(v.button().getAttribute('aria-label'), 'Copy link to filtered hackathons');
  assert.match(v.dom.window.document.getElementById(v.button().getAttribute('aria-describedby')).textContent, /not your saved list/);
  assert.deepEqual(v.toasts, []); await v.click(); assert.equal(v.calls.length, 1); assert.equal(v.toasts[0].type, 'success');
  assert.equal(v.calls[0], 'https://www.hackermate.in/hackathons?q=AI%2FML&sort=date'); assert.equal(v.input(), null);
});
for (const failure of ['denied', 'synchronous', 'unsupported', 'insecure']) test(`clipboard ${failure} gives error and selectable clean manual link, never success`, async t => {
  const v = await mounted(t, { unsupported: failure === 'unsupported', secure: failure !== 'insecure',
    write: failure === 'denied' ? () => Promise.reject(new Error('NotAllowedError')) : failure === 'synchronous' ? () => { throw Error('restricted'); } : undefined });
  await v.click(); assert.deepEqual(v.toasts.map(toast => toast.type), ['error']);
  assert.equal(v.calls.length, failure === 'unsupported' || failure === 'insecure' ? 0 : 1);
  assert.equal(v.input().value, 'https://www.hackermate.in/hackathons?topic=ai%2Fml&sort=date'); assert(v.input().readOnly);
  await React.act(() => v.input().focus()); assert.equal(v.input().selectionStart, 0); assert.equal(v.input().selectionEnd, v.input().value.length);
  await v.render('q=different&source=private'); assert.equal(v.input(), null, 'Old manual link must not remain after filters change');
});
test('pending clipboard promise cannot report success early or submit twice', async t => {
  let finish; const pending = new Promise(resolve => { finish = resolve; }); const v = await mounted(t, { write: () => pending });
  await v.click(); assert.equal(v.button().disabled, true); assert.equal(v.button().getAttribute('aria-busy'), 'true'); assert.deepEqual(v.toasts, []);
  await v.click(); assert.equal(v.calls.length, 1);
  await React.act(async () => finish()); assert.equal(v.toasts[0].type, 'success'); assert.equal(v.button().disabled, false);
});
test('reversed date range disables copying with a screen-reader explanation', async t => {
  const v = await mounted(t, { query: 'from=2026-12-01&to=2026-11-01' });
  assert(v.button().disabled); assert.match(v.dom.window.document.body.textContent, /Fix the date range/); await v.click(); assert.deepEqual(v.calls, []);
});
test('retry success removes manual fallback and uses updated selections', async t => {
  let denied = true; const v = await mounted(t, { write: () => denied ? Promise.reject(Error('denied')) : Promise.resolve() });
  await v.click(); assert(v.input()); denied = false; await v.click(); assert.equal(v.input(), null); assert.deepEqual(v.toasts.map(toast => toast.type), ['error', 'success']);
});
