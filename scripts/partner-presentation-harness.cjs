/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-module harness. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const ROOT = path.resolve(__dirname, '..');
const EVENT = '00000000-0000-4000-8000-000000000006';

function load(relative, overrides = {}, globals = {}) {
  const filename = path.join(ROOT, relative);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, URL, process, Intl, Date,
    console: { error: (...args) => globals.errors?.push(args) },
    require(name) {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name === 'server-only') return {};
      if (name === 'next/link') return function Link({ children, ...props }) { return React.createElement('a', props, children); };
      if (name.startsWith('@/') || name.startsWith('.')) {
        const target = name.startsWith('@/') ? path.join(ROOT, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name);
        const file = ['.ts', '.tsx'].map(ext => target + ext).find(fs.existsSync);
        if (file) return load(path.relative(ROOT, file), overrides, globals);
      }
      return require(name);
    },
  }, { filename });
  return exports;
}

function fixture(options = {}) {
  const partner = { slug: 'sample-event', partner_name: 'Sample Collective', hackathon_id: EVENT,
    tagline: 'A weekend for curious builders.', features: { portal_version: 'organizer-v1' }, ...options.partner };
  const event = { id: EVENT, name: 'Sample Build Weekend', archived: false, type: 'external',
    start_date: '2028-11-24', end_date: '2028-11-25', mode: 'offline', location: 'Sample campus',
    min_team_size: 2, max_team_size: 4, website_url: 'https://example.invalid/register', ...options.event };
  const queries = [];
  const client = {
    // Calling identity, registration counts or discovery here is a regression.
    auth: { getUser() { throw new Error('Public presentation must not require auth'); } },
    rpc() { throw new Error('Public presentation must not request registration metrics'); },
    from(table) {
      if (!['partner_configs', 'hackathons'].includes(table)) throw new Error('Private/unexpected table ' + table);
      const query = { table };
      queries.push(query);
      return {
        select(columns) { query.columns = columns; return this; },
        eq(column, value) { query.filter = [column, value]; return this; },
        async maybeSingle() {
          if (options.throwError) throw options.throwError;
          return { data: table === 'partner_configs' ? options.missingPartner ? null : partner : options.missingEvent ? null : event,
            error: table === 'partner_configs' ? options.partnerError : options.eventError };
        },
      };
    },
  };
  return { partner, event, queries, client };
}

module.exports = { ROOT, EVENT, load, fixture };
