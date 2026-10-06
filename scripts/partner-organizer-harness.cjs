/* eslint-disable @typescript-eslint/no-require-imports -- Shared offline route harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const ROOT = path.resolve(__dirname, '..');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = id(1), EVENT = id(101), OTHER = id(102), NATIVE = id(103), PARTNER = id(201);
function participant(n, extra = {}) {
  return { user_id: id(1000 + n), full_name: `Builder ${n}`, college: n % 2 ? 'College A' : 'College B', skills: n % 2 ? ['react', 'sql'] : ['python'], status: n % 3 ? 'confirmed' : 'waitlisted', looking_for_team: Boolean(n % 2), created_at: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(), event_teams: n % 2 ? [{ team_id: id(3001), team_name: 'Alpha', workspace_secret: 'PRIVATE_WORKSPACE' }] : [], email: 'PRIVATE_EMAIL@example.invalid', phone: 'PRIVATE_PHONE', metadata: { secret: 'PRIVATE_METADATA' }, role: 'PRIVATE_ROLE', is_banned: false, ...extra };
}
function team(n, extra = {}) {
  const members = n + 1;
  return { team_id: id(3000 + n), team_name: `Team ${n}`, member_count: members, registered_member_count: members - 1, is_recruiting: Boolean(n % 2), roles_needed: ['Designer'], max_members: 6, event_min_team_size: 2, event_max_team_size: 4, roster: Array.from({ length: members }, (_, i) => ({ user_id: id(1000 + i), full_name: `Member ${i}`, registered_for_event: i > 0, email: 'PRIVATE_ROSTER_EMAIL', role: 'PRIVATE_ROLE' })), chat: 'PRIVATE_CHAT', tasks: 'PRIVATE_TASKS', resources: 'PRIVATE_RESOURCES', evaluations: 'PRIVATE_EVALUATION', ...extra };
}
function harness(options = {}) {
  const state = { queries: [], rpcs: [], clients: [], logs: [], signals: [], projectionCalls: 0, ...options };
  const user = options.user === null ? null : { id: USER, email: 'fixture@example.invalid', ...options.user };
  const profile = options.profile === null ? null : { role: 'user', is_banned: false, ...options.profile };
  const registrations = options.rows || [participant(1), participant(2), participant(3)];
  const teams = options.teams || [team(1), team(2), team(3)];
  const partnerMap = { 'fixture-event': { id: PARTNER, hackathon_id: EVENT }, 'fixture-other': { id: id(202), hackathon_id: OTHER }, 'native-event': { id: id(203), hackathon_id: NATIVE }, 'unlinked-event': { id: id(204), hackathon_id: null } };
  const privateError = { code: 'XX000', message: 'PRIVATE_SQL_DETAIL', details: 'PRIVATE_EMAIL' };
  function client(authenticated) {
    return {
      auth: { async getUser() { return { data: { user: authenticated ? user : null }, error: options.authError || null }; } },
      from(table) {
        assert(['profiles', 'partner_configs', 'hackathons'].includes(table), 'No raw registration/team or service read');
        const query = { table, filters: [], columns: null }; state.queries.push(query);
        const builder = { select(columns) { query.columns = columns; return builder; }, eq(key, value) { query.filters.push([key, value]); return builder; }, async maybeSingle() {
          if (options.throwLookup === table) throw new Error('PRIVATE_LOOKUP_EXCEPTION');
          const value = query.filters[0]?.[1];
          return { data: table === 'profiles' ? profile : table === 'partner_configs' ? (Object.hasOwn(options, 'partner') ? options.partner : partnerMap[value] || null) : options.missingEvent ? null : { id: value }, error: options.lookupError === table ? privateError : null };
        } };
        return builder;
      },
      rpc(name, args) {
        assert(authenticated, 'RPC must retain caller session');
        state.rpcs.push({ name, args: { ...args } });
        let signal;
        const query = { abortSignal(value) { signal = value; state.signals.push(value); return query; }, then(resolve, reject) {
          if (name === 'can_access_partner_event') return Promise.resolve({ data: (options.allowedEvents || [EVENT]).includes(args.p_hackathon_id), error: options.accessError || null }).then(resolve, reject);
          const call = ++state.projectionCalls;
          if (options.throwProjection) return Promise.reject(new Error('PRIVATE_RPC_EXCEPTION')).then(resolve, reject);
          if (signal?.aborted) return Promise.resolve({ data: null, error: { code: '20' } }).then(resolve, reject);
          if (options.projectionError && (!options.errorOnCall || options.errorOnCall === call)) return Promise.resolve({ data: null, error: options.projectionError }).then(resolve, reject);
          if (options.project) return Promise.resolve(options.project(name, args, call, state)).then(resolve, reject);
          if (name === 'get_partner_organizer_overview') return Promise.resolve({ data: [{ registration_count: registrations.length, confirmed_count: registrations.filter(r => r.status === 'confirmed').length, waitlisted_count: registrations.filter(r => r.status === 'waitlisted').length, team_count: teams.length, participants_in_team: 2, participants_without_team: 1, looking_for_team_count: 2, looking_without_team_count: 0, official_registrations: 'PRIVATE_UNSUPPORTED_METRIC' }], error: null }).then(resolve, reject);
          let rows = name === 'list_partner_organizer_participants' ? registrations : teams;
          const lower = value => (value || '').trim().toLowerCase();
          if (args.p_search) rows = rows.filter(r => lower(name === 'list_partner_organizer_participants' ? r.full_name : r.team_name).includes(lower(args.p_search)) || (name === 'list_partner_organizer_participants' && lower(r.college).includes(lower(args.p_search))));
          if (args.p_college) rows = rows.filter(r => lower(r.college) === lower(args.p_college));
          if (args.p_skill) rows = rows.filter(r => r.skills.includes(lower(args.p_skill)));
          if (args.p_status) rows = rows.filter(r => r.status === args.p_status);
          if (args.p_team_state === 'in_team') rows = rows.filter(r => r.event_teams.length > 0);
          if (args.p_team_state === 'without_team') rows = rows.filter(r => r.event_teams.length === 0);
          if (args.p_looking_for_team !== null && args.p_looking_for_team !== undefined) rows = rows.filter(r => r.looking_for_team === args.p_looking_for_team);
          if (args.p_recruiting !== null && args.p_recruiting !== undefined) rows = rows.filter(r => r.is_recruiting === args.p_recruiting);
          if (args.p_min_members !== null && args.p_min_members !== undefined) rows = rows.filter(r => r.member_count >= args.p_min_members);
          if (args.p_max_members !== null && args.p_max_members !== undefined) rows = rows.filter(r => r.member_count <= args.p_max_members);
          if (args.p_size_state === 'below_min') rows = rows.filter(r => r.member_count < 2);
          if (args.p_size_state === 'above_max') rows = rows.filter(r => r.member_count > 4);
          if (args.p_size_state === 'within_limits') rows = rows.filter(r => r.member_count >= 2 && r.member_count <= 4);
          if (args.p_size_state === 'unknown_limits') rows = rows.filter(r => r.event_min_team_size === null);
          return Promise.resolve({ data: { total: rows.length, offset: args.p_offset, limit: args.p_limit, items: rows.slice(args.p_offset, args.p_offset + args.p_limit) }, error: null }).then(resolve, reject);
        } };
        return query;
      },
    };
  }
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'service-must-never-be-used' };
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const exports = {}; cache.set(relative, exports);
    const mocks = {
      'next/server': { NextRequest, NextResponse },
      '@supabase/supabase-js': { createClient(url, key, config) { assert.equal(url, env.NEXT_PUBLIC_SUPABASE_URL); assert.equal(key, 'fixture-anon', 'No service-role client'); state.clients.push({ key, kind: 'token', config }); return client(config?.global?.headers?.Authorization === 'Bearer fixture-session'); } },
      '@supabase/ssr': { createServerClient(url, key, config) { assert.equal(url, env.NEXT_PUBLIC_SUPABASE_URL); assert.equal(key, 'fixture-anon'); state.clients.push({ key, kind: 'cookie' }); return client(config.cookies.getAll().some(cookie => cookie.name === 'fixture-session')); } },
    };
    const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`); if (name.startsWith('./')) return load(path.posix.join(path.posix.dirname(relative), `${name.slice(2)}.ts`)); throw new Error(`Unmocked ${name}`); }, process: { env }, Buffer, URL, URLSearchParams, AbortSignal: options.aborted ? { timeout() { const controller = new AbortController(); controller.abort(); return controller.signal; } } : AbortSignal, Date, console: { error(...args) { state.logs.push(args); } }, fetch() { throw new Error('Network forbidden'); } }, { filename: relative });
    return exports;
  }
  async function call(kind = 'api', query = '', slug = 'fixture-event', { cookie = false } = {}) {
    const url = `http://127.0.0.1/api/partners/${slug}/organizer${kind === 'export' ? '/export' : ''}${query ? `?${query}` : ''}`;
    const req = new NextRequest(url, { headers: cookie ? { Cookie: 'fixture-session=valid' } : { Authorization: 'Bearer fixture-session' } });
    const handler = load(`src/app/api/partners/[slug]/organizer/${kind === 'export' ? 'export/' : ''}route.ts`).GET;
    return handler(req, { params: Promise.resolve({ slug }) });
  }
  return { state, call, load };
}
module.exports = { harness, id, participant, team, USER, EVENT, OTHER, NATIVE };
