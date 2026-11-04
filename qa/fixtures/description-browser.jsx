// Reuse the existing read-only transport; replace only the public event row.
import { supabase as base } from './mission20-hotfix-browser';
import fixtures from './descriptions/cases.cjs';
export { default, useParams, useSearchParams, useRouter, useNotification } from './mission20-hotfix-browser';
const params = new URLSearchParams(location.search);
const fixture = fixtures[params.get('description') || 'nasa'];
const row = {
  id: '00000000-0000-4000-8000-000000000002', name: fixture.name, description: fixture.description,
  status: 'approved', archived: false, type: 'external', tags: ['Open innovation'],
  start_date: '2026-11-14', end_date: '2026-11-15', registration_start: '2026-10-01', registration_end: '2026-11-12', registration_status: null,
  created_at: '2026-10-01T00:00:00Z', location: 'Raipur', mode: 'offline', prize_pool: null, currency: null,
  website_url: 'https://unstop.com/hackathons/synthetic-1234', min_team_size: 1, max_team_size: 4,
  max_participants: null, organizer_id: null, rounds_info: [], source_metadata: null, ...fixture,
};
export const supabase = { ...base, from(table) {
  if (table !== 'hackathons') return base.from(table);
  let single = false;
  const mutation = () => { window.fixtureWrites.push(table); throw Error('Description browser rejects all mutations'); };
  return { select(columns) { window.fixtureReads.push({ table, columns }); return this; }, eq() { return this; }, order() { return this; },
    limit() { return this; }, maybeSingle() { single = true; return this; }, single() { single = true; return this; },
    then(resolve, reject) { return Promise.resolve({ data: single ? row : [row], error: null }).then(resolve, reject); },
    insert: mutation, update: mutation, delete: mutation, upsert: mutation,
  };
} };
