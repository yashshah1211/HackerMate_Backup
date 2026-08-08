const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

const CANONICAL_COLLEGE = 'TCET Mumbai (Thakur College of Engineering and Technology)';

async function run() {
  console.log('=== APPLYING MIGRATION ===');
  
  // Update profiles with non-canonical TCET names
  const { data: updatedProfiles, error: pErr } = await supabase
    .from('profiles')
    .update({ college: CANONICAL_COLLEGE })
    .or('college.eq.tcet,college.eq.Thakur College of engineering and technology,college.eq.Thakur College of Engineering and Technology')
    .select('id, full_name, email, college');

  if (pErr) {
    console.error('Error updating profiles:', pErr);
  } else {
    console.log(`Successfully updated ${updatedProfiles ? updatedProfiles.length : 0} profiles.`);
    (updatedProfiles || []).forEach(p => console.log(`  - [Updated Profile] ${p.full_name} (${p.email}) -> "${p.college}"`));
  }

  // Update teams if any matching non-canonical names exist
  const { data: updatedTeams, error: tErr } = await supabase
    .from('teams')
    .update({ college: CANONICAL_COLLEGE })
    .or('college.eq.tcet,college.eq.Thakur College of engineering and technology,college.eq.Thakur College of Engineering and Technology')
    .select('id, name, college');

  if (tErr) {
    console.error('Error updating teams:', tErr);
  } else {
    console.log(`Successfully updated ${updatedTeams ? updatedTeams.length : 0} teams.`);
  }

  console.log('\n=== VERIFYING POST-MIGRATION STATE ===');
  const { data: allProfiles } = await supabase.from('profiles').select('id, full_name, email, college');
  const tcetProfiles = (allProfiles || []).filter(p => p.college && (p.college.toLowerCase().includes('thakur') || p.college.toLowerCase().includes('tcet')));
  
  console.log(`Total profiles matching Thakur/TCET now: ${tcetProfiles.length}`);
  tcetProfiles.forEach(p => {
    console.log(`Profile: ${p.full_name} | Email: ${p.email} | College: "${p.college}"`);
  });

  const uniqueColleges = new Set(tcetProfiles.map(p => p.college));
  console.log('\nUnique college entries for TCET in database now:', Array.from(uniqueColleges));
}

run();
