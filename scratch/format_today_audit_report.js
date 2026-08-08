const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);

async function formatReport() {
  const todayStart = '2026-08-08T00:00:00.000Z';

  // 1. team_hackathons created today
  const { data: teamHackathons } = await adminClient
    .from('team_hackathons')
    .select('team_id, hackathon_id, created_at, teams(name, owner_id), hackathons(name, type)')
    .gte('created_at', todayStart)
    .order('created_at', { ascending: false });

  // 2. hackathon_registrations created today
  const { data: userRegs } = await adminClient
    .from('hackathon_registrations')
    .select('id, user_id, hackathon_id, created_at, profiles(full_name), hackathons(name, type)')
    .gte('created_at', todayStart)
    .order('created_at', { ascending: false });

  console.log(`=== TODAY'S CREATED ROWS REPORT (AUG 8, 2026) ===\n`);
  console.log(`Total team_hackathons created today: ${teamHackathons?.length || 0}`);
  console.log(`Total hackathon_registrations created today: ${userRegs?.length || 0}\n`);

  console.log('--- PART 1: TEAM_HACKATHONS ROWS CREATED TODAY ---');
  (teamHackathons || []).forEach((th, i) => {
    console.log(`${i + 1}. [Team: "${th.teams?.name}" | ID: ${th.team_id}] registered for [Hackathon: "${th.hackathons?.name}" | ID: ${th.hackathon_id}] at ${th.created_at}`);
  });

  console.log('\n--- PART 2: HACKATHON_REGISTRATIONS ROWS CREATED TODAY ---');
  (userRegs || []).forEach((hr, i) => {
    console.log(`${i + 1}. [User: "${hr.profiles?.full_name}" | ID: ${hr.user_id}] registered for [Hackathon: "${hr.hackathons?.name}" | ID: ${hr.hackathon_id}] at ${hr.created_at}`);
  });
}

formatReport();
