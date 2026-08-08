const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function runSteps1And2() {
  console.log('=== CONFIRMING teams.hackathon_id COLUMN ===');
  const { data: teamSample } = await supabase.from('teams').select('*').limit(1);
  const teamCols = Object.keys(teamSample[0] || {});
  console.log('Does teams.hackathon_id exist in live schema?', teamCols.includes('hackathon_id') ? 'YES' : 'NO');

  console.log('\n=== RUNNING STEP 2 BACKFILL QUERY VIA SUPABASE ===');
  // Attempt to select columns from team_submissions
  const { data: subCheck, error: subErr } = await supabase.from('team_submissions').select('team_id, project_title, github_url, updated_at, hackathon_id');
  
  if (subErr && subErr.message.includes('column hackathon_id does not exist')) {
    console.log('Column hackathon_id does not exist yet on team_submissions table.');
  }

  console.log('\n=== CHECKING ROWS WHERE hackathon_id IS NULL ===');
  const { data: allSubs, error: aErr } = await supabase.from('team_submissions').select('team_id, project_title, github_url, updated_at, hackathon_id');
  
  if (aErr) {
    console.log('Select query error:', aErr.message);
  } else {
    const nullRows = (allSubs || []).filter(s => !s.hackathon_id);
    console.log(`COUNT(*) WHERE hackathon_id IS NULL: ${nullRows.length}`);
    console.log(`Total rows in team_submissions: ${allSubs.length}`);
    if (nullRows.length > 0) {
      console.log('Rows where hackathon_id is NULL:');
      nullRows.forEach(r => {
        console.log(`  - team_id: ${r.team_id} | project_title: "${r.project_title}" | github_url: "${r.github_url}" | updated_at: ${r.updated_at}`);
      });
    } else {
      console.log('No rows have hackathon_id IS NULL.');
    }
  }
}

runSteps1And2();
