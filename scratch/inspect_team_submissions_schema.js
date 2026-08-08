const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function inspectSubmissionsSchema() {
  console.log('=== TEAM_SUBMISSIONS SAMPLE & COLUMNS ===');
  const { data: sample, error: sErr } = await supabase.from('team_submissions').select('*').limit(5);
  if (sErr) console.error('Sample error:', sErr);
  else {
    console.log('Columns:', Object.keys(sample[0] || {}));
    console.log(`Sample row count: ${sample.length}`);
    if (sample.length > 0) {
      console.log('Sample row 0:', sample[0]);
    }
  }

  console.log('\n=== ALL EXISTING TEAM_SUBMISSIONS ROWS ===');
  const { data: allSubs } = await supabase.from('team_submissions').select('*');
  console.log(`Total rows in team_submissions: ${allSubs ? allSubs.length : 0}`);
  if (allSubs && allSubs.length > 0) {
    allSubs.forEach((sub, idx) => {
      console.log(`[Row ${idx+1}] team_id: ${sub.team_id} | project_title: "${sub.project_title}" | hackathon_id: ${sub.hackathon_id || 'NOT_PRESENT'}`);
    });
  }
}

inspectSubmissionsSchema();
