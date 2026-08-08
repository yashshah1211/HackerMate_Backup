const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const client = createClient(url, anonKey);

const SAFE_PROFILE_COLUMNS = "id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, sih_broadcast_sent_at, username, show_track_record";

async function verifyAllPages() {
  console.log('====================================================');
  console.log('   EMPIRICAL COMPREHENSIVE MULTI-PAGE AUDIT');
  console.log('====================================================\n');

  const testUserId = '99e1c41d-1794-4f4d-87f6-4018a3a754d2'; // Yash Shah

  // 1. VERIFY /dashboard
  console.log('--- 1. VERIFYING /dashboard ---');
  const { data: dashProfile, error: dashErr } = await client
    .from('profiles')
    .select(SAFE_PROFILE_COLUMNS)
    .eq('id', testUserId)
    .single();

  console.log('Dashboard User Profile:');
  console.log('  Error:', dashErr ? dashErr.message : 'None ✅');
  console.log('  Full Name:', dashProfile?.full_name);
  console.log('  Onboarding Completed:', dashProfile?.onboarding_completed);

  const { count: buildersCount } = await client
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  console.log('  Builders in Network Count:', buildersCount);

  // 2. VERIFY /profile/[id] (Test 3 Real User IDs)
  console.log('\n--- 2. VERIFYING /profile/[id] (3 REAL USERS) ---');
  const testIds = [
    '99e1c41d-1794-4f4d-87f6-4018a3a754d2', // Yash Shah
    '4a8b139f-a35d-4c5b-a052-f3ff5b20aa76', // Khushnuma
    'bb17dac9-df03-453c-8fae-2f0bf1ae3e2b'  // Vedant
  ];

  for (const id of testIds) {
    const { data: pData, error: pErr } = await client
      .from('profiles')
      .select(SAFE_PROFILE_COLUMNS)
      .eq('id', id)
      .single();

    console.log(`  Profile [${id.substring(0, 8)}...]:`);
    console.log('    Error:', pErr ? pErr.message : 'None ✅');
    console.log('    Full Name:', pData?.full_name || 'NOT FOUND ❌');
    console.log('    College:', pData?.college || 'N/A');
  }

  // 3. VERIFY /developers (Builders Discovery Page)
  console.log('\n--- 3. VERIFYING /developers (BUILDERS DISCOVERY PAGE) ---');
  const { data: devs, error: devErr } = await client
    .from('profiles')
    .select(SAFE_PROFILE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50);

  console.log('Builders Discovery Query:');
  console.log('  Error:', devErr ? devErr.message : 'None ✅');
  console.log('  Builders Count Loaded:', devs?.length);
  if (devs && devs.length > 0) {
    console.log('  Sample Builders Loaded:', devs.slice(0, 3).map(d => d.full_name));
  }

  // 4. VERIFY /connections
  console.log('\n--- 4. VERIFYING /connections ---');
  const { data: connProfiles, error: connErr } = await client
    .from('profiles')
    .select('id, full_name, avatar_url, college')
    .limit(5);

  console.log('Connections Profiles Query:');
  console.log('  Error:', connErr ? connErr.message : 'None ✅');
  console.log('  Profiles Returned:', connProfiles?.length);

  // 5. VERIFY /hackathons/sih (SIH Page Joined Queries)
  console.log('\n--- 5. VERIFYING /hackathons/sih (JOINED QUERIES) ---');
  const { data: sihRegs, error: sihErr } = await client
    .from('hackathon_registrations')
    .select('user_id, looking_for_team, profiles(id, full_name, avatar_url, college, skills, gender, role)')
    .limit(5);

  console.log('SIH Registrations Relational Query:');
  console.log('  Error:', sihErr ? sihErr.message : 'None ✅');
  console.log('  Registrations Returned:', sihRegs?.length);
  if (sihRegs && sihRegs.length > 0) {
    console.log('  Sample Joined Profile Name:', sihRegs[0].profiles?.full_name);
  }

  console.log('\n====================================================');
  console.log('ALL PAGES EMPIRICAL VERIFICATION COMPLETED');
  console.log('====================================================');
}

verifyAllPages();
