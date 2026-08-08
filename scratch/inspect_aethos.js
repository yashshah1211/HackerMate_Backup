const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function inspectAethosSetup() {
  console.log('=== AETHOS PARTNER CONFIG ===');
  const { data: aethosConfig } = await supabase
    .from('partner_configs')
    .select('*, hackathons(*)')
    .eq('slug', 'aethos')
    .single();

  console.log('Aethos partner_config:', {
    slug: aethosConfig?.slug,
    hackathon_id: aethosConfig?.hackathon_id,
    hackathon_name: aethosConfig?.hackathons?.name,
    features: aethosConfig?.features
  });

  console.log('\n=== TEAMS LINKED TO AETHOS HACKATHON ID ===');
  const { data: teamHackathons } = await supabase
    .from('team_hackathons')
    .select('*, teams(*)')
    .eq('hackathon_id', aethosConfig.hackathon_id);

  console.log(`Found ${teamHackathons ? teamHackathons.length : 0} team_hackathons entries for Æthos hackathon_id:`);
  (teamHackathons || []).forEach(th => {
    console.log(`- Team ID: ${th.team_id} | Name: "${th.teams?.name}" | Description: "${th.teams?.description}"`);
  });

  console.log('\n=== BUILDER REGISTRATIONS LINKED TO AETHOS HACKATHON ID ===');
  const { data: regs } = await supabase
    .from('hackathon_registrations')
    .select('*, profiles(full_name, email)')
    .eq('hackathon_id', aethosConfig.hackathon_id);

  console.log(`Found ${regs ? regs.length : 0} hackathon_registrations entries for Æthos hackathon_id:`);
  (regs || []).forEach(r => {
    console.log(`- User: ${r.profiles?.full_name} (${r.profiles?.email}) | Metadata:`, r.metadata);
  });
}

inspectAethosSetup();
