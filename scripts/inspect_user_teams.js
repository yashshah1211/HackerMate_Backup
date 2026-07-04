/* eslint-disable */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://rhryjrbebfrrfhtyyzbs.supabase.co';
const supabaseKey = 'sb_publishable_WaU7uJFzRSE91BHN0yMyaw_FCpmU_ot';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, email');
  
  if (pErr) {
    console.error('Error fetching profiles:', pErr);
    return;
  }

  const yash = profiles.find(p => p.email && p.email.includes('yashshah7117'));
  if (!yash) {
    console.log('Could not find Yash in profiles.');
    return;
  }
  console.log('Found Yash profile ID:', yash.id);

  // Now, let's load all team_members rows for Yash
  const { data: memberRows, error: tmErr } = await supabase
    .from('team_members')
    .select('*')
    .eq('user_id', yash.id);

  console.log('team_members rows for Yash:', memberRows);

  // Load all teams where owner_id is Yash
  const { data: ownedTeams, error: tErr } = await supabase
    .from('teams')
    .select('*')
    .eq('owner_id', yash.id);

  console.log('teams owned by Yash:', ownedTeams);
}

run();
