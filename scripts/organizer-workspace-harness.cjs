/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-module runtime harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const jsx = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');
const { NextResponse } = require('next/server');
const { harness: apiHarness, id, participant, team, USER, EVENT, OTHER } = require('./partner-organizer-harness.cjs');
const ROOT = path.resolve(__dirname, '..');
const identity = { slug: 'fixture-event', partnerName: 'Fixture Collective', eventId: EVENT, eventName: 'Fixture Build Weekend',
  startDate: null, endDate: null, location: null, mode: null, minTeamSize: null, maxTeamSize: null, archived: false, approvalStatus: null, externalRegistration: true };

function moduleLoader(overrides = {}, globals = {}) {
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const filename = path.join(ROOT, relative), exports = {};
    cache.set(relative, exports);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, { exports, URL, URLSearchParams, AbortSignal, AbortController, Date, Intl, Blob, setTimeout, clearTimeout, process,
      console: { error: (...args) => globals.logs?.push(args) }, fetch() { throw new Error('Network forbidden'); },
      ...globals,
      require(name) {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
        if (name === 'server-only') return {};
        if (name === 'next/link') return function Link({ children, ...props }) { return React.createElement('a', props, children); };
        if (name === 'next/navigation') return { notFound() { throw Error('NEXT_NOT_FOUND'); }, redirect(url) { throw Error('NEXT_REDIRECT:' + url); } };
        if (name.startsWith('@/') || name.startsWith('.')) {
          const target = name.startsWith('@/') ? path.join(ROOT, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name);
          const file = ['.ts', '.tsx'].map(ext => target + ext).find(fs.existsSync);
          if (file) return load(path.relative(ROOT, file));
        }
        return require(name);
      },
    }, { filename });
    return exports;
  }
  return load;
}

function serverHarness(options = {}) {
  const state = { queries: [], rpcs: [], logs: [], clients: [], ...options };
  const user = options.user === null ? null : { id: USER, email: 'fixture@example.invalid', ...options.user };
  const profile = options.profile === null ? null : { role: 'user', is_banned: false, ...options.profile };
  const partner = { id: id(201), slug: 'fixture-event', hackathon_id: EVENT, partner_name: 'Fixture Collective',
    features: { portal_version: 'organizer-v1' }, ...options.partner };
  const event = { id: EVENT, name: 'Fixture Build Weekend', type: 'external', archived: false, min_team_size: null, max_team_size: null,
    organizer_id: null, ...options.event };
  function client() {
    return {
      auth: { async getUser() { return { data: { user }, error: options.authError || null }; } },
      from(table) {
        assert(['profiles', 'partner_configs', 'hackathons'].includes(table), 'No private roster reads');
        const query = { table, columns: null, filters: [], limit: null }; state.queries.push(query);
        function response(list = false) {
          if (options.throwLookup === table) throw Error('PRIVATE_ERROR');
          const data = table === 'profiles' ? profile : table === 'hackathons' ? options.missingEvent ? null : event
            : options.missingPartner || query.filters.some(([key, value]) => key === 'slug' && value !== partner.slug) ? null : list
              ? options.associations || [partner] : partner;
          return { data, error: options.lookupError === table ? { code: 'XX000', message: 'PRIVATE_ERROR' } : null };
        }
        const q = { select(columns) { query.columns = columns; return q; }, eq(key, value) { query.filters.push([key, value]); return q; },
          limit(value) { query.limit = value; return q; }, async maybeSingle() { return response(); },
          then(resolve, reject) { return Promise.resolve().then(() => response(true)).then(resolve, reject); } };
        return q;
      },
      async rpc(name, args) {
        assert.equal(name, 'can_access_partner_event'); state.rpcs.push({ name, args });
        const admin = profile?.role === 'admin' || user?.email?.trim().toLowerCase() === 'yashshah7117@gmail.com';
        const nativeOwner = event.type === 'native' && event.organizer_id === user?.id;
        return { data: options.nonboolean ? 'true' : admin || nativeOwner || (options.assignedEvents || [EVENT]).includes(args.p_hackathon_id), error: options.rpcError || null };
      },
    };
  }
  const cookies = options.noCookie ? [] : [{ name: 'fixture-session', value: 'valid' }];
  const load = moduleLoader({
    'next/headers': { cookies: async () => ({ getAll: () => cookies }) },
    '@supabase/ssr': { createServerClient(url, key, config) {
      assert.equal(key, 'fixture-anon'); state.clients.push(key); assert.deepEqual(config.cookies.getAll().map(c => c.name), cookies.map(c => c.name)); return client();
    } },
    '@supabase/supabase-js': { createClient() { throw Error('No bearer or service client expected'); } },
    '@/components/partners/OrganizerDashboard': ({ identity }) => React.createElement('div', { 'data-private': 'workspace' }, identity.eventName),
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'never-use' } }, logs: state.logs });
  return { state, partner, event, load, request: () => load('src/lib/partners/workspace.ts').organizerPageRequest('/partners/fixture-event/organizer') };
}

async function dashboardHarness(options = {}) {
  const state = { queries: [], pushes: [], downloads: [], revoked: [], copied: [], logs: [], query: options.query || '', ...options };
  const fixture = apiHarness({ ...options.api, rows: options.rows || options.api?.rows, teams: options.teams || options.api?.teams });
  const slots = [], dependencies = [], cleanups = [], effects = [], controls = [];
  let index = 0;
  const hooks = {
    ...React,
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = index++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(callback, deps) { const i = index++; if (!slots[i] || deps.some((value,j) => value !== slots[i].deps[j])) slots[i] = { callback, deps }; return slots[i].callback; },
    useEffect(callback, deps) { const i = index++; if (!dependencies[i] || deps.some((value,j) => value !== dependencies[i][j])) {
      cleanups[i]?.(); dependencies[i] = deps; effects.push(() => { cleanups[i] = callback(); });
    } },
  };
  const runtime = { ...jsx };
  for (const method of ['jsx','jsxs']) runtime[method] = (type, props, key) => {
    if (type === 'button' || type === 'form' || type === 'a') controls.push({ type, ...props });
    return jsx[method](type, props, key);
  };
  class BrowserURL extends URL {
    static createObjectURL(blob) { state.downloads.push({ blob }); return 'blob:fixture'; }
    static revokeObjectURL(url) { state.revoked.push(url); }
  }
  const load = moduleLoader({ react: hooks, 'react/jsx-runtime': runtime,
    'next/navigation': { useSearchParams: () => new URLSearchParams(state.query), useRouter: () => ({ refresh() { state.refreshes = (state.refreshes || 0) + 1; }, push(url) { state.pushes.push(url); state.query = new URL(url,'https://example.invalid').search.slice(1); } }) },
  }, { fetch: async (url, init) => {
    state.queries.push({ url, init });
    if (options.fetcher) return options.fetcher(url, init, state);
    const parsed = new URL(url,'https://example.invalid');
    return fixture.call(parsed.pathname.endsWith('/export') ? 'export' : 'api', parsed.search.slice(1), 'fixture-event', { cookie: true });
  }, logs: state.logs, URL: BrowserURL,
  FormData: class FixtureFormData { constructor(form) { this.entries = Object.entries(form.values); } [Symbol.iterator]() { return this.entries[Symbol.iterator](); } },
  navigator: { clipboard: { async writeText(text) { state.copied.push(text); } } },
  window: { location: { origin: 'https://example.invalid' } },
  document: { body: { append() {} }, createElement() { return { click() { state.downloads.at(-1).clicked = true; }, remove() {} }; } },
  setTimeout: fn => { fn(); return 1; },
  });
  const Dashboard = load('src/components/partners/OrganizerDashboard.tsx').default;
  const effectiveIdentity = { ...identity, ...options.identity };
  let html;
  function render() { index = 0; controls.length = 0; html = renderToStaticMarkup(React.createElement(Dashboard, { identity: effectiveIdentity })); }
  async function flush() {
    for(let n=0;n<8;n++) { render(); effects.splice(0).forEach(fn=>fn()); await new Promise(resolve=>setImmediate(resolve)); }
    render();
  }
  await flush();
  return { state, fixture, controls, load, get html() { return html; },
    async navigate(query) { state.query = query; await flush(); },
    async click(label) { const button = controls.find(c=>c.type==='button'&&String(c.children).includes(label)); assert(button,'Missing button '+label); assert(!button.disabled); await button.onClick(); await flush(); },
    async submit(values) { const form = controls.find(c=>c.type==='form'); assert(form); form.onSubmit({ preventDefault() {}, currentTarget:{values} }); await flush(); },
    flush,
  };
}

module.exports = { moduleLoader, serverHarness, dashboardHarness, identity, participant, team, id, USER, EVENT, OTHER, ROOT, React, renderToStaticMarkup, NextResponse };
