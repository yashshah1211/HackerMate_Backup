const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function investigateUserTrackRecord() {
  console.log('=== INVESTIGATING USER TRACK RECORD DATA ===');

  // Find a team member with real activity
  const { data: members } = await supabase
    .from('team_members')
    .select('user_id, role, profiles(id, full_name, email, college, bio, avatar_url, skills, role)')
    .limit(5);

  if (!members || members.length === 0) {
    console.log('No team members found.');
    return;
  }

  const sampleMember = members.find(m => m.profiles) || members[0];
  const userId = sampleMember.user_id;
  const profile = sampleMember.profiles;

  console.log(`\nSample Active User: ${profile?.full_name || 'N/A'} (ID: ${userId})`);

  // 1. Hackathon Registrations
  const { data: registrations } = await supabase
    .from('hackathon_registrations')
    .select('id, hackathon_id, looking_for_team, status, created_at, hackathons(id, name, mode, location, prize_pool, start_date, end_date, website_url)')
    .eq('user_id', userId);

  // 2. Teams user belongs to
  const { data: userTeamMemberships } = await supabase
    .from('team_members')
    .select('team_id, role, created_at, teams(id, name, description, college, max_members, owner_id, team_hackathons(hackathon_id, hackathons(id, name, start_date)))')
    .eq('user_id', userId);

  const teamIds = (userTeamMemberships || []).map(m => m.team_id);

  // 3. Submissions for these teams across hackathons
  let submissions = [];
  if (teamIds.length > 0) {
    const { data: subData } = await supabase
      .from('team_submissions')
      .select('id, team_id, hackathon_id, project_title, demo_url, github_url, pitch_video_url, slides_url, completion_status, updated_at')
      .in('team_id', teamIds);
    submissions = subData || [];
  }

  console.log('\n--- PROFILE SHAPE ---');
  console.log(JSON.stringify(profile, null, 2));

  console.log(`\n--- HACKATHON REGISTRATIONS (${registrations?.length || 0}) ---`);
  console.log(JSON.stringify(registrations, null, 2));

  console.log(`\n--- TEAM MEMBERSHIPS (${userTeamMemberships?.length || 0}) ---`);
  console.log(JSON.stringify(userTeamMemberships, null, 2));

  console.log(`\n--- TEAM SUBMISSIONS (${submissions.length}) ---`);
  console.log(JSON.stringify(submissions, null, 2));

  // Check columns in profiles table to see if username or slug exists
  const { data: sampleProfileRow } = await supabase
    .from('profiles')
    .select('*')
    .limit(1)
    .single();

  console.log('\n--- ALL PROFILES COLUMNS ---');
  console.log(Object.keys(sampleProfileRow || {}));
}

investigateUserTrackRecord();
