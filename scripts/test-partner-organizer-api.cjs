/* eslint-disable @typescript-eslint/no-require-imports -- Actual route and helper regression tests. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { harness, participant, EVENT, OTHER, NATIVE } = require('./partner-organizer-harness.cjs');
function privateResponse(response, status) { assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'private, no-store'); }
const denied = [
  ['anonymous', { user: null }, 'fixture-event', 401],
  ['ordinary participant', { allowedEvents: [] }, 'fixture-event', 403],
  ['wrong-event organizer', { allowedEvents: [OTHER] }, 'fixture-event', 403],
  ['revoked organizer', { allowedEvents: [] }, 'fixture-event', 403],
  ['banned organizer', { profile: { is_banned: true } }, 'fixture-event', 403],
  ['banned admin', { profile: { role: 'admin', is_banned: true } }, 'fixture-event', 403],
  ['banned founder', { user: { email: 'yashshah7117@gmail.com' }, profile: { is_banned: true } }, 'fixture-event', 403],
  ['missing profile', { profile: null }, 'fixture-event', 403],
  ['unknown ban', { profile: { is_banned: null } }, 'fixture-event', 403],
  ['omitted ban', { profile: { is_banned: undefined } }, 'fixture-event', 403],
  ['unverifiable email', { user: { email: null } }, 'fixture-event', 403],
  ['failed auth lookup', { authError: { message: 'PRIVATE_AUTH_DETAIL' } }, 'fixture-event', 401],
  ['unknown slug', {}, 'unknown-event', 404],
  ['malformed slug', {}, 'bad-slug.csv', 404],
  ['unlinked slug', {}, 'unlinked-event', 404],
  ['missing resolved event', { missingEvent: true }, 'fixture-event', 404],
  ['malformed configured event', { partner: { id: '00000000-0000-4000-8000-000000000201', hackathon_id: 'bad' } }, 'fixture-event', 404],
  ['profile DB failure', { lookupError: 'profiles' }, 'fixture-event', 500],
  ['partner DB failure', { lookupError: 'partner_configs' }, 'fixture-event', 500],
  ['event DB failure', { lookupError: 'hackathons' }, 'fixture-event', 500],
  ['profile lookup exception', { throwLookup: 'profiles' }, 'fixture-event', 500],
  ['partner lookup exception', { throwLookup: 'partner_configs' }, 'fixture-event', 500],
  ['event lookup exception', { throwLookup: 'hackathons' }, 'fixture-event', 500],
  ['missing access RPC', { accessError: { code: 'PGRST202', message: 'PRIVATE_SQL_DETAIL' } }, 'fixture-event', 500],
  ['SQL access denial', { accessError: { code: '42501', message: 'PRIVATE_SQL_DETAIL' } }, 'fixture-event', 403],
];
for (const kind of ['api', 'export']) {
  for (const [label, options, slug, status] of denied) test(`${kind}: denies ${label}, private response, no data RPC`, async () => {
    const h = harness(options), response = await h.call(kind, '', slug);
    privateResponse(response, status); assert.equal(h.state.projectionCalls, 0);
    assert(!JSON.stringify(await response.json()).includes('PRIVATE_'));
    assert(h.state.clients.every(client => client.key === 'fixture-anon'));
  });
  for (const [label, options, slug] of [ ['assigned organizer', {}, 'fixture-event'], ['supported native owner', { allowedEvents: [NATIVE] }, 'native-event'], ['admin', { profile: { role: 'admin' }, allowedEvents: [EVENT, OTHER] }, 'fixture-event'], ['verified founder', { user: { email: ' YASHshah7117@GMAIL.COM ' }, allowedEvents: [EVENT, OTHER] }, 'fixture-event'] ]) test(`${kind}: allows ${label} through actual authority helper`, async () => {
    const h = harness(options), response = await h.call(kind, '', slug);
    privateResponse(response, 200); assert.equal(h.state.rpcs[0].name, 'can_access_partner_event');
    const resolved = slug === 'native-event' ? NATIVE : EVENT;
    assert(h.state.rpcs.every(rpc => rpc.args.p_hackathon_id === resolved));
    assert(h.state.queries.some(q => q.table === 'partner_configs' && q.filters[0][1] === slug));
    assert(h.state.queries.some(q => q.table === 'hackathons' && q.filters[0][1] === resolved));
    assert(h.state.clients.every(client => client.key === 'fixture-anon'));
  });
  test(`${kind}: supports caller cookie session`, async () => { const h = harness(); privateResponse(await h.call(kind, '', 'fixture-event', { cookie: true }), 200); assert.equal(h.state.clients[0].kind, 'cookie'); });
  for (const key of ['hackathon_id', 'hackathonId', 'userId', 'admin', 'isAdmin', 'partnerAccess']) test(`${kind}: rejects forged ${key} without overriding resolved event`, async () => {
    const h = harness(); privateResponse(await h.call(kind, `${key}=${OTHER}`), 400);
    assert.equal(h.state.projectionCalls, 0); assert.equal(h.state.rpcs[0].args.p_hackathon_id, EVENT);
  });
  test(`${kind}: organizer A cannot retrieve/export event B`, async () => {
    const h = harness(); privateResponse(await h.call(kind, '', 'fixture-other'), 403); assert.equal(h.state.projectionCalls, 0);
    assert.equal(h.state.rpcs[0].args.p_hackathon_id, OTHER);
  });
  for (const [label, options, status] of [ ['SQL denied after access check', { projectionError: { code: '42501', message: 'PRIVATE_SQL_DETAIL' } }, 403], ['RPC unavailable', { projectionError: { code: 'PGRST202', message: 'PRIVATE_SQL_DETAIL' } }, 500], ['database failure', { projectionError: { code: 'XX000', message: 'PRIVATE_SQL_DETAIL' } }, 500], ['thrown RPC', { throwProjection: true }, 500], ['deadline', { aborted: true }, 504] ]) test(`${kind}: ${label} is not empty success`, async () => {
    const h = harness(options); const response = await h.call(kind); privateResponse(response, status); assert(response.headers.get('content-type').includes('application/json')); assert(!(await response.text()).includes('PRIVATE_'));
  });
}
test('overview returns only eight approved HackerMate metrics', async () => {
  const h = harness(); const response = await h.call(); privateResponse(response, 200); const body = await response.json();
  assert.equal(body.section, 'overview'); assert.equal(body.eventId, EVENT); assert.equal(Object.keys(body.metrics).length, 8); assert.equal(body.metrics.registration_count, 3); assert(!JSON.stringify(body).includes('official')); assert(Number.isFinite(Date.parse(body.retrievedAt)));
});
for (const value of [null, [], [{}], [{ registration_count: 0 }], [{ registration_count: -1 }]]) test(`invalid overview ${JSON.stringify(value)} never becomes zero`, async () => {
  const h = harness({ project: () => ({ data: value, error: null }) }); privateResponse(await h.call(), 500);
});
const filters = [
  ['search=Builder%201', 1, { p_search: 'Builder 1' }], ['college=College%20A', 2, { p_college: 'College A' }], ['skill=REACT', 2, { p_skill: 'REACT' }], ['status=waitlisted', 1, { p_status: 'waitlisted' }], ['teamState=in_team', 2, { p_team_state: 'in_team' }], ['teamState=without_team', 1, { p_team_state: 'without_team' }], ['lookingForTeam=true', 2, { p_looking_for_team: true }], ['lookingForTeam=false', 1, { p_looking_for_team: false }], ['college=College%20A&skill=react&status=confirmed&teamState=in_team&lookingForTeam=true', 1, { p_college: 'College A', p_skill: 'react', p_status: 'confirmed', p_team_state: 'in_team', p_looking_for_team: true }], ['search=%20%20&college=', 3, { p_search: null, p_college: null }], ['search=%27%25_%3D', 0, { p_search: "'%_=" }],
];
for (const [query, expected, args] of filters) test(`participant filter ${query} has independent SQL total and shared export scope`, async () => {
  const data = harness(), csv = harness(); const response = await data.call('api', `section=participants&pageSize=1&${query}`); privateResponse(response, 200); const body = await response.json(); assert.equal(body.pagination.total, expected); assert.equal(body.rows.length, Math.min(1, expected));
  const exported = await csv.call('export', query); privateResponse(exported, 200); assert.equal(exported.headers.get('x-export-row-count'), String(expected));
  for (const [key, value] of Object.entries(args)) { assert.equal(data.state.rpcs[1].args[key], value); assert.equal(csv.state.rpcs[1].args[key], value); }
});
for (const sort of ['newest', 'oldest', 'name_asc', 'name_desc']) test(`participant sort ${sort} uses parameter, not expression`, async () => {
  const h = harness(); privateResponse(await h.call('api', `section=participants&sort=${sort}`), 200); assert.equal(h.state.rpcs[1].args.p_sort, sort);
});
test('participant page retains filtered total beyond page length and excludes PII recursively', async () => {
  const h = harness({ rows: Array.from({ length: 105 }, (_, n) => participant(n + 1)) }); const response = await h.call('api', 'section=participants&page=2&pageSize=100'); const body = await response.json(); privateResponse(response, 200); assert.equal(body.rows.length, 5); assert.deepEqual(body.pagination, { page: 2, pageSize: 100, total: 105, totalPages: 2, hasNext: false }); assert.equal(h.state.rpcs[1].args.p_offset, 100); assert(!JSON.stringify(body).includes('PRIVATE_'));
});
const teamFilters = [['search=Team%201', 1, 'p_search', 'Team 1'], ['recruiting=true', 2, 'p_recruiting', true], ['recruiting=false', 1, 'p_recruiting', false], ['minMembers=3', 2, 'p_min_members', 3], ['maxMembers=2', 1, 'p_max_members', 2], ['sizeState=within_limits', 3, 'p_size_state', 'within_limits'], ['sizeState=above_max', 0, 'p_size_state', 'above_max'], ['sizeState=below_min', 0, 'p_size_state', 'below_min'], ['sizeState=unknown_limits', 0, 'p_size_state', 'unknown_limits']];
for (const [query, expected, key, value] of teamFilters) test(`team filter ${query} scopes RPC and independent total`, async () => {
  const h = harness(); const response = await h.call('api', `section=teams&pageSize=1&${query}`); privateResponse(response, 200); const body = await response.json(); assert.equal(body.pagination.total, expected); assert(body.rows.length <= 1); assert.equal(h.state.rpcs[1].args[key], value); assert(!JSON.stringify(body).includes('PRIVATE_'));
});
for (const sort of ['newest', 'oldest', 'name_asc', 'name_desc', 'size_asc', 'size_desc']) test(`team sort ${sort} is allowlisted`, async () => { const h = harness(); privateResponse(await h.call('api', `section=teams&sort=${sort}`), 200); assert.equal(h.state.rpcs[1].args.p_sort, sort); });
test('combined team filters pass validated recorded size semantics', async () => { const h = harness(); const response = await h.call('api', 'section=teams&search=Team&recruiting=true&minMembers=2&maxMembers=4&sizeState=within_limits&page=2&pageSize=1'); const body = await response.json(); privateResponse(response, 200); assert.equal(body.rows.length, 1); assert.equal(body.pagination.total, 2); assert.equal(h.state.rpcs[1].args.p_offset, 1); });
const invalid = ['section=chat', 'section=', 'section=overview&page=1', 'section=overview&search=a', 'section=participants&page=0', 'section=participants&page=-1', 'section=participants&page=1.5', 'section=participants&page=01', 'section=participants&page=Infinity', 'section=participants&pageSize=0', 'section=participants&pageSize=101', 'section=participants&pageSize=1&page=1000002', 'section=participants&page=10002&pageSize=100', 'section=participants&status=attended', 'section=participants&teamState=successful', 'section=participants&lookingForTeam=1', 'section=participants&sort=created_at.desc', 'section=participants&sort=name_asc&sort=newest', 'section=participants&search='+ 'a'.repeat(201), 'section=participants&skill='+ 'a'.repeat(101), 'section=teams&recruiting=yes', 'section=teams&sizeState=successful', 'section=teams&minMembers=-1', 'section=teams&maxMembers=2147483648', 'section=teams&minMembers=4&maxMembers=2', 'section=teams&sort=workspace', 'section=teams&skill=react'];
for (const query of invalid) test(`API rejects invalid query ${query.slice(0, 75)}`, async () => { const h = harness(); privateResponse(await h.call('api', query), 400); assert.equal(h.state.projectionCalls, 0); });
test('maximum permitted offset and empty beyond-total page remain valid', async () => { const h = harness(); const response = await h.call('api', 'section=participants&page=10001&pageSize=100'); privateResponse(response, 200); const body = await response.json(); assert.equal(body.rows.length, 0); assert.equal(body.pagination.total, 3); assert.equal(h.state.rpcs[1].args.p_offset, 1000000); });
for (const value of [null, [], { total: 0, offset: 0, limit: 50 }, { total: 1, offset: 0, limit: 50, items: [] }, { total: 0, offset: 1, limit: 50, items: [] }, { total: 0, offset: 0, limit: 100, items: [] }]) test(`invalid list envelope ${JSON.stringify(value)} fails closed`, async () => { const h = harness({ project: () => ({ data: value, error: null }) }); privateResponse(await h.call('api', 'section=participants'), 500); });
for (const patch of [{ skills: null }, { user_id: 'bad' }, { status: 'attended' }, { looking_for_team: null }, { created_at: 'bad' }, { event_teams: [{ team_id: 'bad', team_name: 'name' }] }]) test(`malformed participant ${JSON.stringify(patch)} is not serialized`, async () => { const h = harness({ rows: [participant(1, patch)] }); privateResponse(await h.call('api', 'section=participants'), 500); });

test('team projection handles nullable recorded role entries without inferring private fields', async () => {
  const { team } = require('./partner-organizer-harness.cjs');
  const h = harness({ teams: [team(1, { roles_needed: ['Designer', null], is_recruiting: null })] });
  const response = await h.call('api', 'section=teams'); privateResponse(response, 200); const body = await response.json();
  assert.deepEqual(body.rows[0].roles_needed, ['Designer']); assert.equal(body.rows[0].is_recruiting, null); assert(!JSON.stringify(body).includes('PRIVATE_'));
});
