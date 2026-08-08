const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function applySteps1And2() {
  console.log('=== APPLYING STEP 1 DDL & STEP 2 BACKFILL ===');
  
  // We can call Supabase SQL endpoint directly using service_role key
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202608080003_team_submissions_composite_pk.sql'), 'utf8');
  
  const res = await fetch(`${url}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({ query: sql })
  });

  console.log('RPC exec response status:', res.status);
  const text = await res.text();
  console.log('RPC exec response text:', text);
}

applySteps1And2();
