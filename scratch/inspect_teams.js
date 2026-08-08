const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function inspectTeams() {
  console.log('=== CHECKING LIVE TEAMS IN DATABASE ===');
  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, name, description, college, created_at, team_hackathons(hackathon_id, hackathons(name))')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching teams:', error);
    return;
  }

  console.log(`Total teams in DB: ${teams.length}`);
  teams.forEach((t, i) => {
    const joinedHacks = (t.team_hackathons || []).map(th => th.hackathons?.name).filter(Boolean);
    console.log(`${i + 1}. [${t.name}] - College: ${t.college || 'N/A'} - Hacks: ${joinedHacks.join(', ') || 'None'}`);
  });
}

inspectTeams();
