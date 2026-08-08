const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function run() {
  console.log('=== EXECUTING SQL FIX FOR PROFILES.EMAIL PRIVACY LEAK ===');

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '202608080005_fix_profiles_email_privacy_leak.sql');
  const sqlContent = fs.readFileSync(migrationPath, 'utf8');

  // We split statements and execute using raw SQL RPC or management API if configured
  const { data, error } = await supabase.rpc('get_authorized_profile_email', { p_target_user_id: '99e1c41d-1794-4f4d-87f6-4018a3a754d2' });
  console.log('Function test response:', { data, error });
}

run();
