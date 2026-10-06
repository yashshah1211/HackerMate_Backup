/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-module compatibility harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const jsxRuntime = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');
const ROOT = path.resolve(__dirname, '..');
const USER = '00000000-0000-4000-8000-000000000001';
const EVENT = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
const defaultRegistration = { id: 'own-registration', user_id: USER, team_id: null, status: 'waitlisted', looking_for_team: true, metadata: { preserved: 'private', event_track: 'old' } };
const builder = { user_id: USER, full_name: 'Visible Builder', college: 'College', avatar_url: null, skills: ['react'] };

function fixture(options = {}) {
  const state = { user: { id: USER }, authError: null, registration: { ...defaultRegistration },
    rpcError: null, selfError: null, mutationError: null, discoveryRows: [builder], total: 1,
    counts: { registration_count: 1005, confirmed_count: 900, waitlisted_count: 105 },
    queries: [], rpcs: [], ...options };
  const hackathon = { id: EVENT, name: 'Legacy Event', description: 'Build together', type: 'external',
    start_date: '2028-01-01', end_date: '2028-01-03', website_url: 'https://example.invalid/register',
    tags: [], min_team_size: 1, max_team_size: 4, max_participants: null, location: null, mode: 'online',
    organizer_id: null, prize_pool: null, ...options.hackathon };
  const team = { id: 'team-one', name: 'Linked Team', owner_id: USER, description: '', skills: [], roles_needed: [], max_members: 4, team_members: [], is_recruiting: true, team_hackathons: [{ hackathon_id: EVENT }] };
  const partner = { id: 'partner-one', slug: 'axcentra', hackathon_id: EVENT, partner_name: 'HackerMate x Axcentra', features: {}, ...options.partner };
  const client = {
    auth: { async getUser() { return { data: { user: state.user }, error: state.authError }; } },
    async rpc(name, args) {
      state.rpcs.push({ name, args });
      if (state.rpcError) return { data: null, error: state.rpcError };
      if (name === 'get_hackathon_registration_counts') return { data: state.counts === null ? null : [state.counts], error: null };
      assert.equal(name, 'list_event_discovery_builders');
      return { data: { items: state.discoveryRows.slice(args.p_offset, args.p_offset + 50), total: state.total, offset: args.p_offset, limit: 50 }, error: null };
    },
    from(table) {
      const record = { table, columns: null, filters: [], operation: 'read', payload: null };
      state.queries.push(record);
      let single = false;
      const query = {
        select(columns) { record.columns = columns; return query; },
        eq(column, value) { record.filters.push([column, value]); return query; },
        in(column, value) { record.filters.push([column, value]); return query; },
        order() { return query; },
        insert(payload) { record.operation = 'insert'; record.payload = payload; return query; },
        update(payload) { record.operation = 'update'; record.payload = payload; return query; },
        delete() { record.operation = 'delete'; return query; },
        maybeSingle() { single = true; return query; },
        single() { single = true; return query; },
        then(resolve, reject) { return Promise.resolve().then(() => response()).then(resolve, reject); },
      };
      function response() {
        if (table === 'hackathon_registrations') {
          // Simulate future restrictive RLS. Every read/update/delete must be
          // current-user AND event scoped; public breadth is a test failure.
          if (record.operation !== 'insert') {
            assert.deepEqual(record.filters, [['hackathon_id', EVENT], ['user_id', state.user?.id]]);
          } else { assert.equal(record.payload.user_id, state.user?.id); assert.equal(record.payload.hackathon_id, EVENT); }
          assert(record.columns === null || !record.columns.includes('*'));
          if (state.selfError && record.operation === 'read') return { data: null, error: state.selfError };
          if (state.mutationError && record.operation !== 'read') {
            const error = state.mutationError;
            if (error.code === '23505' && state.concurrentRegistration) { state.registration = { ...state.concurrentRegistration }; state.mutationError = null; }
            return { data: null, error };
          }
          if (record.operation === 'update' && state.registration) Object.assign(state.registration, record.payload);
          if (record.operation === 'insert') state.registration = { id: 'created-registration', team_id: null, metadata: null, looking_for_team: false, ...record.payload };
          if (record.operation === 'delete') { const removed = state.registration; state.registration = null; return { data: removed ? [{ id: removed.id }] : [], error: null }; }
          return { data: state.registration, error: null };
        }
        const rows = { hackathons: [hackathon], partner_configs: [partner], profiles: [{ full_name: 'Current Builder', skills: ['react'] }],
          teams: [team], team_hackathons: record.columns.includes('teams') ? [{ team_id: team.id, teams: team }] : [{ team_id: team.id, hackathon_id: EVENT }],
          user_badges: [], saved_hackathons: [], hackathon_resources: [], hackathon_stages: [] }[table];
        assert(rows, 'Unexpected table: ' + table);
        return { data: single ? rows[0] || null : rows, error: null };
      }
      return query;
    },
  };
  return { state, client, hackathon, partner };
}

function loadModule(relative, overrides = {}, globals = {}) {
  const exports = {};
  const filename = path.join(ROOT, relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, console: { error() {}, warn() {} }, setTimeout, clearTimeout,
    require(name) { return Object.hasOwn(overrides, name) ? overrides[name] : require(name); },
    fetch() { throw new Error('Network forbidden'); },
    ...globals,
  }, { filename });
  return exports;
}
const api = loadModule('src/lib/hackathons/eventParticipation.ts');
function plain(value) {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(plain).join(' ');
  if (typeof value === 'object') return plain(value.props?.children);
  return String(value);
}

async function pageHarness(kind, options = {}) {
  const fixtureData = fixture(options);
  const slots = [], dependencies = [], effects = [], controls = [];
  let index = 0;
  const hooks = {
    ...React,
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useEffect(callback, deps) { const i = index++; if (!dependencies[i] || deps.some((v, j) => v !== dependencies[i][j])) { dependencies[i] = deps; effects.push(callback); } },
    useRef(initial) { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
  };
  const component = name => function Stub(props) {
    if (name === 'Dialog' && !props.open) return null;
    if (name === 'Button' || name === 'Segmented') controls.push({ name, ...props, text: plain(props.children) });
    const tag = name === 'Button' ? 'button' : name === 'ButtonLink' || name === 'Link' ? 'a' : 'div';
    return React.createElement(tag, { href: props.href, disabled: props.disabled, 'data-component': name },
      props.children, props.title, props.body, props.detail, props.name, props.label,
      props.description, name === 'Dialog' ? props.footer : null,
      name === 'Stat' ? props.value : null,
      name === 'Segmented' ? props.options.map(option => option.label + (option.count === undefined ? '' : ' ' + option.count)).join(' ') : null);
  };
  const system = new Proxy({}, { get: (_, name) => name === '__esModule' ? false : name === 'buttonClass' ? () => '' : component(name) });
  const icons = new Proxy({}, { get: (_, name) => name === '__esModule' ? false : () => React.createElement('svg') });
  const page = loadModule(kind === 'partner' ? 'src/app/partners/[slug]/page.tsx' : 'src/app/hackathons/[id]/page.tsx', {
    react: hooks, 'next/navigation': { useParams: () => ({ slug: fixtureData.partner.slug, id: EVENT }), useRouter: () => ({ push(url) { fixtureData.state.navigation = url; } }) },
    'react/jsx-runtime': { ...jsxRuntime,
      jsx(type, props, key) { if (type === 'button' && props.role === 'tab') controls.push({ ...props, text: plain(props.children) }); return jsxRuntime.jsx(type, props, key); },
      jsxs(type, props, key) { if (type === 'button' && props.role === 'tab') controls.push({ ...props, text: plain(props.children) }); return jsxRuntime.jsxs(type, props, key); },
    },
    'next/link': component('Link'), 'lucide-react': icons, '@/lib/supabase': { supabase: fixtureData.client },
    '@/lib/hackathons/eventParticipation': api, '@/lib/utils': { cn: () => '' },
    '@/components/system': system, '@/components/landing/primitives': { Container: component('Container'), Eyebrow: component('Eyebrow') },
    '@/context/NotificationContext': { useNotification: () => ({ showToast() {}, confirm() {} }) },
    '@/components/AuthGuard': props => props.children,
    '@/components/CertificateModal': () => null, '@/components/ShareModal': () => null, '@/components/VerifiedBuilderBadge': () => null,
    '@/components/StructuredHackathonDescription': () => null, '@/lib/hackathons/prizeDisplay': { formatPrizeDisplay: () => null },
    '@/lib/time': { eventTimeline: () => ({ state: 'upcoming' }) }, '@/lib/teamCategory': { getTeamCategoryInfo: () => ({}) },
  }, { window: { location: { origin: 'https://app.example.invalid' }, open(url) { fixtureData.state.externalURL = url; } } });
  function render() { index = 0; controls.length = 0; return renderToStaticMarkup(React.createElement(page.default)); }
  let html = render();
  for (const effect of effects.splice(0)) effect();
  await new Promise(resolve => setImmediate(resolve));
  html = render();
  return { ...fixtureData, get html() { return html; }, controls,
    async tab(value) {
      const segmented = controls.find(control => control.name === 'Segmented');
      if (segmented) segmented.onChange(value);
      else {
        const label = { builders: 'Builders', looking_for_teams: 'Looking for teams' }[value];
        const tab = controls.find(control => control.role === 'tab' && control.text.startsWith(label));
        assert(tab, 'Missing tab ' + value); tab.onClick();
      }
      html = render();
    },
    async click(text) { const control = controls.find(control => control.name === 'Button' && control.text.includes(text)); assert(control, 'Missing button ' + text); assert(!control.disabled); await control.onClick(); await new Promise(resolve => setImmediate(resolve)); html = render(); },
  };
}

test('safe discovery RPC is event-scoped and drops unexpected PII', async () => {
  const { client, state } = fixture({ discoveryRows: [{ ...builder, email: 'private', phone: 'private', metadata: { secret: 1 }, role: 'admin' }] });
  const result = await api.loadEventDiscovery(client, EVENT);
  assert.equal(result.total, 1);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.deepEqual(Object.keys(result.items[0]).sort(), ['avatar_url','college','full_name','id','skills']);
  assert.equal(state.queries.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(state.rpcs[0])), { name: 'list_event_discovery_builders', args: { p_hackathon_id: EVENT, p_offset: 0, p_limit: 50 } });
});
test('discovery empty is valid; RPC failure/denial/missing projection is not empty success', async () => {
  assert.equal((await api.loadEventDiscovery(fixture({ discoveryRows: [], total: 0 }).client, EVENT)).total, 0);
  for (const error of [{ code: 'PGRST202' }, { code: '42501' }, { code: 'XX000' }]) {
    await assert.rejects(api.loadEventDiscovery(fixture({ rpcError: error }).client, EVENT), e => e.kind === (error.code === '42501' ? 'unauthorized' : 'unavailable'));
  }
  await assert.rejects(api.loadEventDiscovery(fixture({ total: null }).client, EVENT));
});
test('counts use aggregate fields, not page length; zero is valid', async () => {
  const { client, state } = fixture();
  const counts = await api.loadEventRegistrationCounts(client, EVENT);
  assert.equal(counts.registration_count, 1005); assert.equal(state.queries.length, 0);
  assert.equal(state.rpcs[0].name, 'get_hackathon_registration_counts');
  assert.equal((await api.loadEventRegistrationCounts(fixture({ counts: { registration_count: 0, confirmed_count: 0, waitlisted_count: 0 } }).client, EVENT)).registration_count, 0);
});
for (const invalid of [null, { registration_count: -1 }, { registration_count: '0', confirmed_count: 0, waitlisted_count: 0 },
  { registration_count: 1, confirmed_count: 2, waitlisted_count: 0 }]) {
  test('malformed aggregate cannot become zero: ' + JSON.stringify(invalid), async () => {
    await assert.rejects(api.loadEventRegistrationCounts(fixture({ counts: invalid }).client, EVENT));
  });
}
test('count RPC failure is unavailable and cannot fall back to raw rows', async () => {
  const { client, state } = fixture({ rpcError: { code: 'PGRST202' } });
  await assert.rejects(api.loadEventRegistrationCounts(client, EVENT)); assert.equal(state.queries.length, 0);
});
test('own participation binds identity to getUser and rejects another returned user', async () => {
  const { client, state } = fixture();
  assert.equal((await api.loadOwnEventParticipation(client, EVENT)).registration.user_id, USER);
  assert.deepEqual(state.queries[0].filters, [['hackathon_id', EVENT], ['user_id', USER]]);
  assert(!state.queries[0].columns.includes('profiles'));
  await assert.rejects(api.loadOwnEventParticipation(fixture({ registration: { ...defaultRegistration, user_id: OTHER } }).client, EVENT));
});
test('signed-out participation does not read raw rows; self/auth failures are not unregistered', async () => {
  const { client, state } = fixture({ user: null, authError: { name: 'AuthSessionMissingError' } });
  assert.equal((await api.loadOwnEventParticipation(client, EVENT)).userId, null); assert.equal(state.queries.length, 0);
  await assert.rejects(api.loadOwnEventParticipation(fixture({ selfError: { code: '42501' } }).client, EVENT));
  await assert.rejects(api.loadOwnEventParticipation(fixture({ authError: { name: 'AuthError' } }).client, EVENT));
});
test('disabling/repeated toggles preserve registration ID/status/team/metadata and never delete', async () => {
  const { client, state } = fixture({ registration: { ...defaultRegistration, team_id: 'own-team' } });
  for (const enabled of [false, false, true, true, false]) await api.setOwnDiscoveryPreference(client, EVENT, enabled, { allowCreate: true, maxParticipants: 1 });
  assert.equal(state.registration.id, defaultRegistration.id); assert.equal(state.registration.status, 'waitlisted');
  assert.equal(state.registration.team_id, 'own-team'); assert.deepEqual(state.registration.metadata, defaultRegistration.metadata);
  assert(state.queries.every(query => query.operation === 'read' || query.operation === 'update'));
  assert(state.queries.filter(query => query.operation === 'update').every(query => Object.keys(query.payload).join() === 'looking_for_team'));
  assert.equal(state.rpcs.length, 0);
});
test('track preference merges only own metadata while preserving existing participation', async () => {
  const { client, state } = fixture();
  await api.setOwnDiscoveryPreference(client, EVENT, true, { allowCreate: true, metadataPatch: { event_track: 'new' } });
  assert.equal(state.registration.metadata.preserved, 'private'); assert.equal(state.registration.metadata.event_track, 'new');
  assert.equal(state.registration.status, 'waitlisted');
});
test('external community opt-in creates only own row once; repeated opt-in updates preference', async () => {
  const { client, state } = fixture({ registration: null });
  await api.setOwnDiscoveryPreference(client, EVENT, true, { allowCreate: true, maxParticipants: 900 });
  await api.setOwnDiscoveryPreference(client, EVENT, true, { allowCreate: true, maxParticipants: 900 });
  assert.equal(state.registration.status, 'waitlisted');
  assert.equal(state.queries.filter(query => query.operation === 'insert').length, 1);
  assert(!('verified' in state.registration)); assert.equal(state.rpcs[0].name, 'get_hackathon_registration_counts');
});
test('off on an absent row does not create/delete; native opt-in requires participation', async () => {
  const { client, state } = fixture({ registration: null });
  await api.setOwnDiscoveryPreference(client, EVENT, false, { allowCreate: true });
  await assert.rejects(api.setOwnDiscoveryPreference(client, EVENT, true, { allowCreate: false }));
  assert(state.queries.every(query => query.operation === 'read'));
});
test('capacity failure blocks creation, update failure cannot report success', async () => {
  const first = fixture({ registration: null, rpcError: { code: 'XX000' } });
  await assert.rejects(api.setOwnDiscoveryPreference(first.client, EVENT, true, { allowCreate: true, maxParticipants: 2 }));
  assert(first.state.queries.every(query => query.operation === 'read'));
  await assert.rejects(api.setOwnDiscoveryPreference(fixture({ mutationError: { code: '42501' } }).client, EVENT, false, { allowCreate: true }));
});
test('concurrent community creation preserves the existing row rather than upserting over it', async () => {
  const { client, state } = fixture({ registration: null, mutationError: { code: '23505' }, concurrentRegistration: { ...defaultRegistration, team_id: 'concurrent-team' } });
  await api.setOwnDiscoveryPreference(client, EVENT, true, { allowCreate: true });
  assert.equal(state.registration.id, defaultRegistration.id); assert.equal(state.registration.team_id, 'concurrent-team');
  assert.equal(state.registration.status, 'waitlisted'); assert.deepEqual(state.registration.metadata, defaultRegistration.metadata);
  assert.equal(state.queries.filter(query => query.operation === 'insert').length, 1);
});
test('inconsistent page envelope is unavailable rather than a misleading empty list', async () => {
  await assert.rejects(api.loadEventDiscovery(fixture({ discoveryRows: [], total: 1 }).client, EVENT));
});
for (const kind of ['partner', 'event']) {
  test(kind + ' real page renders with restrictive self-only registration reads and legacy team links', async () => {
    const page = await pageHarness(kind);
    assert(page.html.includes('Legacy Event') || page.html.includes('AXCENTRA'));
    assert(page.html.includes('Linked Team'));
    if (kind === 'event') assert(page.html.includes('/teams/create?hackathon=' + EVENT));
    else { await page.click('Create'); assert(page.state.navigation.startsWith('/teams/create?hackathon=' + EVENT)); }
    await page.tab('builders'); assert(page.html.includes('Visible Builder'));
    assert(page.state.queries.every(query => query.table !== 'team_members'));
    assert(page.state.rpcs.some(rpc => rpc.name === 'list_event_discovery_builders'));
    if (kind === 'event') assert(page.html.includes('1005'));
  });
  test(kind + ' discovery unavailable differs from valid empty rendering', async () => {
    const empty = await pageHarness(kind, { discoveryRows: [], total: 0 }); await empty.tab('builders');
    assert(empty.html.includes('No builders') || empty.html.includes('No discoverable builders'));
    const failed = await pageHarness(kind, { rpcError: { code: 'PGRST202' } }); await failed.tab('builders');
    assert(failed.html.includes('unavailable')); assert(!failed.html.includes('No builders yet')); assert(!failed.html.includes('No discoverable builders listed yet'));
  });
  test(kind + ' own query failure remains unavailable and discovery toggle is disabled', async () => {
    const page = await pageHarness(kind, { selfError: { code: '42501' } }); await page.tab(kind === 'event' ? 'looking_for_teams' : 'builders');
    assert(page.html.includes('not available to your session') || page.html.includes('Participation state unavailable'));
    assert(!page.html.includes('You have not joined'));
  });
}
test('signed-out legacy partner renders public discovery without self reads', async () => {
  const page = await pageHarness('partner', { user: null, authError: { name: 'AuthSessionMissingError' } });
  await page.tab('builders'); assert(page.html.includes('Visible Builder'));
  assert(page.state.queries.every(query => query.table !== 'hackathon_registrations'));
});
test('event discovery-off UI preserves community participation', async () => {
  const page = await pageHarness('event'); await page.tab('looking_for_teams'); await page.click('Stop listing profile');
  assert.equal(page.state.registration.looking_for_team, false); assert.equal(page.state.registration.id, 'own-registration');
  assert(page.state.queries.every(query => query.operation !== 'delete'));
});
test('partner discovery-off UI also preserves registration and private track metadata', async () => {
  const page = await pageHarness('partner'); await page.click('Looking for team');
  assert.equal(page.state.registration.looking_for_team, false); assert.equal(page.state.registration.status, 'waitlisted');
  assert.deepEqual(page.state.registration.metadata, defaultRegistration.metadata);
  assert(page.state.queries.every(query => query.operation !== 'delete'));
});
test('native event page still loads self state and safe aggregate counts', async () => {
  const page = await pageHarness('event', { hackathon: { type: 'native' } });
  assert(page.html.includes('Registered')); assert(page.html.includes('1005'));
  assert(page.state.rpcs.some(rpc => rpc.name === 'get_hackathon_registration_counts'));
});
test('native registration capacity uses the RPC and records only the signed-in participant', async () => {
  const page = await pageHarness('event', { registration: null, hackathon: { type: 'native', max_participants: 2 } });
  await page.click('Register'); await page.click('Confirm');
  assert.equal(page.state.registration.user_id, USER); assert.equal(page.state.registration.status, 'waitlisted');
  assert(page.state.rpcs.filter(rpc => rpc.name === 'get_hackathon_registration_counts').length >= 2);
  assert.equal(page.state.queries.filter(query => query.table === 'hackathon_registrations' && query.operation === 'insert').length, 1);
});
test('native count failure blocks registration instead of assuming zero capacity usage', async () => {
  const page = await pageHarness('event', { registration: null, hackathon: { type: 'native', max_participants: 2 }, rpcError: { code: 'PGRST202' } });
  await page.click('Register'); await page.click('Confirm');
  assert.equal(page.state.registration, null);
  assert(page.state.queries.every(query => query.operation !== 'insert'));
});
test('external CTA opens the official URL and community join does not verify official registration', async () => {
  const page = await pageHarness('event', { registration: null });
  await page.click('Register on event site'); assert.equal(page.state.externalURL, 'https://example.invalid/register');
  assert(page.html.includes('does not verify official event registration'));
  await page.click('Join community'); assert.equal(page.state.registration.user_id, USER);
  assert.equal(page.state.registration.looking_for_team, false); assert(!page.html.includes('Registered externally'));
  assert(page.controls.some(control => control.text === 'Register on event site'));
});
for (const kind of ['partner', 'event']) {
  test(kind + ' discovery pagination retains RPC total, without full raw-row loading', async () => {
    const rows = Array.from({ length: 1005 }, (_, i) => ({ ...builder, user_id: 'builder-' + i, full_name: 'Visible ' + String(i).padStart(4, '0') }));
    const page = await pageHarness(kind, { discoveryRows: rows, total: 1005 }); await page.tab('builders');
    assert(page.html.includes('Visible 0000')); assert(page.html.includes('1005 discoverable builders'));
    await page.click('Next'); assert(page.html.includes('Visible 0050')); assert(!page.html.includes('Visible 0000'));
    assert.equal(page.state.rpcs.at(-1).args.p_offset, 50);
    assert(page.state.queries.filter(query => query.table === 'hackathon_registrations').every(query => query.filters.some(([column, value]) => column === 'user_id' && value === USER)));
  });
}
test('event count errors display unavailable, never a zero tally or unregistered state', async () => {
  const page = await pageHarness('event', { rpcError: { code: 'XX000' } });
  assert(page.html.includes('Unavailable')); assert(page.html.includes('Community member'));
});
test('external CTA stays external even after joining community; no verified external claim', async () => {
  const page = await pageHarness('event');
  assert(page.controls.some(control => control.text === 'Register on event site'));
  assert(page.html.includes('Joined HackerMate community')); assert(!page.html.includes('Registered externally'));
  const partnerSource = fs.readFileSync(path.join(ROOT,'src/app/partners/[slug]/page.tsx'),'utf8');
  assert(partnerSource.includes('hackathon.website_url')); // Existing external link remains.
});
test('public source audit: no broad registration discovery/count fallback or team-member inference', () => {
  const partner = fs.readFileSync(path.join(ROOT,'src/app/partners/[slug]/page.tsx'),'utf8');
  const event = fs.readFileSync(path.join(ROOT,'src/app/hackathons/[id]/page.tsx'),'utf8');
  const profile = fs.readFileSync(path.join(ROOT,'src/app/profile/[id]/useProfileData.ts'),'utf8');
  assert(!partner.includes('.from("hackathon_registrations")'));
  assert(!event.includes('registrations.length')); assert(!event.includes('regData')); assert(!event.includes('profile.email'));
  assert(!profile.includes('hackathon_registrations'));
  assert(event.includes('<AuthGuard>')); assert(partner.includes('loadEventDiscovery')); assert(event.includes('loadEventRegistrationCounts'));
});
