import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const cache = resolve('qa/browser/.cache');
await mkdir(cache, { recursive: true });
const aliases = { '@/lib/supabase': 'client.ts', '@/lib/posthog': 'telemetry.ts', 'next/link': 'navigation.tsx', 'next/navigation': 'navigation.tsx' };
await build({ entryPoints: ['qa/browser/app/entry.tsx'], bundle: true, outfile: `${cache}/app.js`, jsx: 'automatic', platform: 'browser', define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'isolated-test-adapters', setup(builder) {
    builder.onResolve({ filter: /^(@\/|next\/)/ }, args => {
      const target = aliases[args.path] ? resolve('qa/browser/app', aliases[args.path]) : resolve('src', args.path.slice(2));
      const file = [target, target + '.ts', target + '.tsx', target + '/index.ts'].find(candidate => existsSync(candidate) && !candidate.endsWith('/system'));
      return { path: file };
    });
  } }] });
const css = await postcss([tailwind()]).process(await readFile('src/app/globals.css', 'utf8'), { from: resolve('src/app/globals.css') });
const fields = 'id,full_name,college,year_of_study,bio,avatar_url,skills,is_available,has_participated_hackathon,hackathon_participations,has_won_hackathon,hackathon_wins,last_seen_at,created_at'.split(',');
function profile(full_name, skills, college, is_available, extra = {}) {
  return { ...Object.fromEntries(fields.map(field => [field, null])), id: randomUUID(), full_name, skills, college, is_available,
    year_of_study: '2nd Year', created_at: new Date(0).toISOString(), onboarding_completed: true, is_banned: false, ...extra };
}
const viewer = profile('QA Viewer', ['Python'], 'QA Alpha College', true);
const records = [viewer, profile('QA Python Builder', ['PyThOn', 'React Native'], 'QA Alpha College', true),
  profile('QA Script Builder', ['TypeScript', 'C++', 'C#', 'Node.js'], 'QA Beta College', null),
  profile('QA Name Builder', ['Rust'], 'QA Alpha College', false),
  profile('QA Blocked Builder', ['Python'], 'QA Alpha College', true),
  profile('QA Reverse Blocked Builder', ['Python'], 'QA Alpha College', true),
  profile('QA Hidden Builder', ['Python'], 'QA Alpha College', true, { fixtureHidden: true })];
const project = (record, columns = fields) => Object.fromEntries(columns.map(field => [field, record[field] ?? null]));
function query(body) {
  if (body.rpc === 'search_builder_profiles') {
    const term = String(body.args.p_query).trim().toLowerCase();
    return records.filter(row => !row.fixtureHidden && [row.full_name, row.college, ...row.skills].some(value => value.toLowerCase().includes(term))).slice(0, body.args.p_limit).map(row => project(row));
  }
  if (body.rpc === 'get_recommended_teammates_v3') return [];
  if (body.rpc) throw new Error('Fixture harness rejects non-read RPCs');
  if (body.table === 'profiles') {
    const rows = records.filter(row => !row.fixtureHidden && (!body.filters?.id || row.id === body.filters.id));
    const result = rows.map(row => project(row, body.select?.split(',').map(value => value.trim())));
    return body.single ? result[0] : result;
  }
  if (body.table === 'blocked_users') return body.select === 'blocked_id' ? [{ blocked_id: records[4].id }] : [{ blocker_id: records[5].id }];
  if (['teams', 'friend_requests'].includes(body.table)) return [];
  throw new Error('Unexpected fixture read');
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4173');
  try {
    if (url.pathname === '/__qa/query' && req.method === 'POST') {
      let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 65536) throw new Error('Too large'); }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: query(JSON.parse(text)), error: null }));
    } else if (url.pathname === '/__qa/info') {
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ viewerId: viewer.id }));
    } else if (url.pathname === '/__qa/health') res.end('isolated fixture QA');
    else if (url.pathname === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(`${cache}/app.js`)); }
    else if (url.pathname === '/app.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
  } catch { res.statusCode = 400; res.end('Fixture request rejected'); }
});
server.listen(4173, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
