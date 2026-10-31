/* eslint-disable @typescript-eslint/no-require-imports -- Offline selection and real component contracts. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { harness } = require('./ppt-vision-harness.cjs');
const { selectPartnerEvents, partnerSpotlightContent } = harness().load('src/app/dashboard/partnerSpotlight.ts');
const TODAY = '2026-10-31';
const event = (slug, endDate = '2026-12-13', extra = {}) => ({ slug, name: 'Synthetic partner', eventName: 'Synthetic event', logoUrl: null, endDate, ...extra });
const ids = rows => Array.from(rows, row => row.slug);
test('no partners produces no promotion', () => assert.deepEqual(ids(selectPartnerEvents([], TODAY)), []));
test('known expired partners are excluded, including Rack', () => {
  assert.deepEqual(ids(selectPartnerEvents([event('expired', '2026-10-30'), event('rack-it-up-2026', '2026-10-30'), event('today', TODAY)], TODAY)), ['today']);
});
test('nearest end first, missing dates last, deterministic slug ties, at most three', () => {
  const rows = [event('undated', null), event('z'), event('next', '2026-11-01'), event('a')];
  assert.deepEqual(ids(selectPartnerEvents(rows, TODAY)), ['next', 'a', 'z']);
  assert.deepEqual(ids(selectPartnerEvents([...rows].reverse(), TODAY)), ['next', 'a', 'z']);
  assert.equal(rows[0].endDate, null);
});
test('missing/invalid dates remain honest, without requiring status or start columns', () => {
  for (const end of [null, '', 'invalid', '2026-02-30']) {
    const selected = selectPartnerEvents([event('undated', end)], TODAY);
    assert.equal(selected.length, 1);
    assert.equal(partnerSpotlightContent(selected[0]).dates, 'Dates to be confirmed');
  }
  assert.equal(selectPartnerEvents([event('valid')], 'invalid').length, 0);
});
test('Rack with missing linked date expires after its verified final, never lives forever', () => {
  assert.equal(selectPartnerEvents([event('rack-it-up-2026', null)], '2026-12-14').length, 1);
  assert.equal(selectPartnerEvents([event('rack-it-up-2026', null)], '2026-12-15').length, 0);
});
test('unsafe slugs cannot produce arbitrary destinations; duplicates do not repeat cards', () => {
  assert.deepEqual(ids(selectPartnerEvents([event('../admin'), event('https://evil.invalid'), event('valid'), event('valid')], TODAY)), ['valid']);
});
test('Rack content uses approved facts/artwork only when a configured Rack row exists', () => {
  const content = partnerSpotlightContent(event('rack-it-up-2026', null, { eventName: 'Unverified replacement', logoUrl: 'https://example.invalid/unapproved.png' }));
  assert.equal(content.title, 'Rack It Up 2026');
  assert.equal(content.logo, '/partners/rack-it-up-2026/RackItUp-mark.png');
  assert.match(content.credit, /Rack'Em \/ Karma Enterprises/);
  assert.match(content.dates, /11–13 December 2026/);
});
test('generic partners use configuration identity and have no invented organizer or description', () => {
  const content = partnerSpotlightContent(event('generic', null, { eventName: null, logoUrl: 'javascript:bad' }));
  assert.equal(content.title, 'Synthetic partner'); assert.equal(content.description, null); assert.equal(content.logo, null);
  assert(!content.credit.includes('Organised by'));
});
const styles = new Proxy({}, { get: (_target, key) => String(key) });
const Component = harness({ './FeaturedPartnerEvents.module.css': { __esModule: true, default: styles },
  'next/link': ({ children, prefetch, ...props }) => { void prefetch; return React.createElement('a', props, children); },
}).load('src/app/dashboard/FeaturedPartnerEvents.tsx').default;
for (const count of [1, 2, 3]) test('real spotlight renders correct accessible destinations for ' + count + ' events', () => {
  const events = Array.from({ length: count }, (_, i) => event('partner-' + i));
  const html = renderToStaticMarkup(React.createElement(Component, { events, loading: false }));
  assert.equal((html.match(/Explore event<|Explore event /g) || []).length, count);
  for (const item of events) assert(html.includes('href="/partners/' + item.slug + '"'));
  assert.equal((html.match(/id="featured-partner-title"/g) || []).length, 1);
});
test('empty and loading states never expose stale event links', () => {
  assert.equal(renderToStaticMarkup(React.createElement(Component, { events: [], loading: false })), '');
  const html = renderToStaticMarkup(React.createElement(Component, { events: [event('stale')], loading: true }));
  assert(html.includes('role="status"')); assert(!html.includes('/partners/stale'));
});
test('authenticated partner query projection is unchanged from approved main', () => {
  const file = 'src/app/dashboard/useDashboardData.ts';
  const base = execFileSync('git', ['show', '64aa18786f7035b830cd9d8f1095a533b5b2ac7b:' + file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const query = source => source.match(/const partnersP = supabase[\s\S]*?;/)[0];
  assert.equal(query(readFileSync(file, 'utf8')), query(base));
});
test('featured section precedes the dashboard columns, with no sidebar duplicate or Rack telemetry', () => {
  const source = readFileSync('src/app/dashboard/DashboardView.tsx', 'utf8');
  assert.equal((source.match(/<FeaturedPartnerEvents /g) || []).length, 1);
  assert(source.indexOf('<FeaturedPartnerEvents ') < source.indexOf('lg:grid-cols-'));
  assert(!source.includes('<PartnerEvents '));
  const component = readFileSync('src/app/dashboard/FeaturedPartnerEvents.tsx', 'utf8');
  assert(!/RackFunnel|sa_event|trackEvent|data-rack-funnel/.test(component));
});
