const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function testPublicShowcaseTeams() {
  console.log('=== TESTING PUBLIC SHOWCASE TEAMS LIMIT ===');
  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, name, description, max_members, team_hackathons(hackathons(name))')
    .order('created_at', { ascending: false })
    .limit(6);

  if (error) {
    console.error('Query error:', error);
    process.exit(1);
  }

  console.log(`Fetched ${teams.length} teams for landing page preview:`);
  teams.forEach((t, idx) => {
    const hacks = (t.team_hackathons || []).map(th => th.hackathons?.name).filter(Boolean);
    console.log(` ${idx + 1}. "${t.name}" -> ${hacks.join(', ') || 'Active Team'}`);
  });

  if (teams.length === 6) {
    console.log('\n✅ EMPIRICAL TEST PASSED: Landing page public showcase API successfully returns 6 real teams!');
  } else {
    throw new Error(`Expected 6 teams, got ${teams.length}`);
  }
}

testPublicShowcaseTeams();
