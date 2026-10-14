/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-page discovery tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const jsxRuntime = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness } = require('./ppt-vision-harness.cjs');
const NOW = Date.parse('2026-10-14T12:00:00Z'), USER = 'offline-user';
const event = (id, extra = {}) => ({ id, name: `Event ${id}`, description: '<p>Build clean tools</p>', tags: ['Coding', 'Hackathon'],
  start_date: '2026-10-20', end_date: '2026-10-22', location: 'Venue in India', mode: 'offline', prize_pool: 'Certificate & Perks',
  currency: null, website_url: 'https://unstop.com/event', type: 'external', organizer_id: null, ...extra });
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node);
async function page(options = {}) {
  let cursor = 0, html, clock = NOW, tick; const slots = [], effects = [], dependencies = [], controls = [], writes = [], toasts = [], reads = [];
  let saved = new Set(options.saved || []), user = { id: USER };
  const events = options.events || [event('future'), event('ongoing', { start_date: '2026-10-12' }), event('past', { start_date: '2026-10-10', end_date: '2026-10-13' }), event('unknown', { start_date: 'invalid', end_date: null })];
  const location = { pathname: '/hackathons', search: options.query ? `?${options.query}` : '', hash: '#discovery' };
  const hooks = { ...React, useMemo: fn => fn(),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useEffect(fn, deps) { const i = cursor++; if (!dependencies[i] || deps.some((v, j) => v !== dependencies[i][j])) { dependencies[i] = deps; effects.push(fn); } },
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const client = { auth: { getUser: async () => ({ data: { user } }) }, from(table) {
    assert(['hackathons', 'saved_hackathons', 'profiles'].includes(table));
    const filters = []; let operation = 'read', payload;
    const result = () => {
      if (operation === 'read') reads.push(table);
      if (operation !== 'read') {
        assert.equal(table, 'saved_hackathons'); writes.push({ operation, payload, filters });
        if (options.saveError) return { data: null, error: { message: 'Offline denied' } };
        if (operation === 'insert') { assert.equal(payload.user_id, USER); saved.add(payload.hackathon_id); }
        else { assert(filters.some(([key, value]) => key === 'user_id' && value === USER)); saved.delete(filters.find(([key]) => key === 'hackathon_id')[1]); }
        return { error: null };
      }
      if (table === 'hackathons') { assert(filters.some(([key, value]) => key === 'archived' && value === false)); return { data: events, error: null }; }
      assert(filters.some(([key, value]) => (key === 'user_id' || key === 'id') && value === USER));
      return { data: table === 'profiles' ? { skills: options.skills || [] } : [...saved].map(hackathon_id => ({ hackathon_id })), error: null };
    };
    const query = { select() { return this; }, order() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
      insert(value) { operation = 'insert'; payload = value; return this; }, delete() { operation = 'delete'; return this; },
      single: async () => result(), then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject) };
    return query;
  } };
  const system = new Proxy({}, { get: (_, name) => name === '__esModule' ? false : props => {
    controls.push({ name, ...props, text: text(props.children) });
    if (name === 'Sheet' && !props.open) return null;
    if (name === 'PageHeader') return React.createElement('header', null, props.title, props.meta, props.actions);
    if (name === 'EmptyState') return React.createElement('section', null, props.title, props.body, props.action);
    if (name === 'SearchField') return React.createElement('input', { 'aria-label': props.label, value: props.value, readOnly: true });
    return React.createElement(name === 'Select' ? 'select' : name === 'ButtonLink' ? 'a' : 'div', { href: props.href }, props.children, props.title, props.footer);
  } });
  const record = (type, props) => { if (type === 'button' || type === 'input' || type === 'select') controls.push({ name: type, ...props, text: text(props.children) }); };
  const Page = harness({ react: hooks, 'react/jsx-runtime': { ...jsxRuntime,
    jsx(type, props, key) { record(type, props); return jsxRuntime.jsx(type, props, key); },
    jsxs(type, props, key) { record(type, props); return jsxRuntime.jsxs(type, props, key); },
  }, 'next/navigation': { useSearchParams: () => new URLSearchParams(location.search) },
    'next/link': props => React.createElement('a', { href: props.href }, props.children),
    '@/components/AuthGuard': props => props.children, '@/components/Logo': { LogoMark: () => null },
    '@/components/system': system, '@/lib/supabase': { supabase: client },
    '@/context/NotificationContext': { useNotification: () => ({ showToast: (message, type) => toasts.push({ message, type }) }) },
  }, { URLSearchParams, Date: Clock, setInterval(fn) { tick = fn; return 1; }, clearInterval() {}, window: { location,
    history: { replaceState(_state, _title, path) { const url = new URL(path, 'https://offline.example'); Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash }); } },
  } }).load('src/app/hackathons/page.tsx').default;
  const render = () => { cursor = 0; controls.length = 0; html = renderToStaticMarkup(React.createElement(Page)); };
  const control = predicate => { const found = controls.find(predicate); assert(found, 'Control missing'); return found; };
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render(); for (const effect of effects.splice(0)) effect(); await settle();
  return { writes, toasts, reads, location, get html() { return html; },
    ids: () => [...html.matchAll(/href="\/hackathons\/([^"/]+)"/g)].map(match => match[1]).filter(id => id !== 'create'),
    async click(label) { const button = control(c => ['button', 'Button'].includes(c.name) && c.text.startsWith(label)); await button.onClick(); await settle(); },
    async search(value) { control(c => c.name === 'SearchField').onChange(value); await settle(); },
    async choose(id, value) { control(c => c.id === id).onChange({ target: { value } }); await settle(); },
    async save(id, isSaved) { const button = controls.filter(c => c.name === 'IconButton')[this.ids().indexOf(id)]; assert(button); assert.equal(button['aria-pressed'], isSaved);
      await button.onClick({ preventDefault() {}, stopPropagation() {} }); await settle(); },
    async navigate(query) { location.search = `?${query}`; await settle(); },
    async advance(time) { clock = time; tick(); await settle(); }, signOut() { user = null; },
  };
}
test('real For you page includes empty-profile and generic-tag events with honest date/location/prize labels', async () => {
  const view = await page(); assert.deepEqual(view.ids(), ['future', 'ongoing', 'unknown']);
  assert.match(view.html, /Ongoing/); assert.match(view.html, /Dates unclear/); assert.match(view.html, /Location not specified/);
  assert(!view.html.includes('Venue in India')); assert(!view.html.includes('₹0'));
  assert.match(view.html, /Registration deadline not listed/); assert.match(view.html, /specific topic tags not listed/);
});
test('URL settings and tab changes preserve other context, Saved expectations and event navigation', async () => {
  const view = await page({ query: 'tab=saved&source=partner', saved: ['past', 'unknown'] });
  assert.deepEqual(view.ids(), ['past', 'unknown']); await view.click('Ongoing'); assert.deepEqual(view.ids(), ['ongoing']);
  assert.equal(new URLSearchParams(view.location.search).get('source'), 'partner'); assert.equal(view.location.hash, '#discovery');
  await view.navigate('tab=upcoming'); assert.deepEqual(view.ids(), ['future']);
  assert.match(view.html, /href="\/hackathons\/future"/); assert.match(view.html, /href="\/hackathons\/create"/);
});
test('combined desktop filters have correct counts, empty-state guidance and reset all controls', async () => {
  const view = await page({ query: 'source=partner', events: [event('match', { tags: ['React'], mode: 'hybrid', min_team_size: 1, max_team_size: 4 }), event('other')] });
  await view.choose('hk-topic-desktop', 'react'); await view.choose('hk-size-desktop', 'solo'); await view.search('match');
  assert.deepEqual(view.ids(), ['match']); assert.match(view.html, /3 active settings/);
  await view.choose('hk-from-desktop', '2026-10-21'); assert.deepEqual(view.ids(), []); assert.match(view.html, /No events match these settings/);
  await view.click('Clear filters'); assert.deepEqual(view.ids(), ['match', 'other']); assert(!view.html.includes('active settings'));
  assert.equal(new URLSearchParams(view.location.search).get('source'), 'partner');
});
test('mobile sheet offers the same filters and reset clears the search too', async () => {
  const view = await page(); await view.search('future'); await view.click('1'); // Filters button carries active count.
  await view.choose('hk-topic-mobile', 'react'); assert.deepEqual(view.ids(), []);
  await view.click('Reset'); assert.equal(new URLSearchParams(view.location.search).has('q'), false); assert.deepEqual(view.ids(), ['future', 'ongoing', 'unknown']);
});
test('save/unsave still uses the existing user-scoped workflow and updates Saved immediately', async () => {
  const view = await page(); await view.save('future', false); assert.equal(view.writes[0].operation, 'insert');
  await view.click('Saved'); assert.deepEqual(view.ids(), ['future']); await view.save('future', true); assert.deepEqual(view.ids(), []);
  assert.equal(view.writes[1].operation, 'delete'); assert.match(view.html, /haven&#x27;t saved/);
});
test('save failure and signed-out save never invent a successful bookmark', async () => {
  const view = await page({ saveError: true }); await view.save('future', false); assert.equal(view.toasts.at(-1).type, 'error');
  await view.click('Saved'); assert.deepEqual(view.ids(), []); await view.click('For you'); view.signOut(); await view.save('future', false);
  assert.equal(view.toasts.at(-1).type, 'warning'); assert.equal(view.writes.length, 1);
});
test('refreshing the display clock updates ongoing/ended results without another backend request', async () => {
  const view = await page({ query: 'tab=ongoing', events: [event('boundary', { start_date: '2026-10-14T11:00:00Z', end_date: '2026-10-14T13:00:00Z' })] });
  assert.deepEqual(view.ids(), ['boundary']); const count = view.reads.length; await view.advance(Date.parse('2026-10-14T13:00:00Z')); assert.deepEqual(view.ids(), []); assert.equal(view.reads.length, count);
  await view.click('Past'); assert.deepEqual(view.ids(), ['boundary']);
});

test('search preserves a trailing space while typing and still trims for matching', async () => {
  const view = await page({ events: [event('clean', { name: 'Water Energy' })] });
  await view.search('water '); assert.equal(new URLSearchParams(view.location.search).get('q'), 'water ');
  await view.search('water energy'); assert.deepEqual(view.ids(), ['clean']);
});
