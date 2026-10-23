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
function ui(teams, viewerSkills = ['react'], props = {}) {
  let cursor = 0, tree; const values = [];
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
    './TeamsTabs': { TeamsTabs: () => null } }).load('src/app/teams/TeamsView.tsx').TeamsView;
  const findAll = (node, predicate) => {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => findAll(child, predicate))];
  };
  const render = () => { cursor = 0; tree = Component({ teams, viewerSkills, loading: false, error: null, onRetry() {}, today: TODAY, ...props }); return tree; };
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : [node?.props?.children].flat(Infinity).map(child => child ? text(child) : '').join('');
  const control = predicate => { const found = findAll(tree, predicate)[0]; assert(found, 'Control missing'); return found; };
  render();
  return {
    ids: () => findAll(tree, node => node.props?.href?.startsWith('/teams/') && node.props.href !== '/teams/create').map(node => node.props.href.slice(7)),
    html: () => renderToStaticMarkup(tree),
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

test('recent owners rank ahead of equally relevant older peers without hiding unknown activity', () => {
  const records = [team('stale-new', { created_at: '2026-10-14' }), team('active-old', { ownerRecentlyActive: true, created_at: '2026-01-01' }),
    team('unknown', { created_at: null }), team('active-no-match', { ownerRecentlyActive: true, skills: ['Rust'] }),
    team('active-full', { ownerRecentlyActive: true, max_members: 1 })];
  const expected = ['active-old', 'active-no-match', 'stale-new', 'unknown', 'active-full'];
  assert.deepEqual(ranked(records), expected);
  assert.deepEqual(ranked([...records].reverse()), expected);
  const view = ui(records); assert.deepEqual(view.ids(), expected.slice(0, -1));
  view.scope('All teams'); assert.deepEqual(view.ids(), expected);
});
test('activity precedes skill overlap only among joinable teams', () => {
  assert.deepEqual(ranked([team('a', { is_recruiting: false }), team('z', { is_recruiting: false, ownerRecentlyActive: true })]), ['a', 'z']);
  assert.deepEqual(ranked([team('weak', { ownerRecentlyActive: true, skills: ['React', 'Rust'] }), team('relevant')]), ['weak', 'relevant']);
  assert.deepEqual(ranked([team('weak', { ownerRecentlyActive: true, skills: ['Rust'] }), team('strong', { ownerRecentlyActive: true })]), ['strong', 'weak']);
});

test('any activity retrieval failure restores skill/date/ID ranking even with successful active owners', () => {
  const records = [team('weak', { ownerRecentlyActive: true, skills: ['Rust'] }), team('relevant')];
  const view = ui(records, ['react'], { activityUnavailable: true });
  assert.deepEqual(view.ids(), ['relevant', 'weak']);
  assert.match(view.html(), /Owner activity couldn’t be checked/);
  assert(!view.html().includes('recent owner activity first'));
});

test('cards distinguish no confirmed recent activity, pending checks and unavailable activity without inactivity claims', () => {
  for (const [ownerActivityStatus, label] of [['checked', 'No confirmed recent owner activity'], ['loading', 'Checking owner activity…'], ['unavailable', 'Owner activity unavailable']]) {
    const html = ui([team('fixture', { ownerActivityStatus })]).html();
    assert(html.includes(label));
    assert(!/inactive|unwilling|Guaranteed response|Verified recruiting/.test(html));
  }
});

test('weak supply provides alternatives only after activity checks succeed and respects current filters', () => {
  const records = [team('other', { ownerActivityStatus: 'checked', ownerRecentlyActive: true }), team('wanted', { ownerActivityStatus: 'checked' })];
  const view = ui(records);
  assert(!view.html().includes('No recent owner activity confirmed for open teams here'));
  view.search('wanted');
  assert.match(view.html(), /No recent owner activity confirmed for open teams here/);
  assert.match(view.html(), /href="\/developers"/);
  assert.match(view.html(), /Browse other teams/);
  for (const props of [{ activityUnavailable: true }, { loading: true }, { error: 'denied' }]) {
    assert(!ui([records[1]], ['react'], props).html().includes('No recent owner activity confirmed for open teams here'));
  }
  assert(!ui([team('pending', { ownerActivityStatus: 'loading' })]).html().includes('No recent owner activity confirmed for open teams here'));
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
