const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function runEndToEndVerification() {
  console.log('=====================================================');
  console.log('COMPOSITE PRIMARY KEY END-TO-END RUNTIME VERIFICATION');
  console.log('=====================================================');

  // 1. Fetch a real team and two real hackathons from DB to use for test
  const { data: teams } = await supabase.from('teams').select('id, name').limit(1);
  const { data: hackathons } = await supabase.from('hackathons').select('id, name').limit(2);

  if (!teams || teams.length === 0 || !hackathons || hackathons.length < 2) {
    throw new Error('Verification requires at least 1 team and 2 hackathons in the database.');
  }

  const testTeamId = teams[0].id;
  const hackathonIdA = hackathons[0].id;
  const hackathonIdB = hackathons[1].id;

  console.log(`Test Team ID: ${testTeamId} ("${teams[0].name}")`);
  console.log(`Test Hackathon A ID: ${hackathonIdA} ("${hackathons[0].name}")`);
  console.log(`Test Hackathon B ID: ${hackathonIdB} ("${hackathons[1].name}")`);

  console.log('\n--- TEST STEP 1: INSERT SUBMISSION FOR HACKATHON A ---');
  const submissionA = {
    team_id: testTeamId,
    hackathon_id: hackathonIdA,
    project_title: 'Project Alpha (Hackathon A)',
    demo_url: 'https://alpha-demo.com',
    github_url: 'https://github.com/test/alpha',
    completion_status: 'submitted',
    updated_at: new Date().toISOString()
  };

  const { data: insertA, error: errA } = await supabase
    .from('team_submissions')
    .upsert(submissionA, { onConflict: 'team_id,hackathon_id' })
    .select();

  if (errA) throw new Error(`Insert A failed: ${errA.message}`);
  console.log('✅ Successfully inserted Submission A:', insertA[0].project_title);

  console.log('\n--- TEST STEP 2: INSERT SUBMISSION FOR HACKATHON B (SAME TEAM_ID) ---');
  const submissionB = {
    team_id: testTeamId,
    hackathon_id: hackathonIdB,
    project_title: 'Project Beta (Hackathon B)',
    demo_url: 'https://beta-demo.com',
    github_url: 'https://github.com/test/beta',
    completion_status: 'submitted',
    updated_at: new Date().toISOString()
  };

  const { data: insertB, error: errB } = await supabase
    .from('team_submissions')
    .upsert(submissionB, { onConflict: 'team_id,hackathon_id' })
    .select();

  if (errB) throw new Error(`Insert B failed: ${errB.message}`);
  console.log('✅ Successfully inserted Submission B:', insertB[0].project_title);

  console.log('\n--- TEST STEP 3: VERIFY BOTH SUBMISSIONS CO-EXIST INDEPENDENTLY ---');
  const { data: teamSubmissions, error: fetchErr } = await supabase
    .from('team_submissions')
    .select('*')
    .eq('team_id', testTeamId);

  if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);

  console.log(`Found ${teamSubmissions.length} submission rows for team_id ${testTeamId}:`);
  teamSubmissions.forEach(sub => {
    console.log(`  - Hackathon ID: ${sub.hackathon_id} | Title: "${sub.project_title}" | Repo: ${sub.github_url}`);
  });

  const hasA = teamSubmissions.some(s => s.hackathon_id === hackathonIdA && s.project_title === 'Project Alpha (Hackathon A)');
  const hasB = teamSubmissions.some(s => s.hackathon_id === hackathonIdB && s.project_title === 'Project Beta (Hackathon B)');

  if (teamSubmissions.length === 2 && hasA && hasB) {
    console.log('\n✅ VERIFICATION SUCCESS: Both submissions persisted independently without overwriting!');
  } else {
    throw new Error(`Verification failed! Expected 2 independent rows, found ${teamSubmissions.length}`);
  }

  console.log('\n--- TEST STEP 4: CLEANUP TEST ROWS ---');
  const { error: delErr } = await supabase
    .from('team_submissions')
    .delete()
    .eq('team_id', testTeamId);

  if (delErr) {
    console.error('Cleanup error:', delErr);
  } else {
    console.log('✅ Test rows cleaned up successfully.');
  }

  const { data: postCleanup } = await supabase.from('team_submissions').select('*').eq('team_id', testTeamId);
  console.log(`Remaining rows for test team: ${postCleanup ? postCleanup.length : 0}`);
}

runEndToEndVerification().catch(err => {
  console.error('Runtime verification failed:', err);
  process.exit(1);
});
