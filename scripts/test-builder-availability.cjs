/* eslint-disable @typescript-eslint/no-require-imports -- Offline component tests use the existing TypeScript harness. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness } = require('./ppt-vision-harness.cjs');

const NOW = Date.parse('2026-10-12T12:00:00Z');
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}
function builder(id, availability, online = false) {
  const row = {
    id, full_name: `Fixture ${id}`, college: 'Campus A', year_of_study: '2nd Year',
    bio: 'Offline test profile', avatar_url: null, skills: ['React'],
    last_seen_at: new Date(NOW - (online ? 60_000 : 3 * 60 * 60_000)).toISOString(),
    created_at: new Date(NOW - 24 * 60 * 60_000).toISOString(),
  };
  if (availability !== undefined) row.is_available = availability;
  return row;
}
const fixture = () => [builder('available', true), builder('unavailable', false, true), builder('null', null, true), builder('omitted', undefined)];

function ui(options = {}) {
  let cursor = 0;
  const values = [];
  const invites = [], sorts = [], searches = [];
  const hooks = {
    ...React,
    useState(start) {
      const index = cursor++;
      if (!(index in values)) values[index] = start;
      return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value; }];
    },
    useMemo(fn) { return fn(); },
  };
  const element = tag => props => React.createElement(tag, {
    href: props.href, className: props.className, disabled: props.disabled || props.loading,
    'aria-label': props['aria-label'], 'data-presence': props.presence || undefined,
  }, props.children);
  const system = new Proxy({}, { get: (_, name) => {
    if (name === 'PageHeader') return props => React.createElement('header', null, props.title, props.meta);
    if (name === 'Dialog') return props => props.open ? React.createElement('section', { role: 'dialog' }, props.title, props.children, props.footer) : null;
    if (name === 'Sheet') return () => null;
    if (name === 'EmptyState') return props => React.createElement('section', null, props.title, props.body, props.action);
    return element(name === 'Button' || name === 'FilterChip' ? 'button' : name === 'ButtonLink' ? 'a' : name === 'Select' ? 'select' : 'div');
  } });
  let props = {
    builders: fixture(), viewer: { id: 'viewer', skills: ['React'] }, recs: {}, relationships: {},
    ownedTeams: [{ id: 'fixture-team', name: 'Fixture team', owner_id: 'viewer' }],
    loading: false, error: null, onRetry() {}, search: '', sort: 'fit', inviteBusy: false,
    onSearch: value => { searches.push(value); props.search = value; },
    onSort: value => { sorts.push(value); props.sort = value; },
    onSendInvite: async (teamId, builderId) => { invites.push({ teamId, builderId }); return options.inviteResult !== false; },
    ...options.props,
  };
  const Component = harness({ react: hooks, 'next/link': element('a'), '@/components/system': system }, { Date: FixtureDate }).load('src/app/developers/DevelopersView.tsx').DevelopersView;
  let tree;
  function render() { cursor = 0; tree = Component(props); return tree; }
  function findAll(node, predicate) {
    if (!node || typeof node !== 'object') return [];
    return [predicate(node) ? [node] : [], ...[node.props?.children].flat(Infinity).map(child => findAll(child, predicate))].flat();
  }
  render();
  const rows = () => findAll(tree, node => Boolean(node.props?.b));
  return {
    invites, sorts, searches, render, rows,
    ids: () => rows().map(row => row.props.b.id),
    html: () => renderToStaticMarkup(render()),
    rowHtml: id => { const row = rows().find(row => row.props.b.id === id); assert(row); return renderToStaticMarkup(row.type(row.props)); },
    presence: id => { const row = rows().find(row => row.props.b.id === id); return findAll(row.type(row.props), node => Object.hasOwn(node.props || {}, 'presence'))[0].props.presence; },
    control: predicate => findAll(tree, predicate)[0],
    available(value) { findAll(tree, node => node.props?.label === 'Only builders available for a team')[0].props.onChange(value); render(); },
    select(id, value) { findAll(tree, node => node.props?.id === id)[0].props.onChange({ target: { value } }); render(); },
    dialog: () => findAll(tree, node => Object.hasOwn(node.props || {}, 'builder'))[0],
  };
}

for (const availability of [true, false, null, undefined]) {
  for (const online of [true, false]) test(`${String(availability)} availability renders honestly ${online ? 'online' : 'offline'}`, () => {
    const view = ui({ props: { builders: [builder('test', availability, online)] } });
    const html = view.rowHtml('test');
    assert.equal(html.includes('bg-ok'), availability === true);
    assert.equal(/>Available<|>\s*Available\s*</.test(html), availability === true);
    assert.equal(html.includes('Availability not specified'), availability == null);
    assert.equal(html.includes('Online now'), online);
    assert.equal(view.presence('test'), online ? 'online' : null);
    if (!online) assert.match(html, /Active 3h ago/);
    assert.match(html, /href="\/profile\/test\?connect=1"/);
    assert.match(html, />Invite</);
  });
}

test('header counts only explicit true within the loaded dataset, even beyond the first page', () => {
  const builders = [...fixture(), ...Array.from({ length: 40 }, (_, index) => builder(`extra-${index}`, index < 2 ? true : null))];
  const view = ui({ props: { builders } });
  assert.match(view.html(), /44 builders loaded · 3 available for a team/);
  assert.equal(view.rows().length, 40);
  const empty = ui({ props: { builders: [] } });
  assert.match(empty.html(), /0 builders loaded · 0 available for a team/);
});

test('available-only toggle includes only true; disabling it restores all unknown builders', () => {
  const view = ui();
  assert.equal(view.ids().length, 4);
  view.available(true);
  assert.deepEqual(view.ids(), ['available']);
  assert.match(view.html(), /4 builders loaded · 1 available for a team/);
  view.available(false);
  assert.deepEqual(new Set(view.ids()), new Set(['available', 'unavailable', 'null', 'omitted']));
});

test('available-only has no results when all loaded builders are unavailable or unknown', () => {
  const view = ui({ props: { builders: fixture().slice(1) } });
  view.available(true);
  assert.deepEqual(view.ids(), []);
  assert.match(view.html(), /No builders match/);
  assert.match(view.html(), /3 builders loaded · 0 available for a team/);
});

test('search remains usable for unknown builders and composes with availability filtering', () => {
  const view = ui();
  view.control(node => node.props?.label === 'Search builders').props.onChange('Fixture null');
  view.render();
  assert.deepEqual(view.ids(), ['null']);
  view.available(true);
  assert.deepEqual(view.ids(), []);
  view.available(false);
  assert.deepEqual(view.ids(), ['null']);
  assert.deepEqual(view.searches, ['Fixture null']);
});

test('college, year, skills and experience filters continue composing with availability', () => {
  const builders = fixture().map(row => ({ ...row, hackathon_wins: 1, has_won_hackathon: true }));
  builders[1].college = 'Campus B';
  builders[3].year_of_study = '3rd Year';
  builders.push({ ...builder('wrong-skill', true), skills: ['Python'], hackathon_wins: 1 });
  builders.push({ ...builder('no-win', true), hackathon_wins: 0, has_won_hackathon: false });
  const view = ui({ props: { builders } });
  view.select('f-college', 'Campus A');
  view.select('f-year', '2nd Year');
  view.control(node => node.props?.children?.[0]?.props?.children === 'Has won' && typeof node.props?.onClick === 'function').props.onClick();
  view.render();
  view.control(node => node.props?.children?.[0]?.props?.children === 'React' && typeof node.props?.onClick === 'function').props.onClick();
  view.render();
  assert.deepEqual(new Set(view.ids()), new Set(['available', 'null']));
  view.available(true);
  assert.deepEqual(view.ids(), ['available']);
});

test('best-fit preserves server recommendation rank and Active/New preserve supplied order', () => {
  const builders = fixture();
  const recs = Object.fromEntries(builders.map((row, index) => [row.id, { compatibility: 80, rank: 3 - index }]));
  const view = ui({ props: { builders, recs } });
  assert.deepEqual(view.ids(), builders.map(row => row.id).reverse());
  for (const label of ['Active', 'New']) {
    view.control(node => node.props?.children === label && node.props?.role === 'tab').props.onClick();
    view.render();
    assert.deepEqual(view.ids(), builders.map(row => row.id));
  }
  assert.deepEqual(view.sorts, ['active', 'new']);
});

for (const availability of [true, false, null, undefined]) test(`inviting a ${String(availability)} builder retains the existing team selection and callback`, async () => {
  const view = ui({ props: { builders: [builder('test', availability)] } });
  view.rows()[0].props.onInvite();
  view.render();
  assert.equal(view.dialog().props.builder.id, 'test');
  assert.match(view.html(), /Send invite/);
  await view.dialog().props.onSend('fixture-team');
  assert.deepEqual(view.invites, [{ teamId: 'fixture-team', builderId: 'test' }]);
  view.render();
  assert.equal(view.dialog().props.builder, null);
});

test('invitation rejection keeps the dialog open for an unknown builder', async () => {
  const view = ui({ inviteResult: false, props: { builders: [builder('test', null)] } });
  view.rows()[0].props.onInvite();
  view.render();
  await view.dialog().props.onSend('fixture-team');
  view.render();
  assert.equal(view.dialog().props.builder.id, 'test');
});

test('relationship presentation is independent of unknown availability', () => {
  for (const [state, text] of [['connected', 'Connected'], ['request_sent', 'Request sent'], ['request_received', 'Respond']]) {
    const view = ui({ props: { builders: [builder('test', null)], relationships: { test: state } } });
    assert.match(view.rowHtml('test'), new RegExp(text));
    assert.match(view.rowHtml('test'), /Availability not specified/);
  }
});
