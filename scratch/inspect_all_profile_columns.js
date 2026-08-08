const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);

async function inspectColumns() {
  console.log('=== INSPECTING ALL COLUMNS IN PUBLIC.PROFILES ===');

  const { data: row } = await adminClient
    .from('profiles')
    .select('*')
    .limit(1)
    .single();

  if (row) {
    console.log('Total Columns:', Object.keys(row).length);
    console.log('All Columns List:');
    console.log(JSON.stringify(Object.keys(row), null, 2));
  }
}

inspectColumns();
