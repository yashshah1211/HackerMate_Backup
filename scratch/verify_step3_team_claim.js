const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function runStep3EmpiricalVerification() {
  console.log('===========================================================');
  console.log('STEP 3: MULTI-EVENT TEAM LINKING & TRIGGER VERIFICATION');
  console.log('===========================================================');

  // 1. Fetch a real team and two real active hackathons
  const { data: teams } = await supabase.from('teams').select('id, name').limit(1);
  const { data: hackathons } = await supabase.from('hackathons').select('id, name').limit(2);

  const teamId = teams[0].id;
  const hackId1 = hackathons[0].id;
  const hackId2 = hackathons[1].id;

  console.log(`Testing Team: "${teams[0].name}" (${teamId})`);
  console.log(`Hackathon 1: "${hackathons[0].name}" (${hackId1})`);
  console.log(`Hackathon 2: "${hackathons[1].name}" (${hackId2})`);

  console.log('\n--- STEP 1: LINKING TEAM TO HACKATHON 1 ---');
  const { error: err1 } = await supabase.from('team_hackathons').upsert(
    { team_id: teamId, hackathon_id: hackId1 },
    { onConflict: 'team_id,hackathon_id' }
  );
  if (err1) throw new Error(`Link 1 failed: ${err1.message}`);
  console.log('✅ Successfully linked team to Hackathon 1');

  console.log('\n--- STEP 2: LINKING SAME TEAM TO HACKATHON 2 (TESTING DB TRIGGER REMOVAL) ---');
  const { error: err2 } = await supabase.from('team_hackathons').upsert(
    { team_id: teamId, hackathon_id: hackId2 },
    { onConflict: 'team_id,hackathon_id' }
  );

  if (err2) {
    throw new Error(`Link 2 failed with DB error (trigger still active!): ${err2.message}`);
  }
  console.log('✅ Successfully linked SAME team to Hackathon 2 without trigger exception!');

  console.log('\n--- STEP 3: VERIFYING BOTH LINKS EXIST IN DATABASE ---');
  const { data: links } = await supabase
    .from('team_hackathons')
    .select('*, hackathons(name)')
    .eq('team_id', teamId);

  console.log(`Found ${links.length} active team_hackathons rows for team "${teams[0].name}":`);
  links.forEach(l => {
    console.log(`  - Hackathon: "${l.hackathons?.name}" (${l.hackathon_id})`);
  });

  const has1 = links.some(l => l.hackathon_id === hackId1);
  const has2 = links.some(l => l.hackathon_id === hackId2);

  if (links.length >= 2 && has1 && has2) {
    console.log('\n✅ EMPIRICAL VERIFICATION SUCCESS: Teams can now register for multiple active hackathons smoothly!');
  } else {
    throw new Error('Verification failed: Both hackathon links were not found.');
  }

  console.log('\n--- STEP 4: CLEANUP SECOND TEST LINK ---');
  await supabase.from('team_hackathons').delete().eq('team_id', teamId).eq('hackathon_id', hackId2);
  console.log('✅ Cleaned up second test link.');
}

runStep3EmpiricalVerification().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
