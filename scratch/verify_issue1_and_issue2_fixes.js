const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);

async function verifyFixes() {
  console.log('=== VERIFYING ISSUE 1 AND ISSUE 2 FIXES ===\n');

  const userId = '99e1c41d-1794-4f4d-87f6-4018a3a754d2'; // Yash Shah

  // 1. Verify Track Record RPC for Yash Shah
  const { data: trackRecord, error: trErr } = await adminClient.rpc('get_public_builder_profile', {
    p_target_id: userId,
    p_caller_id: userId
  });

  console.log('Track Record RPC Result:');
  console.log('  Error:', trErr ? trErr.message : 'None ✅');
  console.log('  Email Returned:', trackRecord?.profile?.email);
  console.log('  Submissions Length (Projects Delivered):', trackRecord?.submissions?.length);

  // 2. Query team_submissions table for status
  const { data: subRows } = await adminClient
    .from('team_submissions')
    .select('team_id, project_title, completion_status')
    .eq('team_id', '4fe7e7b8-6010-436d-9954-383d9aa3c340');

  console.log('\nDB Row Status for Team "The Builders":', subRows);
}

verifyFixes();
