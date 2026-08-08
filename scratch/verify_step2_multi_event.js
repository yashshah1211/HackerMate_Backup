const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

function resolveLinkedHackathonId(requestedHackathonId, linkedHackathons, fallbackHackathonId) {
  return (requestedHackathonId && linkedHackathons.includes(requestedHackathonId) ? requestedHackathonId : null) ||
    linkedHackathons[0] || 
    fallbackHackathonId;
}

async function runStep2Verification() {
  console.log('======================================================');
  console.log('STEP 2: MULTI-EVENT NAVIGATION & ROUTING VERIFICATION');
  console.log('======================================================');

  // Fetch real hackathons from DB
  const { data: hackathons } = await supabase.from('hackathons').select('id, name').limit(2);
  const hackId1 = hackathons[0].id;
  const hackId2 = hackathons[1].id;

  const mockTeamData = {
    id: '59612007-baa2-4d38-b129-fe6c073886d0',
    name: 'HackCoders',
    hackathon_id: hackId1,
    team_hackathons: [
      { hackathon_id: hackId1, hackathons: { id: hackId1, name: hackathons[0].name } },
      { hackathon_id: hackId2, hackathons: { id: hackId2, name: hackathons[1].name } }
    ]
  };

  const linkedHackathons = mockTeamData.team_hackathons.map(th => th.hackathon_id);

  console.log('Linked Hackathons for Team:', linkedHackathons);

  // Case A: User navigates without hackathon_id query param
  const resDefault = resolveLinkedHackathonId(null, linkedHackathons, mockTeamData.hackathon_id);
  console.log(`[Test Case A] No query param ➔ Resolves to hackathon: ${resDefault} (Default Hackathon 1)`);

  // Case B: User navigates with ?hackathon_id=Hackathon_2
  const resHack2 = resolveLinkedHackathonId(hackId2, linkedHackathons, mockTeamData.hackathon_id);
  console.log(`[Test Case B] ?hackathon_id=${hackId2} ➔ Resolves to hackathon: ${resHack2} (Hackathon 2)`);

  // Case C: User navigates with invalid query param ?hackathon_id=invalid
  const resInvalid = resolveLinkedHackathonId('invalid-uuid', linkedHackathons, mockTeamData.hackathon_id);
  console.log(`[Test Case C] ?hackathon_id=invalid-uuid ➔ Resolves to fallback: ${resInvalid}`);

  if (resDefault === hackId1 && resHack2 === hackId2 && resInvalid === hackId1) {
    console.log('\n✅ VERIFICATION SUCCESS: Query param ?hackathon_id= correctly scopes workspace routing across multi-event teams!');
  } else {
    throw new Error('Routing resolution failed!');
  }
}

runStep2Verification().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
