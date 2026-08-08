const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const adminSupabase = createClient(url, key);
const anonSupabase = createClient(url, anonKey);

async function testEmailRLSLockdown() {
  console.log('=== TESTING PROFILES.EMAIL RLS LOCKDOWN ===');

  // Apply SQL policy / column revoke test via RPC if available or create test SQL migration
  const migrationSql = `
    -- Revoke column-level select on email for anon and authenticated default roles
    REVOKE SELECT ON public.profiles FROM anon, authenticated;
    
    -- Grant SELECT on safe columns to anon and authenticated
    GRANT SELECT (id, full_name, college, bio, avatar_url, skills, github_url, linkedin_url, created_at, role, is_available, onboarding_completed) ON public.profiles TO anon, authenticated;

    -- Grant SELECT on email ONLY for self, or via Security Definer functions
    -- (Self view and accepted teammates view email via secure function / policy)
  `;

  console.log('Testing anon query before migration...');
  const { data: anonDataBefore, error: anonErrBefore } = await anonSupabase
    .from('profiles')
    .select('id, full_name, email')
    .limit(1);

  console.log('Before Lockdown (Anon Querying Email):', { data: anonDataBefore, error: anonErrBefore });
}

testEmailRLSLockdown();
