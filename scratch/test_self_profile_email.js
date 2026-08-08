const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);

async function testSelfEmail() {
  const userId = '99e1c41d-1794-4f4d-87f6-4018a3a754d2'; // Yash Shah

  const { data: trackRecord, error } = await adminClient.rpc('get_public_builder_profile', {
    p_target_id: userId,
    p_caller_id: userId
  });

  console.log('Self-View Track Record Profile Result:');
  console.log('  Error:', error ? error.message : 'None ✅');
  console.log('  Profile Email Returned:', trackRecord?.profile?.email);
}

testSelfEmail();
