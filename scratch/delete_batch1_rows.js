const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);

async function deleteBatch1Rows() {
  console.log('========================================================');
  console.log('   DELETING EXACTLY THE 52 BATCH 1 ROWS FROM TEAM_HACKATHONS');
  console.log('========================================================\n');

  const targetTimestamp = '2026-08-08T15:46:21.549831+00:00';

  // 1. Verify rows before deletion
  const { data: targetRows, error: fetchErr } = await adminClient
    .from('team_hackathons')
    .select('team_id, hackathon_id')
    .eq('created_at', targetTimestamp);

  if (fetchErr) {
    console.error('Error fetching target rows:', fetchErr);
    process.exit(1);
  }

  console.log(`Found ${targetRows.length} rows to delete (EXPECTED EXACTLY 52).`);

  if (targetRows.length !== 52) {
    console.error(`❌ ABORTING SAFETY GUARD: Expected 52 rows, but found ${targetRows.length}`);
    process.exit(1);
  }

  // 2. Perform exact deletion of Batch 1
  const { error: delErr } = await adminClient
    .from('team_hackathons')
    .delete()
    .eq('created_at', targetTimestamp);

  if (delErr) {
    console.error('❌ Error during deletion:', delErr);
    process.exit(1);
  }

  console.log('✅ Successfully deleted 52 batch rows created at 15:46:21.549831+00:00.');

  // 3. Verify remaining team_hackathons count created today
  const { data: remainingToday } = await adminClient
    .from('team_hackathons')
    .select('team_id, hackathon_id, created_at, teams(name), hackathons(name)')
    .gte('created_at', '2026-08-08T00:00:00.000Z');

  console.log(`\nRemaining team_hackathons created today: ${remainingToday?.length} rows (EXPECTED EXACTLY 3 real user activity rows).`);
  remainingToday?.forEach(r => {
    console.log(`  - Team "${r.teams?.name}" -> Hackathon "${r.hackathons?.name}" (Created: ${r.created_at})`);
  });
}

deleteBatch1Rows();
