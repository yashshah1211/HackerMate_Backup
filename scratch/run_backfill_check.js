const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function runBackfillCheck() {
  console.log('=== CONFIRMING TEAMS TABLE HACKATHON_ID COLUMN ===');
  const { data: teamColsSample } = await supabase.from('teams').select('*').limit(1);
  const teamCols = Object.keys(teamColsSample[0] || {});
  console.log('teams.hackathon_id exists?', teamCols.includes('hackathon_id') ? 'YES' : 'NO');

  console.log('\n=== STEP 1: ADDING hackathon_id COLUMN IF NOT EXISTS ===');
  // We can run an update or check team_submissions
  // Note: Since Supabase client selects columns, let's check if hackathon_id exists on team_submissions
  const { data: subSample, error: subErr } = await supabase.from('team_submissions').select('*').limit(1);
  console.log('Current team_submissions columns:', subSample ? Object.keys(subSample[0] || {}) : 'Empty table');

  console.log('\n=== STEP 2: QUERYING ALL ROWS IN team_submissions ===');
  const { data: allSubs, error: aErr } = await supabase.from('team_submissions').select('*');
  console.log(`Total team_submissions rows: ${allSubs ? allSubs.length : 0}`);

  if (aErr) console.error('Error fetching team_submissions:', aErr);
}

runBackfillCheck();
