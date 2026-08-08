const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const anonClient = createClient(url, anonKey);
const adminClient = createClient(url, serviceKey);

async function runVerification() {
  console.log('====================================================');
  console.log('   EMPIRICAL VERIFICATION: PROFILES.EMAIL RLS LOCK');
  console.log('====================================================\n');

  // Target test user (Yash Shah)
  const targetId = '99e1c41d-1794-4f4d-87f6-4018a3a754d2';

  // TEST A: Anonymous Client Querying profiles.email directly over REST API
  console.log('--- TEST A: Anonymous Client Querying profiles.email directly ---');
  const { data: anonResult, error: anonError } = await anonClient
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', targetId)
    .single();

  console.log('Anon Direct Query Status:');
  console.log('  Data Returned:', anonResult);
  console.log('  PostgreSQL Error:', anonError ? anonError.message : 'None');
  console.log('  Email Exposed to Anon:', anonResult?.email || 'NO (PROTECTED ✅)');

  // TEST B: Public Track Record API (Anonymous / Non-Teammate Caller)
  console.log('\n--- TEST B: Public Track Record API (Anonymous / Non-Teammate Caller) ---');
  const trackRecordRes = await fetch(`http://localhost:3000/api/builder-track-record/${targetId}`);
  const trackRecordJson = await trackRecordRes.json();

  console.log('Track Record API HTTP Status:', trackRecordRes.status);
  console.log('Track Record Data Profile:', {
    id: trackRecordJson.data?.profile?.id,
    full_name: trackRecordJson.data?.profile?.full_name,
    email: trackRecordJson.data?.profile?.email ?? 'NULL (PROTECTED ✅)',
  });

  // TEST C: Authorized Admin / Self Caller fetching Email
  console.log('\n--- TEST C: Authorized Admin / Self Caller fetching email via get_public_builder_profile ---');
  const { data: selfProfileData, error: selfErr } = await adminClient
    .rpc('get_public_builder_profile', { p_target_id: targetId, p_caller_id: targetId });

  console.log('Self / Admin Function Call:');
  console.log('  RPC Error:', selfErr ? selfErr.message : 'None');
  console.log('  Full Name:', selfProfileData?.profile?.full_name);
  console.log('  Returned Email Address:', selfProfileData?.profile?.email);
  console.log('  Legitimate Access Verified:', selfProfileData?.profile?.email ? 'YES (SUCCESS ✅)' : 'NO ❌');

  console.log('\n====================================================');
  console.log('VERIFICATION COMPLETE');
  console.log('====================================================');
}

runVerification();
