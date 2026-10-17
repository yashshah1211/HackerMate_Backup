/* eslint-disable @typescript-eslint/no-require-imports -- Offline source-module fixtures. */
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ROOT, load } = require('./event-series-harness.cjs');
const { HUSTLE_CARNIVAL: event } = load('src/lib/partners/hustleCarnival.ts');

function fixture(options = {}) {
  const row = { id: event.eventId, status: 'approved', archived: false, type: 'external',
    start_date: '2026-10-22', end_date: '2026-10-24', mode: 'hybrid',
    location: 'Block A & B, G.L. Bajaj Group of Institutions, Mathura',
    min_team_size: 1, max_team_size: 2, website_url: event.registrationUrl, ...options.row };
  const queries = [];
  const client = {
    auth: new Proxy({}, { get() { throw new Error('No identity access'); } }),
    rpc() { throw new Error('No RPC access'); },
    from(table) {
      if (table !== 'hackathons') throw new Error('No private or partner config reads');
      const query = { table, filters: [] }; queries.push(query);
      return {
        select(columns) { query.columns = columns; return this; },
        eq(key, value) { query.filters.push([key, value]); return this; },
        async maybeSingle() {
          if (options.throws) throw new Error('Synthetic database failure');
          // Return even incorrect rows to exercise defense in depth beyond DB filters.
          return { data: options.missing ? null : row, error: options.error || null };
        },
      };
    },
  };
  return { row, queries, client };
}

async function renderPortal(options = {}) {
  const f = fixture(options);
  const api = load('src/lib/partners/hustleCarnivalPublic.ts');
  const route = load('src/app/partners/hustle-carnival/page.tsx', {
    'next/link': function Link({ children, prefetch, ...props }) { void prefetch; return React.createElement('a', props, children); },
    '@/lib/partners/hustleCarnivalPublic': { loadHustleCommunity: () => api.resolveHustleCommunity(f.client) },
  });
  return { ...f, html: renderToStaticMarkup(await route.default()), metadata: route.metadata };
}

module.exports = { ROOT, load, event, fixture, renderPortal, React };
