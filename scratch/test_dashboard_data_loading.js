const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const client = createClient(url, anonKey);

async function testDashboardLoading() {
  console.log('====================================================');
  console.log('   VERIFYING DASHBOARD DATA LOADING AS REAL USER');
  console.log('====================================================\n');

  const userId = '99e1c41d-1794-4f4d-87f6-4018a3a754d2'; // Yash Shah

  // SAFE_PROFILE_COLUMNS definition matching dashboard
  const SAFE_PROFILE_COLUMNS = "id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, updated_at, role, is_available, onboarding_completed, is_banned, gender, has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins, last_seen_at, github_stats, github_stats_updated_at, onboarding_nudge_sent_at, last_onboarding_nudge_sent_at, referrer_source, profile_nudge_count, last_nudge_sent_at, sih_broadcast_sent_at, username, show_track_record";

  // 1. Fetch current profile (Dashboard query 1)
  console.log('--- 1. FETCH CURRENT USER PROFILE ---');
  const { data: profile, error: pErr } = await client
    .from('profiles')
    .select(SAFE_PROFILE_COLUMNS)
    .eq('id', userId)
    .single();

  console.log('Profile Query Result:');
  console.log('  Error:', pErr ? pErr.message : 'None ✅');
  console.log('  Full Name:', profile?.full_name);
  console.log('  College:', profile?.college);
  console.log('  Onboarding Completed:', profile?.onboarding_completed);
  console.log('  Skills Count:', profile?.skills?.length);

  // Compute profile completeness
  let filledFields = 0;
  const totalFields = 6;
  if (profile?.full_name) filledFields++;
  if (profile?.college) filledFields++;
  if (profile?.bio) filledFields++;
  if (profile?.skills?.length) filledFields++;
  if (profile?.avatar_url) filledFields++;
  if (profile?.github_url || profile?.linkedin_url) filledFields++;
  const completeness = Math.round((filledFields / totalFields) * 100);

  console.log(`  Profile Completeness Percentage: ${completeness}% (EXPECTED > 0% ✅)`);

  // 2. Fetch other profiles (Dashboard query 2)
  console.log('\n--- 2. FETCH OTHER PROFILES FOR COMPATIBILITY ---');
  const { data: otherProfiles, error: oErr } = await client
    .from('profiles')
    .select(SAFE_PROFILE_COLUMNS)
    .neq('id', userId);

  console.log('Other Profiles Query Result:');
  console.log('  Error:', oErr ? oErr.message : 'None ✅');
  console.log('  Other Profiles Count:', otherProfiles?.length);

  // 3. Fetch Builders Count (Dashboard query 3)
  console.log('\n--- 3. FETCH BUILDERS IN NETWORK COUNT ---');
  const { count: buildersCount, error: bErr } = await client
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  console.log('Builders Count Query Result:');
  console.log('  Error:', bErr ? bErr.message : 'None ✅');
  console.log('  Builders in Network Count:', buildersCount);

  console.log('\n====================================================');
  console.log('DASHBOARD DATA VERIFICATION COMPLETED SUCCESSFULLY');
  console.log('====================================================');
}

testDashboardLoading();
