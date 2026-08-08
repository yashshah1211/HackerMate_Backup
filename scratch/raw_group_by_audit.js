const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function runAudit() {
  console.log('=== POINT 4: LIVE SCHEMA INSPECTION OF TEAMS & PROFILES COLUMNS ===');
  const { data: teamSample } = await supabase.from('teams').select('*').limit(1);
  console.log('teams table schema columns:', Object.keys(teamSample[0] || {}));
  
  const { data: profileSample } = await supabase.from('profiles').select('*').limit(1);
  console.log('profiles table schema columns:', Object.keys(profileSample[0] || {}));

  console.log('\n=== POINT 5 (PART 1): RAW GROUP BY QUERY ON PROFILES ===');
  const { data: profiles } = await supabase.from('profiles').select('college');
  const profileCounts = {};
  (profiles || []).forEach(p => {
    const col = p.college === null ? 'NULL' : p.college;
    profileCounts[col] = (profileCounts[col] || 0) + 1;
  });

  const sortedProfiles = Object.entries(profileCounts).sort((a, b) => b[1] - a[1]);
  console.log('Total profile rows:', profiles.length);
  console.log('Grouped profiles count by college:');
  sortedProfiles.forEach(([col, count]) => {
    console.log(`  ${count.toString().padStart(4, ' ')} | "${col}"`);
  });

  console.log('\n=== POINT 5 (PART 2): RAW GROUP BY QUERY ON TEAMS ===');
  const { data: teams } = await supabase.from('teams').select('college');
  const teamCounts = {};
  (teams || []).forEach(t => {
    const col = t.college === null ? 'NULL' : t.college;
    teamCounts[col] = (teamCounts[col] || 0) + 1;
  });

  const sortedTeams = Object.entries(teamCounts).sort((a, b) => b[1] - a[1]);
  console.log('Total team rows:', teams.length);
  console.log('Grouped teams count by college:');
  sortedTeams.forEach(([col, count]) => {
    console.log(`  ${count.toString().padStart(4, ' ')} | "${col}"`);
  });
}

runAudit();
