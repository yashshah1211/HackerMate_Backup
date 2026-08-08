const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function run() {
  const { data: profiles } = await supabase.from('profiles').select('college');
  const profileColleges = Array.from(new Set((profiles || []).map(p => p.college).filter(Boolean)));
  console.log('All unique college values in PROFILES:', profileColleges);

  const { data: teams } = await supabase.from('teams').select('college');
  const teamColleges = Array.from(new Set((teams || []).map(t => t.college).filter(Boolean)));
  console.log('All unique college values in TEAMS:', teamColleges);
}

run();
