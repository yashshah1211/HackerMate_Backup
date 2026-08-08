const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function run() {
  console.log('=== PROFILES (by college name or email domain) ===');
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, full_name, email, college');
  if (pErr) console.error('Profiles error:', pErr);
  
  const pMatch = (profiles || []).filter(p => {
    const col = (p.college || '').toLowerCase();
    const em = (p.email || '').toLowerCase();
    return col.includes('thakur') || col.includes('tcet') || col.includes('thackur') || em.includes('tcetmumbai');
  });
  console.log('Matching profiles count:', pMatch.length);
  pMatch.forEach(p => console.log(`Profile ID: ${p.id} | Name: ${p.full_name} | Email: ${p.email} | College: "${p.college}"`));

  console.log('\n=== TEAMS ===');
  const { data: teams, error: tErr } = await supabase.from('teams').select('id, name, college');
  if (tErr) console.error('Teams error:', tErr);
  const tMatch = (teams || []).filter(t => t.college && (t.college.toLowerCase().includes('thakur') || t.college.toLowerCase().includes('tcet') || t.college.toLowerCase().includes('thackur')));
  console.log('Matching teams count:', tMatch.length);
  tMatch.forEach(t => console.log(`Team ID: ${t.id} | Name: ${t.name} | College: "${t.college}"`));

  console.log('\n=== BREAKDOWN OF UNIQUE COLLEGE ENTRIES IN PROFILES ===');
  const counts = {};
  (profiles || []).forEach(p => {
    const col = (p.college || '');
    if (col.toLowerCase().includes('thakur') || col.toLowerCase().includes('tcet') || col.toLowerCase().includes('thackur')) {
      counts[col] = (counts[col] || 0) + 1;
    }
  });
  Object.entries(counts).forEach(([col, count]) => {
    console.log(`- "${col}": ${count} profile(s)`);
  });
}

run();
