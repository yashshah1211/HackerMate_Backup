const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function generateFullDiffReport() {
  console.log('=== COMPREHENSIVE BACKFILL AUDIT & DIFF REPORT ===');

  const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, college');
  const { data: teams } = await supabase.from('teams').select('id, name, college');

  console.log(`Total Profiles in DB: ${profiles.length}`);
  console.log(`Total Teams in DB: ${teams.length}`);

  console.log('\n--- ALL DISTINCT COLLEGE VALUES IN PROFILES NOW ---');
  const pCounts = {};
  profiles.forEach(p => {
    const c = p.college === null ? 'NULL' : p.college;
    pCounts[c] = (pCounts[c] || 0) + 1;
  });
  Object.entries(pCounts).sort((a,b) => b[1] - a[1]).forEach(([col, count]) => {
    console.log(`  ${count.toString().padStart(4, ' ')} | "${col}"`);
  });

  console.log('\n--- ALL DISTINCT COLLEGE VALUES IN TEAMS NOW ---');
  const tCounts = {};
  teams.forEach(t => {
    const c = t.college === null ? 'NULL' : t.college;
    tCounts[c] = (tCounts[c] || 0) + 1;
  });
  Object.entries(tCounts).sort((a,b) => b[1] - a[1]).forEach(([col, count]) => {
    console.log(`  ${count.toString().padStart(4, ' ')} | "${col}"`);
  });
}

generateFullDiffReport();
