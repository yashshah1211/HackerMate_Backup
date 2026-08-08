const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);

async function auditToday() {
  console.log('========================================================');
  console.log('   ROWS CREATED TODAY (AUG 8, 2026) AUDIT');
  console.log('========================================================\n');

  const todayStart = '2026-08-08T00:00:00.000Z';

  // 1. Query team_hackathons created today
  const { data: teamHackathons, error: thErr } = await adminClient
    .from('team_hackathons')
    .select('team_id, hackathon_id, created_at, teams(id, name, owner_id), hackathons(id, name, type)')
    .gte('created_at', todayStart)
    .order('created_at', { ascending: false });

  console.log(`--- TEAM_HACKATHONS ROWS CREATED TODAY (${teamHackathons?.length || 0} rows) ---`);
  if (thErr) console.error('Error:', thErr);
  else {
    (teamHackathons || []).forEach(th => {
      console.log(`[team_hackathons] Team: "${th.teams?.name}" (${th.team_id}) | Hackathon: "${th.hackathons?.name}" (${th.hackathon_id}) | Created: ${th.created_at}`);
    });
  }

  // Also get ALL team_hackathons regardless of date to see recent entries
  const { data: allTeamHackathons } = await adminClient
    .from('team_hackathons')
    .select('team_id, hackathon_id, created_at, teams(name), hackathons(name)')
    .order('created_at', { ascending: false })
    .limit(20);

  console.log(`\n--- MOST RECENT 20 TEAM_HACKATHONS ROWS (ALL DATES) ---`);
  (allTeamHackathons || []).forEach(th => {
    console.log(`[team_hackathons] Team: "${th.teams?.name}" (${th.team_id}) | Hackathon: "${th.hackathons?.name}" (${th.hackathon_id}) | Created: ${th.created_at}`);
  });

  // 2. Query hackathon_registrations created today
  const { data: userRegs, error: hrErr } = await adminClient
    .from('hackathon_registrations')
    .select('id, user_id, hackathon_id, created_at, profiles(full_name), hackathons(name, type)')
    .gte('created_at', todayStart)
    .order('created_at', { ascending: false });

  console.log(`\n--- HACKATHON_REGISTRATIONS ROWS CREATED TODAY (${userRegs?.length || 0} rows) ---`);
  if (hrErr) console.error('Error:', hrErr);
  else {
    (userRegs || []).forEach(hr => {
      console.log(`[hackathon_registrations] ID: ${hr.id} | Created: ${hr.created_at} | User: "${hr.profiles?.full_name}" (${hr.user_id}) | Hackathon: "${hr.hackathons?.name}" (${hr.hackathon_id})`);
    });
  }
}

auditToday();
