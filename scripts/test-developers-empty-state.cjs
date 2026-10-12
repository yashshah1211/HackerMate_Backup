/* eslint-disable @typescript-eslint/no-require-imports -- Offline component tests use the existing TypeScript harness. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness } = require('./ppt-vision-harness.cjs');

const builder = (id, availability = true) => ({
  id, full_name: `Fixture ${id}`, college: 'Campus A', year_of_study: '2nd Year',
  avatar_url: null, bio: 'Fixture builder', skills: ['React'], is_available: availability,
});

function ui(options = {}) {
  let cursor = 0, tree;
  const values = [], searches = [];
  let retryCalls = 0;
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
    href: props.href, className: props.className, onClick: props.onClick,
    disabled: props.disabled || props.loading, 'aria-label': props['aria-label'],
  }, props.children);
  let feedback;
  const system = new Proxy({}, { get: (_, name) => {
    // Render the actual shared empty/error UI, including its Retry button.
    if (name === 'EmptyState' || name === 'ErrorNotice') return feedback[name];
    if (name === 'PageHeader') return props => React.createElement('header', null, props.title, props.meta);
    if (name === 'SkeletonRows') return props => React.createElement('div', { 'data-skeleton-rows': props.rows });
    if (name === 'Dialog') return () => null;
    if (name === 'Sheet') return props => props.open ? React.createElement('section', null, props.title, props.children, props.footer) : null;
    return element(name === 'Button' ? 'button' : name === 'ButtonLink' ? 'a' : name === 'Select' ? 'select' : 'div');
  } });
  const modules = harness({ react: hooks, 'next/link': element('a'), '@/components/system': system });
  feedback = modules.load('src/components/system/Feedback.tsx');
  const Component = modules.load('src/app/developers/DevelopersView.tsx').DevelopersView;
  let props = {
    builders: [], viewer: { id: 'viewer', skills: ['React'] }, recs: {}, relationships: {}, ownedTeams: [],
    loading: false, error: null, search: '', sort: 'fit', inviteBusy: false,
    onRetry: () => { retryCalls++; },
    onSearch: value => { searches.push(value); props.search = value; },
    onSort: value => { props.sort = value; },
    onSendInvite: async () => true,
    ...options,
  };
  function render() { cursor = 0; tree = Component(props); return tree; }
  function findAll(node, predicate) {
    if (!node || typeof node !== 'object') return [];
    return [predicate(node) ? [node] : [], ...[node.props?.children].flat(Infinity).map(child => findAll(child, predicate))].flat();
  }
  render();
  return {
    values, searches, render,
    html: () => renderToStaticMarkup(render()),
    empty: () => findAll(tree, node => node.type === feedback.EmptyState)[0],
    rows: () => findAll(tree, node => Boolean(node.props?.b)),
    control: predicate => findAll(tree, predicate)[0],
    select(id, value, mobile = false) {
      const root = mobile ? findAll(tree, node => node.props?.title === 'Filter builders')[0] : tree;
      findAll(root, node => node.props?.id === id)[0].props.onChange({ target: { value } });
      render();
    },
    available(value) { findAll(tree, node => node.props?.label === 'Only builders available for a team')[0].props.onChange(value); render(); },
    search(value, mobile = false) { findAll(tree, node => node.props?.label === 'Search builders')[mobile ? 1 : 0].props.onChange(value); render(); },
    setProps(next) { props = { ...props, ...next }; render(); },
    retry() {
      const notice = findAll(tree, node => node.type === feedback.ErrorNotice)[0];
      const button = findAll(notice.type(notice.props), node => node.props?.children === 'Retry')[0];
      button.props.onClick();
    },
    retryCalls: () => retryCalls,
  };
}

test('unfiltered empty dataset retains the original onboarding message without a reset action', () => {
  const view = ui();
  assert.equal(view.empty().props.title, 'No builders yet');
  assert.equal(view.empty().props.body, "Share HackerMate with people you'd build with.");
  assert.equal(view.empty().props.action, undefined);
});

for (const search of ['Missing Name', 'Rust', 'Other College']) test(`empty server results for ${search} explain unmatched search`, () => {
  const view = ui({ search });
  assert.equal(view.empty().props.title, 'No builders match your search');
  assert.equal(view.empty().props.body, 'Try another name, skill or college.');
  assert.match(view.html(), /Reset search/);
  assert(!view.html().includes('No builders yet'));
});

test('unmatched client-side search uses the same search message when builders were loaded', () => {
  const view = ui({ builders: [builder('Ada')], search: 'Rust' });
  assert.equal(view.empty().props.title, 'No builders match your search');
  assert.equal(view.rows().length, 0);
});

test('whitespace-only search is treated as inactive for messaging and reset visibility', () => {
  const view = ui({ search: ' \t\n ' });
  assert.equal(view.empty().props.title, 'No builders yet');
  assert.equal(view.empty().props.action, undefined);
  view.setProps({ builders: [builder('Ada')] });
  assert.equal(view.empty(), undefined);
  assert.equal(view.rows().length, 1);
});

test('unmatched filters explain filtering even with a zero-length server dataset', () => {
  const view = ui();
  view.select('f-year', '3rd Year');
  assert.equal(view.empty().props.title, 'No builders match your filters');
  assert.equal(view.empty().props.body, 'Adjust or clear your filters to see more builders.');
  assert.match(view.html(), /Reset search/);
});

test('a filter excluding all loaded builders explains filtering', () => {
  const view = ui({ builders: [builder('Ada')] });
  view.select('f-year', '3rd Year');
  assert.equal(view.empty().props.title, 'No builders match your filters');
});

test('combined search and filters explain criteria and offer reset', () => {
  const view = ui({ search: 'Rust' });
  view.available(true);
  assert.equal(view.empty().props.title, 'No builders match your criteria');
  assert.equal(view.empty().props.body, 'Try another name, skill or college, or clear your filters.');
  assert.match(view.html(), /Reset search/);
});

test('whitespace search with active filters uses the filters-only message', () => {
  const view = ui({ search: '   ' });
  view.available(true);
  assert.equal(view.empty().props.title, 'No builders match your filters');
});

test('loading retains eight skeleton rows and never displays empty messaging', () => {
  for (const search of ['', 'Rust']) {
    const view = ui({ loading: true, search });
    assert.equal(view.empty(), undefined);
    assert.match(view.html(), /data-skeleton-rows="8"/);
    assert(!view.html().includes('No builders'));
  }
});

test('fetch failure preserves the real error notice and Retry without empty-state copy', () => {
  for (const search of ['', 'Rust']) {
    const view = ui({ error: 'Fixture network failure', search });
    view.available(true);
    assert.equal(view.empty(), undefined);
    assert.match(view.html(), /Couldn&#x27;t load builders/);
    assert.match(view.html(), /Fixture network failure/);
    assert(!view.html().includes('No builders'));
    view.retry();
    assert.equal(view.retryCalls(), 1);
  }
});

test('an unfiltered fetch failure is never described as an empty network', () => {
  const view = ui({ error: 'Fixture network failure' });
  assert.equal(view.empty(), undefined);
  view.retry();
  assert.equal(view.retryCalls(), 1);
});

test('error during loading keeps the error and skeletons, then successful results remain visible', () => {
  const view = ui({ error: 'Fixture network failure', loading: true });
  assert.match(view.html(), /Fixture network failure/);
  assert.match(view.html(), /data-skeleton-rows="8"/);
  assert.equal(view.empty(), undefined);
  view.setProps({ loading: false, builders: [builder('Ada')] });
  assert.equal(view.rows().length, 1);
  assert.equal(view.empty(), undefined);
  assert.match(view.html(), /Fixture Ada/);
  view.setProps({ error: null });
  assert(!view.html().includes('Fixture network failure'));
});

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'desktop'} reset clears search and all active filters`, () => {
  const view = ui({ builders: [builder('Ada')] });
  view.search('Rust', mobile);
  if (mobile) {
    view.control(node => node.props?.['aria-label'] === 'Filters').props.onClick();
    view.render();
  }
  view.select('f-college', 'Campus A', mobile);
  view.select('f-year', '3rd Year', mobile);
  view.available(true);
  assert.equal(view.empty().props.title, 'No builders match your criteria');
  view.empty().props.action.props.onClick();
  view.render();
  assert.equal(view.searches.at(-1), '');
  assert.deepEqual(JSON.parse(JSON.stringify(view.values[0])), { college: '', year: '', availableOnly: false, experience: 'any', skills: [] });
  assert.equal(view.values[1], 40);
  assert.equal(view.empty(), undefined);
  assert.equal(view.rows()[0].props.b.id, 'Ada');
});

test('search-only reset requests an unfiltered dataset without prematurely showing emptiness', () => {
  const view = ui({ search: 'Rust' });
  view.empty().props.action.props.onClick();
  assert.equal(view.searches.at(-1), '');
  view.setProps({ loading: true });
  assert.equal(view.empty(), undefined);
  view.setProps({ loading: false, builders: [builder('Ada')] });
  assert.equal(view.empty(), undefined);
  assert.equal(view.rows().length, 1);
});

test('non-empty results and strict availability behavior remain unchanged', () => {
  const view = ui({ builders: [builder('yes', true), builder('no', false), builder('unknown', null)] });
  assert.equal(view.empty(), undefined);
  assert.equal(view.rows().length, 3);
  assert.match(view.html(), /3 builders loaded · 1 available for a team/);
  assert.match(view.html(), /Availability not specified/);
  view.available(true);
  assert.deepEqual(view.rows().map(row => row.props.b.id), ['yes']);
  assert.equal(view.empty(), undefined);
  view.available(false);
  assert.equal(view.rows().length, 3);
});
