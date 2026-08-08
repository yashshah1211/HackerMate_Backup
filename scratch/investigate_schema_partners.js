const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function investigateSchemaAndPartners() {
  console.log('=== POINT 1: HACKATHONS TABLE COLUMNS ===');
  const { data: hSample } = await supabase.from('hackathons').select('*').limit(1);
  if (hSample && hSample.length > 0) {
    console.log(Object.keys(hSample[0]));
  }

  console.log('\n=== POINT 1: PARTNER_CONFIGS TABLE COLUMNS ===');
  const { data: pSample } = await supabase.from('partner_configs').select('*').limit(1);
  if (pSample && pSample.length > 0) {
    console.log(Object.keys(pSample[0]));
  }

  console.log('\n=== POINT 2: LIVE PARTNER HACKATHONS & PARTNER CONFIGS ===');
  const { data: partners, error: pErr } = await supabase
    .from('partner_configs')
    .select('*, hackathons(*)');
  
  if (pErr) console.error('Error fetching partner configs:', pErr);
  else {
    console.log(`Found ${partners.length} partner_configs rows:`);
    partners.forEach(p => {
      console.log(`- Partner Slug: "${p.slug}" | Hackathon ID: ${p.hackathon_id} | Title: "${p.hackathons?.title || p.hackathons?.name}" | Status: ${p.hackathons?.status}`);
    });
  }

  console.log('\n=== POINT 2: ALL HACKATHONS ROWS IN DB ===');
  const { data: allH } = await supabase.from('hackathons').select('id, name, type, start_date, end_date, mode, college');
  if (allH) {
    console.log(`Total hackathons: ${allH.length}`);
    allH.forEach(h => {
      console.log(`- ID: ${h.id} | Name: "${h.name}" | Type: ${h.type} | Mode: ${h.mode}`);
    });
  }

}

investigateSchemaAndPartners();
