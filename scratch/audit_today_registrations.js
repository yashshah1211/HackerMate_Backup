const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);

async function auditRegistrations() {
  console.log('========================================================');
  console.log('   AUDITING TEAM_HACKATHONS & REGISTRATIONS CREATED TODAY');
  console.log('========================================================\n');

  // Query all team_hackathons with team and hackathon names
  const { data: teamHackathons, error: thErr } = await adminClient
    .from('team_hackathons')
    .select('id, team_id, hackathon_id, created_at, teams(id, name, owner_id), hackathons(id, name, type)')
    .order('created_at', { ascending: false });

  console.log('--- ALL TEAM_HACKATHONS ROWS ---');
  if (thErr) console.error('Error fetching team_hackathons:', thErr);
  else {
    teamHackathons.forEach(th => {
      console.log(`ID: ${th.id} | Created: ${th.created_at} | Team: "${th.teams?.name}" (${th.team_id}) | Hackathon: "${th.hackathons?.name}" (${th.hackathon_id}) [Type: ${th.hackathons?.type}]`);
    });
  }

  // Query all hackathon_registrations created today
  const { data: userRegs, error: hrErr } = await adminClient
    .from('hackathon_registrations')
    .select('id, user_id, hackathon_id, created_at, profiles(full_name), hackathons(name, type)')
    .order('created_at', { ascending: false });

  console.log('\n--- ALL HACKATHON_REGISTRATIONS ROWS ---');
  if (hrErr) console.error('Error fetching hackathon_registrations:', hrErr);
  else {
    userRegs.forEach(hr => {
      console.log(`ID: ${hr.id} | Created: ${hr.created_at} | User: "${hr.profiles?.full_name}" (${hr.user_id}) | Hackathon: "${hr.hackathons?.name}" (${hr.hackathon_id}) [Type: ${hr.hackathons?.type}]`);
    });
  }
}

auditRegistrations();
