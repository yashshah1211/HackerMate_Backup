/* eslint-disable @typescript-eslint/no-require-imports -- Offline team discovery regressions. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { harness } = require('./ppt-vision-harness.cjs');
const overrides = { '@/lib/supabase': { supabase: {} } };
const presentation = harness().load('src/lib/matchPresentation.ts');
const { teamMatchScore, teamStatus, compareDiscoveryTeams } = harness(overrides).load('src/app/teams/useTeamsData.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const TODAY = '2026-10-14';
function team(id, extra = {}) {
  return { id, name: `Team ${id}`, description: 'Offline project', skills: ['React'], college: 'Campus A',
    hackathon_name: null, max_members: 5, is_recruiting: true, created_at: '2026-10-12T00:00:00Z', team_members: [{ id: 'member' }], ...extra };
}
function ranked(teams, viewer = ['react']) {
  return teams.map(t => ({ t, match: teamMatchScore(t.skills, viewer), status: teamStatus(t, TODAY) }))
    .sort(compareDiscoveryTeams).map(entry => entry.t.id);
}

test('trimmed case-insensitive distinct skills drive both score and coverage without mutating inputs', () => {
  const wanted = [' React ', 'REACT', 'python', ' ', 'PYTHON', ''];
  const mine = ['react', ' React ', ' ']; const snapshot = plain([wanted, mine]);
  assert.equal(teamMatchScore(wanted, mine), 50);
  assert.deepEqual(plain(presentation.teamSkillCoverage(wanted, mine)), { matched: 1, total: 2, skills: ['React'] });
  assert.deepEqual(plain(presentation.uniqueSkills(wanted)), ['React', 'python']);
  assert.deepEqual([wanted, mine], snapshot);
});
test('exact normalized skill matching preserves punctuation and does not invent aliases or substrings', () => {
  assert.equal(teamMatchScore(['C++', 'C#', 'Node.js', 'React Native'], ['c++', 'c', 'node', 'react']), 25);
  assert.equal(teamMatchScore(['React'], ['React.js']), 0);
});
for (const wanted of [null, undefined, [], [' ', '']]) test(`missing/blank team skills have no score: ${JSON.stringify(wanted)}`, () => {
  assert.equal(teamMatchScore(wanted, ['React']), 0);
  assert.equal(presentation.teamSkillCoverage(wanted, ['React']).total, 0);
});
test('empty viewer skills produce zero overlap, not an incompatibility verdict', () => {
  assert.equal(teamMatchScore(['React'], []), 0);
  assert.match(presentation.teamSkillExplanation(presentation.teamSkillCoverage(['React'], [' ']), [' ']), /Add skills to your profile/);
  assert.match(presentation.teamSkillExplanation(presentation.teamSkillCoverage(null, []), []), /hasn't listed skills/);
  assert.equal(presentation.teamSkillExplanation(presentation.teamSkillCoverage(['Rust'], ['React']), ['React']), 'No listed skills in common yet.');
});
test('explanation names the actual unique matches and preserves existing coverage labels', () => {
  const coverage = presentation.teamSkillCoverage([' React ', 'react', 'Python', 'Rust', 'C++'], ['REACT', 'python', 'rust']);
  assert.equal(presentation.coverageLabel(coverage), 'Matches 3 needed skills');
  assert.equal(presentation.teamSkillExplanation(coverage, ['React']), 'Matches 3 needed skills: React, Python and 1 more');
  assert.equal(presentation.coverageLabel({ matched: 2, total: 2 }), 'Matches all 2 needed skills');
  assert.equal(presentation.coverageLabel({ matched: 1, total: 1 }), 'Matches a needed skill');
  assert.equal(presentation.coverageLabel({ matched: 0, total: 0 }), null);
});
test('open teams precede higher-scoring full, closed, archived and ended teams', () => {
  const records = [team('closed', { is_recruiting: false }), team('full', { max_members: 1 }),
    team('archived', { team_hackathons: [{ hackathons: { id: 'event', name: 'Event', status: 'archived' } }] }),
    team('ended', { team_hackathons: [{ hackathons: { id: 'event', name: 'Event', end_date: '2026-10-13' } }] }),
    team('open', { skills: ['Rust'] })];
  assert.equal(ranked(records)[0], 'open');
  for (const record of records.slice(0, 4)) assert.equal(teamStatus(record, TODAY).open, false);
});
test('existing status semantics for unspecified recruiting and an event ending today are preserved', () => {
  assert.equal(teamStatus(team('legacy', { is_recruiting: null }), TODAY).open, true);
  assert.equal(teamStatus(team('today', { team_hackathons: [{ hackathons: { id: 'event', name: 'Event', end_date: TODAY } }] }), TODAY).open, true);
});
test('skill score, newest date and ID yield deterministic ties regardless of input order', () => {
  const records = [team('z', { skills: ['Rust'], created_at: '2026-10-14' }), team('b'), team('a'),
    team('new', { created_at: '2026-10-13' }), team('bad', { created_at: 'invalid' }), team('absent', { created_at: null })];
  const expected = ['new', 'a', 'b', 'absent', 'bad', 'z'];
  assert.deepEqual(ranked(records), expected);
  assert.deepEqual(ranked([...records].reverse()), expected);
  assert.deepEqual(ranked([records[3], records[5], records[0], records[2], records[4], records[1]]), expected);
});
test('without viewer skills, ties use newest date and ID with unknown dates last', () => {
  assert.deepEqual(ranked([team('b'), team('missing', { created_at: null }), team('a'), team('new', { created_at: '2026-10-13' })], []), ['new', 'a', 'b', 'missing']);
});

// Reuse the repository's component harness to exercise real filter callbacks and rendered cards offline.
function ui(teams, viewerSkills = ['react'], options = {}) {
  let cursor = 0, tree; const values = [];
  const events = [], errors = [];
  const hooks = { ...React, useMemo: fn => fn(), useState(start) {
    const i = cursor++; if (!(i in values)) values[i] = start;
    return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }];
  } };
  const element = tag => props => React.createElement(tag, {
    href: props.href, id: props.id, className: props.className, role: props.role, 'aria-label': props['aria-label'],
  }, props.children);
  const system = new Proxy({}, { get: (_, name) => {
    if (name === 'PageHeader') return props => React.createElement('header', null, props.title, props.meta, props.actions);
    if (name === 'Sheet') return () => null;
    if (name === 'EmptyState') return props => React.createElement('section', null, props.title, props.body, props.action);
    if (name === 'SearchField') return props => React.createElement('input', { 'aria-label': props.label, value: props.value, readOnly: true });
    return element(name === 'Button' ? 'button' : name === 'ButtonLink' ? 'a' : name === 'Select' ? 'select' : 'div');
  } });
  const Component = harness({ ...overrides, react: hooks, 'next/link': element('a'), '@/components/system': system,
    '@/lib/posthog': { trackEvent(name, properties) {
      if (options.analyticsError) throw options.analyticsError;
      events.push({ name, properties: plain(properties) });
    } }, './TeamsTabs': { TeamsTabs: () => null } }, { console: { error: (...args) => errors.push(args) } }).load('src/app/teams/TeamsView.tsx').TeamsView;
  const findAll = (node, predicate) => {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => findAll(child, predicate))];
  };
  const render = () => { cursor = 0; tree = Component({ teams, viewerSkills, loading: false, activitySettled: true, error: null, onRetry() {}, today: TODAY, ...options }); return tree; };
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : [node?.props?.children].flat(Infinity).map(child => child ? text(child) : '').join('');
  const control = predicate => { const found = findAll(tree, predicate)[0]; assert(found, 'Control missing'); return found; };
  render();
  return {
    ids: () => findAll(tree, node => node.props?.href?.startsWith('/teams/') && node.props.href !== '/teams/create').map(node => node.props.href.slice(7)),
    html: () => renderToStaticMarkup(tree),
    events, errors,
    alternative(path) { control(node => node.props?.href === path && typeof node.props.onClick === 'function').props.onClick(); },
    more() { control(node => text(node).startsWith('Show more') && typeof node.props?.onClick === 'function').props.onClick(); render(); },
    scope(label) { control(node => node.props?.role === 'tab' && text(node).startsWith(label)).props.onClick(); render(); },
    select(id, value) { control(node => node.props?.id === id).props.onChange({ target: { value } }); render(); },
    search(value) { control(node => node.props?.label === 'Search teams').props.onChange(value); render(); },
    skill(label) { control(node => node.type === 'button' && text(node.props.children?.[0]) === label).props.onClick(); render(); },
  };
}

test('default open scope preserves recruiting filtering; All teams prioritizes open and retains closed cards', () => {
  const view = ui([team('closed', { is_recruiting: false }), team('open', { skills: ['Rust'] }), team('full', { max_members: 1 })]);
  assert.deepEqual(view.ids(), ['open']); assert.match(view.html(), /View &amp; apply/);
  view.scope('All teams'); assert.deepEqual(view.ids(), ['open', 'closed', 'full']);
  assert.match(view.html(), /Closed/); assert.match(view.html(), /Full/); assert.match(view.html(), /View team/);
  assert.match(view.html(), /recruiting first/); assert.match(view.html(), /href="\/teams\/create"/);
});
test('search, college and event filters remain applied when switching scopes', () => {
  const event = [{ hackathons: { id: 'event', name: 'Event A' } }];
  const view = ui([team('a', { name: 'Alpha', team_hackathons: event }), team('closed', { name: 'Alpha closed', is_recruiting: false, team_hackathons: event }),
    team('college', { name: 'Alpha', college: 'Campus B', team_hackathons: event }), team('event', { name: 'Alpha', hackathon_name: 'Event B' }), team('search', { name: 'Other', team_hackathons: event })]);
  view.search(' ALPHA '); view.select('t-college', 'Campus A'); view.select('t-event', 'Event A');
  assert.deepEqual(view.ids(), ['a']); view.scope('All teams'); assert.deepEqual(view.ids(), ['a', 'closed']);
});
test('skill facets count each team once and selected skill filter uses the same trimmed matching', () => {
  const view = ui([team('a', { skills: [' React ', 'REACT', 'React', ' '] }), team('b', { skills: ['Rust'] }), team('c', { skills: ['react'] })]);
  const html = view.html(); assert.match(html, />React<\/span>/);
  // Three duplicates on a single team plus a second team must count as two teams.
  assert.match(html, /React<\/span>[\s\S]*?tabular-nums[^>]*>2<\/span>/);
  view.skill('React'); assert.deepEqual(view.ids(), ['a', 'c']);
});
test('multiple selected skill filters keep existing any-of semantics', () => {
  const view = ui([team('react'), team('rust', { skills: ['Rust'] }), team('python', { skills: ['Python'] })]);
  view.skill('React'); view.skill('Rust'); assert.deepEqual(view.ids(), ['react', 'rust']);
});
test('cards highlight and explain the same unique normalized skills without a fit probability', () => {
  const view = ui([team('match', { skills: [' React ', 'REACT', 'Python'] })], ['react']);
  const html = view.html(); assert.match(html, /class="text-ink-2 font-medium">React<\/span>/);
  assert.match(html, /Matches a needed skill: React/);
  assert.equal((html.match(/>React<\/span>/g) || []).length, 2); // One facet and one card skill.
  assert.match(html, /Based on listed skills, not a prediction of team fit/);
  assert(!/\d+%|Strong fit|verified expertise/.test(html.replace(/<[^>]*>/g, '')));
});
test('missing entries inside skill arrays do not break cards or selected skill filters', () => {
  const view = ui([team('sparse', { skills: [null, '', ' React ', 'react'] })]);
  assert.equal(teamMatchScore([null, '', 'React'], ['react']), 100);
  view.skill('React'); assert.deepEqual(view.ids(), ['sparse']);
  assert.match(view.html(), /Matches a needed skill: React/);
});
test('missing team skills, missing viewer skills and zero overlap have distinct honest explanations', () => {
  assert.match(ui([team('missing', { skills: [' '] })]).html(), /hasn&#x27;t listed skills yet/);
  assert.match(ui([team('viewer')], [' ']).html(), /Add skills to your profile/);
  assert.match(ui([team('zero', { skills: ['Rust'] })]).html(), /No listed skills in common yet/);
});

test('eligible recent owners rank before higher-overlap unknown peers without hiding any teams', () => {
  const records = [team('stale-new', { created_at: '2026-10-14' }), team('active-old', { ownerRecentlyActive: true, created_at: '2026-01-01' }),
    team('unknown', { created_at: null }), team('active-no-match', { ownerRecentlyActive: true, skills: ['Rust'] }),
    team('active-full', { ownerRecentlyActive: true, max_members: 1 })];
  const expected = ['active-old', 'active-no-match', 'stale-new', 'unknown', 'active-full'];
  assert.deepEqual(ranked(records), expected);
  assert.deepEqual(ranked([...records].reverse()), expected);
  const view = ui(records); assert.deepEqual(view.ids(), expected.slice(0, -1));
  view.scope('All teams'); assert.deepEqual(view.ids(), expected);
});
test('activity does not reorder non-joinable peers; eligible recent owners precede skill relevance', () => {
  assert.deepEqual(ranked([team('a', { is_recruiting: false }), team('z', { is_recruiting: false, ownerRecentlyActive: true })]), ['a', 'z']);
  assert.deepEqual(ranked([team('weak', { ownerRecentlyActive: true, skills: ['React', 'Rust'] }), team('relevant')]), ['weak', 'relevant']);
});

test('skills remain the next ordering key within recent and unknown groups, with deterministic ties', () => {
  const records = [team('recent-low', { ownerRecentlyActive: true, skills: ['React', 'Python'] }),
    team('unknown-low', { skills: ['React', 'Rust'] }), team('unknown-high'),
    team('recent-high-b', { ownerRecentlyActive: true }), team('recent-high-a', { ownerRecentlyActive: true })];
  const expected = ['recent-high-a', 'recent-high-b', 'recent-low', 'unknown-high', 'unknown-low'];
  assert.deepEqual(ranked(records), expected);
  assert.deepEqual(ranked([...records].reverse()), expected);
  const html = ui(records).html();
  assert.match(html, /recent owner activity · skill overlap · newest/);
  assert.match(html, /Matches a needed skill: React/);
});

test('recent eligible teams reach the first page and unknown teams remain reachable with Show more', () => {
  const records = Array.from({ length: 34 }, (_, i) => team(`unknown-${String(i).padStart(2, '0')}`));
  records.push(team('recent-last', { ownerRecentlyActive: true, skills: ['Rust'], created_at: null }));
  const snapshot = plain(records), view = ui(records);
  assert.equal(view.ids().length, 30); assert.equal(view.ids()[0], 'recent-last');
  view.more(); assert.equal(view.ids().length, 35);
  assert.deepEqual([...view.ids()].sort(), records.map(record => record.id).sort());
  assert.deepEqual(records, snapshot);
});

test('missing, outdated and unavailable activity receive the same skill-based order, not an inactivity penalty', () => {
  const records = [team('new-low', { skills: ['React', 'Python'], ownerRecentlyActive: false, created_at: '2026-10-14' }),
    team('unknown-high'), team('older-high', { ownerRecentlyActive: false, created_at: '2026-01-01' })];
  assert.deepEqual(ranked(records), ['unknown-high', 'older-high', 'new-low']);
  const html = ui(records, ['React'], { activityUnavailable: true }).html();
  assert.match(html, /Owner activity couldn’t be checked/);
  assert.match(html, /You can still browse and apply/);
  assert(!/inactive|unresponsive|abandoned|unwilling/i.test(html));
});

test('recent owners never elevate full, closed or concluded teams above eligible unknown owners', () => {
  const records = [team('full', { ownerRecentlyActive: true, max_members: 1 }),
    team('closed', { ownerRecentlyActive: true, is_recruiting: false }),
    team('ended', { ownerRecentlyActive: true, hackathons: { id: 'past', end_date: '2026-10-13' } }),
    team('eligible', { skills: ['Rust'] })];
  const view = ui(records);
  assert.deepEqual(view.ids(), ['eligible']);
  view.scope('All teams'); assert.equal(view.ids()[0], 'eligible'); assert.equal(view.ids().length, 4);
});

test('nonempty results with no shared-skill recent owner offer alternatives while keeping every eligible row', () => {
  const view = ui([team('unknown-match'), team('active-unmatched', { skills: ['Rust'], ownerRecentlyActive: true })]);
  assert.deepEqual(view.ids(), ['active-unmatched', 'unknown-match']);
  const html = view.html();
  assert.match(html, /No open team with shared listed skills and a recently active owner has been identified in these results/);
  assert.match(html, /You can keep browsing/);
  assert.match(html, /href="\/developers"/); assert.match(html, />Create a team<\/a>/);
  assert.equal((html.match(/>Discover builders<\/a>/g) || []).length, 1);
  assert.match(html, /No listed skills in common yet/); assert.match(html, /Matches a needed skill: React/);
  assert.match(html, /doesn’t guarantee a response/);
});

test('contextual alternatives respect the filtered results rather than unrelated recent owners', () => {
  const view = ui([team('active-match', { name: 'Visible recent', ownerRecentlyActive: true }), team('unknown-match', { name: 'Other team' })]);
  assert(!view.html().includes('has been identified in these results'));
  view.search('Other team');
  assert.deepEqual(view.ids(), ['unknown-match']); assert.match(view.html(), /has been identified in these results/);
  view.search('Visible recent'); assert(!view.html().includes('has been identified in these results'));
});

test('without viewer skills, recent activity is usable without inventing skill relevance', () => {
  const unknown = ui([team('unknown')], []);
  assert.match(unknown.html(), /Skill relevance can’t be assessed without your listed skills/);
  assert.match(unknown.html(), /Add skills to your profile/);
  const recent = ui([team('recent', { ownerRecentlyActive: true })], []);
  assert(!recent.html().includes('has been identified in these results'));
  assert.match(recent.html(), /Add skills to your profile/);
  assert(!recent.html().includes('· skill overlap'));
});

test('a recent owner without listed team skills cannot establish shared-skill relevance', () => {
  const html = ui([team('recent', { skills: null, ownerRecentlyActive: true })]).html();
  assert.match(html, /has been identified in these results/);
  assert.match(html, /hasn&#x27;t listed skills yet/);
});

test('partial activity failures retain confirmed positive indicators and make missing coverage explicit', () => {
  const html = ui([team('recent', { ownerRecentlyActive: true }), team('unknown')], ['React'], { activityUnavailable: true }).html();
  assert.match(html, /Owner activity couldn’t be checked/);
  assert.match(html, /<p[^>]*>Owner recently active<\/p>/);
  assert(!html.includes('has been identified in these results'));
});

test('loading, errors and empty results do not duplicate the contextual alternative paragraph', () => {
  for (const options of [{ loading: true }, { activitySettled: false }, { activitySettled: undefined }, { error: 'Synthetic team read failed' }]) {
    assert(!ui([team('unknown')], ['React'], options).html().includes('has been identified in these results'));
  }
  const html = ui([]).html();
  assert(!html.includes('has been identified in these results'));
  assert.equal((html.match(/>Discover builders<\/a>/g) || []).length, 1);
});

test('alternative selection emits only fixed source and path values after an explicit click', () => {
  const view = ui([team('private-id', { name: 'Private team name', owner_id: 'private-owner' })]);
  assert.deepEqual(view.events, []);
  view.alternative('/teams/create'); view.alternative('/developers');
  assert.deepEqual(view.events, ['create', 'builders'].map(path => ({ name: 'team_discovery_alternative_selected', properties: { source: 'team_discovery', path } })));
  assert(!/private|React|2026/.test(JSON.stringify(view.events)));
});

test('analytics exceptions are logged and cannot escape the alternative navigation callback', () => {
  const failure = new Error('Synthetic analytics failure');
  const view = ui([team('unknown')], ['React'], { analyticsError: failure });
  assert.doesNotThrow(() => view.alternative('/developers'));
  assert.equal(view.errors.length, 1); assert.equal(view.errors[0][1], failure);
  assert.deepEqual(view.events, []); assert.match(view.html(), /href="\/developers"/);
});
for (const association of ['hackathons', 'team_hackathons']) {
  for (const event of [{ archived: true }, { status: 'archived' }, { end_date: '2026-10-13' }]) {
    test(`event closure via ${association}: ${JSON.stringify(event)}`, () => {
      const h = { id: 'event', name: 'Primary Event', ...event };
      const t = team('closed-event', association === 'hackathons' ? { hackathon_id: h.id, hackathons: h } : { team_hackathons: [{ hackathons: h }] });
      assert.equal(teamStatus(t, TODAY).open, false);
      const view = ui([t]); assert.deepEqual(view.ids(), []); view.scope('All teams'); assert.deepEqual(view.ids(), ['closed-event']);
    });
  }
}
test('primary-only event appears in facets; duplicate junction names count once', () => {
  const h = { id: 'event', name: 'Primary Event', archived: false, end_date: TODAY };
  const view = ui([team('primary', { hackathon_id: h.id, hackathons: h, team_hackathons: [{ hackathons: h }] })]);
  assert.match(view.html(), /Primary Event \(1\)/); assert(!view.html().includes('Primary Event, Primary Event'));
  view.select('t-event', h.name); assert.deepEqual(view.ids(), ['primary']);
});
test('missing/inaccessible event relations and malformed dates do not fabricate closure', () => {
  for (const end_date of [null, '', 'invalid', '2026-02-30', '2026-1-1']) {
    assert.equal(teamStatus(team('unknown', { hackathon_id: 'inaccessible', hackathons: null,
      team_hackathons: [{ hackathons: null }, { hackathons: { id: 'event', name: 'Event', end_date } }] }), TODAY).open, true);
  }
});
test('any known closed linked event still closes a multi-event team; this change does not redefine multi-event recruitment', () => {
  assert.equal(teamStatus(team('multi', { hackathons: { id: 'primary', name: 'Future', end_date: '2027-01-01' },
    team_hackathons: [{ hackathons: { id: 'past', name: 'Past', end_date: '2026-10-13' } }] }), TODAY).open, false);
});
test('activity indicator is coarse, honest, and absent on unknown teams', () => {
  const html = ui([team('active', { ownerRecentlyActive: true })]).html();
  assert.match(html, /<p[^>]*>Owner recently active<\/p>/);
  assert.match(html, /past 30 days/); assert.match(html, /doesn’t guarantee a response/);
  assert(!/online|abandoned|last seen|2026-10-/.test(html));
  assert(!/<p[^>]*>Owner recently active<\/p>/.test(ui([team('unknown')]).html()));
});
test('empty results provide create-team and builder discovery paths while preserving all-teams access', () => {
  const view = ui([team('closed', { is_recruiting: false })]);
  const html = view.html(); assert.match(html, /Show all teams/); assert.match(html, /Create a team/);
  assert.match(html, /href="\/developers"/); assert.match(html, /discover builders to invite/);
  view.scope('All teams'); assert.deepEqual(view.ids(), ['closed']);
  view.search('not present'); assert.match(view.html(), /Discover builders/);
});

test('timestamp event ends respect the existing UTC calendar-day boundary, including offsets', () => {
  for (const [end_date, open] of [['2026-10-13T23:59:59Z', false], ['2026-10-14T00:00:00Z', true],
    ['2026-10-14T00:30:00+05:30', false], ['2026-10-13T23:30:00-05:00', true],
    ['2026-10-14T00:00:00.000000+00:00', true], ['2026-02-30T00:00:00Z', true]]) {
    assert.equal(teamStatus(team('timestamp', { hackathons: { id: 'e', name: 'Event', end_date } }), TODAY).open, open, end_date);
  }
});
