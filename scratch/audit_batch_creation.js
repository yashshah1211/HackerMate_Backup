const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);

async function auditBatch() {
  console.log('=== AUDITING BATCH TEAM_HACKATHONS CREATED AT 15:46:21 ===\n');

  const targetTimestamp = '2026-08-08T15:46:21.549831+00:00';

  const { data: rows, error } = await adminClient
    .from('team_hackathons')
    .select('team_id, hackathon_id, created_at, teams(id, name), hackathons(id, name)')
    .eq('created_at', targetTimestamp);

  console.log(`Total rows created at ${targetTimestamp}: ${rows?.length || 0}`);
  if (error) console.error(error);

  (rows || []).forEach((r, idx) => {
    console.log(`${idx + 1}. Team: "${r.teams?.name}" (${r.team_id}) -> Hackathon: "${r.hackathons?.name}" (${r.hackathon_id})`);
  });
}

auditBatch();
