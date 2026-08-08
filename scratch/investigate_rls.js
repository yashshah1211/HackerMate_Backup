const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const anonClient = createClient(url, anonKey);

async function testRLSBehavior() {
  console.log('=== TESTING RLS BEHAVIOR FOR ANON / AUTH CLIENTS ===');

  // 1. Anon Query on Submissions
  const { data: anonSubs, error: anonSubErr } = await anonClient
    .from('team_submissions')
    .select('team_id, hackathon_id, project_title, completion_status');
  console.log('\nAnon Submissions Query:', { count: anonSubs?.length, error: anonSubErr });
  if (anonSubs && anonSubs.length > 0) {
    console.log('Sample submission completion statuses:', anonSubs.map(s => s.completion_status));
  }

  // 2. Anon Query on Profiles
  const { data: anonProfs, error: anonProfErr } = await anonClient
    .from('profiles')
    .select('id, full_name, email, college')
    .limit(3);
  console.log('\nAnon Profiles Query:', { count: anonProfs?.length, error: anonProfErr });
  console.log('Sample Anon Profiles:', anonProfs);

  // 3. Anon Query on Teams
  const { data: anonTeams, error: anonTeamErr } = await anonClient
    .from('teams')
    .select('id, name, owner_id');
  console.log('\nAnon Teams Query:', { count: anonTeams?.length, error: anonTeamErr });
}

testRLSBehavior();
