/* eslint-disable @typescript-eslint/no-require-imports -- Offline source-module harness. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ROOT = path.resolve(__dirname, '..');

function load(relative, overrides = {}, options = {}) {
  const filename = path.join(ROOT, relative);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, URL, Intl, process: { env: options.env || {} },
    console: { error: (...args) => options.errors?.push(args) },
    fetch: () => { throw new Error('Network prohibited in offline portal tests'); },
    require(name) {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name === 'server-only') return {};
      if (name === 'react') return { ...React, cache: fn => fn };
      if (name === 'next/link') return function Link({ children, ...props }) { return React.createElement('a', props, children); };
      if (name === 'next/navigation') return { notFound() { throw new Error('NEXT_NOT_FOUND'); } };
      if (name === '@supabase/supabase-js') return { createClient() { throw new Error('No real database client in offline tests'); } };
      if (name.startsWith('@/') || name.startsWith('.')) {
        const target = name.startsWith('@/') ? path.join(ROOT, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name);
        const file = ['.ts', '.tsx'].map(ext => target + ext).find(fs.existsSync);
        if (file) return load(path.relative(ROOT, file), overrides, options);
      }
      return require(name);
    },
  }, { filename });
  return exports;
}

const config = load('src/lib/partners/eventSeries.ts');
const series = config.CRAFTNCODE_SERIES;

function fixture(options = {}) {
  const rows = options.rows || series.qualifiers.map(qualifier => ({ id: qualifier.eventId,
    name: `Synthetic Craft N Code — ${qualifier.state}`, status: 'approved', archived: false,
    website_url: `https://unstop.com/hackathons/synthetic-${qualifier.slug}-999999`,
    mode: 'offline', location: 'Venue in India',
  }));
  const queries = [];
  const client = {
    auth: new Proxy({}, { get() { throw new Error('No identity reads allowed'); } }),
    rpc() { throw new Error('No RPC allowed'); },
    from(table) {
      if (table !== 'hackathons') throw new Error('Private table access: ' + table);
      const query = { table, filters: [] };
      queries.push(query);
      const result = () => {
        if (options.throwError) throw options.throwError;
        let data = rows;
        if (!options.ignoreFilters) for (const [key, value] of query.filters) data = data.filter(row => Array.isArray(value) ? value.includes(row[key]) : row[key] === value);
        return { data: data.slice(0, query.limit || Infinity), error: options.error || null };
      };
      return {
        select(columns) { query.columns = columns; return this; },
        in(key, value) { query.filters.push([key, Array.from(value)]); return this; },
        eq(key, value) { query.filters.push([key, value]); return this; },
        limit(value) { query.limit = value; return this; },
        async maybeSingle() { const value = result(); return { ...value, data: value.data[0] || null }; },
        then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); },
      };
    },
  };
  return { rows, queries, client };
}

async function renderPath(pathname, options = {}) {
  const f = fixture(options);
  const api = load('src/lib/partners/eventSeriesPublic.ts');
  const overrides = { '@/lib/partners/eventSeriesPublic': {
    loadCraftSeries: () => api.resolvePublicSeries(f.client, series),
    loadCraftQualifier: state => api.resolvePublicQualifier(f.client, series, state),
  } };
  let element;
  let status = 200;
  try {
    if (pathname === '/partners/craftncode') element = await load('src/app/partners/craftncode/page.tsx', overrides).default();
    else {
      const match = /^\/partners\/craftncode\/([^/]+)$/.exec(pathname);
      if (!match) throw new Error('NEXT_NOT_FOUND');
      element = await load('src/app/partners/craftncode/[state]/page.tsx', overrides).default({ params: Promise.resolve({ state: match[1] }) });
    }
  } catch (error) {
    if (error.message !== 'NEXT_NOT_FOUND') throw error;
    status = 404;
    element = React.createElement(load('src/app/partners/craftncode/not-found.tsx').default);
  }
  return { html: renderToStaticMarkup(element), status, ...f };
}

module.exports = { ROOT, load, series, config, fixture, renderPath };
