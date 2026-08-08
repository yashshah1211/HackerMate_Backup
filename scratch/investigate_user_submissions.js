const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);

async function inspectSubmissions() {
  console.log('=== INVESTIGATING USER TEAM SUBMISSIONS ===');

  const userId = '99e1c41d-1794-4f4d-87f6-4018a3a754d2'; // Yash Shah

  // 1. Get user teams
  const { data: teamMembers } = await adminClient
    .from('team_members')
    .select('team_id, role, teams(id, name)')
    .eq('user_id', userId);

  console.log('\nUser Teams:', teamMembers);

  const teamIds = (teamMembers || []).map(tm => tm.team_id);

  // 2. Query team_submissions for these teams
  const { data: submissions } = await adminClient
    .from('team_submissions')
    .select('*')
    .in('team_id', teamIds);

  console.log('\nSubmissions for user teams:', submissions);
}

inspectSubmissions();
