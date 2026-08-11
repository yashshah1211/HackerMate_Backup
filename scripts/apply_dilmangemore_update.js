/**
 * Admin Script: apply_dilmangemore_update.js
 * 
 * Purpose: Update missing college field for team 'DILMANGEMORE' (SIH 2026 team).
 * Reason: Team was created on 2026-08-01 with an unselected college field in the creation form.
 * Target Record: Team ID 20eb641e-7e21-4906-8acf-793e8fc87203
 * Target Value: "TCET Mumbai (Thakur College of Engineering and Technology)" (Owner: Prashant Shukla)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envText = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    env[key] = val;
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function runUpdate() {
  console.log('Applying data correction for team DILMANGEMORE...');
  const { data, error } = await supabase
    .from('teams')
    .update({ college: 'TCET Mumbai (Thakur College of Engineering and Technology)' })
    .eq('id', '20eb641e-7e21-4906-8acf-793e8fc87203')
    .select();

  if (error) {
    console.error('❌ Failed to update team:', error);
    process.exit(1);
  } else {
    console.log('✅ Successfully updated team DILMANGEMORE:');
    console.log(JSON.stringify(data, null, 2));
  }
}

runUpdate();
