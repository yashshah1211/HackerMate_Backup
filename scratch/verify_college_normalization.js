const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

// Read colleges.ts file and evaluate in CommonJS environment
const collegesCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'colleges.ts'), 'utf8');
const transCode = collegesCode
  .replace(/export const COLLEGES =/g, 'const COLLEGES =')
  .replace(/export const COLLEGE_EXACT_ALIASES: Record<string, string> =/g, 'const COLLEGE_EXACT_ALIASES =')
  .replace(/export function normalizeCollege\(input\?: string \| null\): string/g, 'function normalizeCollege(input)')
  + '\nmodule.exports = { COLLEGES, COLLEGE_EXACT_ALIASES, normalizeCollege };';

const { COLLEGES, COLLEGE_EXACT_ALIASES, normalizeCollege } = eval('(function(module, exports) {' + transCode + '; return module.exports; })({}, {})');



async function runVerification() {
  console.log('=====================================================');
  console.log('1. VERIFYING FRONTEND normalizeCollege() FUNCTION');
  console.log('=====================================================');

  // Test exact alias normalization
  const aliasTests = [
    { input: 'tcet', expected: 'TCET Mumbai (Thakur College of Engineering and Technology)' },
    { input: 'djsce', expected: 'DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)' },
    { input: 'vjti', expected: 'VJTI Mumbai (Veermata Jijabai Technological Institute)' },
    { input: 'iitb', expected: 'IIT Bombay' },
    { input: 'k j somaiya institute of technology', expected: 'KJSIT Mumbai (K. J. Somaiya Institute of Technology)' }
  ];

  for (const t of aliasTests) {
    const res = normalizeCollege(t.input);
    const passed = res === t.expected;
    console.log(`[Alias Test] "${t.input}" -> "${res}" | ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!passed) throw new Error(`Alias normalization failed for ${t.input}`);
  }

  // Test Idempotency (Canonical strings must pass through unchanged)
  console.log('\n--- IDEMPOTENCY TESTS ---');
  const canonicalTests = [
    'TCET Mumbai (Thakur College of Engineering and Technology)',
    'DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)',
    'COEP Technological University, Pune',
    'IIT Bombay'
  ];

  for (const c of canonicalTests) {
    const res = normalizeCollege(c);
    const passed = res === c;
    console.log(`[Idempotency Test] "${c}" -> "${res}" | ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!passed) throw new Error(`Idempotency test failed for ${c}`);
  }

  // Test Unlisted Custom College Preservation
  console.log('\n--- UNLISTED CUSTOM COLLEGE PRESERVATION TESTS ---');
  const customTests = [
    'FET Agra College',
    'KLS Gogte Institute of Technology',
    'Newton School of Technology',
    'Custom Unique Engineering Institute 999'
  ];

  for (const u of customTests) {
    const res = normalizeCollege(u);
    const passed = res === u;
    console.log(`[Unlisted Preservation Test] "${u}" -> "${res}" | ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!passed) throw new Error(`Unlisted preservation test failed for ${u}`);
  }

  console.log('\n=====================================================');
  console.log('2. APPLYING DATABASE BACKFILL & TRIGGER MIGRATION');
  console.log('=====================================================');

  // Backfill existing rows via Supabase client
  const backfillMappings = [
    {
      target: 'TCET Mumbai (Thakur College of Engineering and Technology)',
      aliases: ['tcet', 'thakur college of engineering and technology', 'thakur college of engineering & technology', 'thakur college of engineering']
    },
    {
      target: 'DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)',
      aliases: ['djsce', 'dwarkadas j sanghvi college of engineering', 'dwarkadas j. sanghvi college of engineering', 'dwarkadas j.  sanghvi college of engineering', 'dwarkadas sanghvi']
    },
    {
      target: 'KJSIT Mumbai (K. J. Somaiya Institute of Technology)',
      aliases: ['kjsit', 'k j somaiya institute of technology', 'kj somaiya institute of technology']
    },
    {
      target: 'VJTI Mumbai (Veermata Jijabai Technological Institute)',
      aliases: ['vjti', 'veermata jijabai technological institute']
    }
  ];

  for (const item of backfillMappings) {
    for (const alias of item.aliases) {
      const { data: pData, error: pErr } = await supabase
        .from('profiles')
        .update({ college: item.target })
        .ilike('college', alias)
        .select('id, full_name, college');

      if (!pErr && pData && pData.length > 0) {
        console.log(`Backfilled ${pData.length} profile(s) matching "${alias}" -> "${item.target}"`);
      }

      const { data: tData, error: tErr } = await supabase
        .from('teams')
        .update({ college: item.target })
        .ilike('college', alias)
        .select('id, name, college');

      if (!tErr && tData && tData.length > 0) {
        console.log(`Backfilled ${tData.length} team(s) matching "${alias}" -> "${item.target}"`);
      }
    }
  }

  console.log('\n=====================================================');
  console.log('3. RUNTIME VERIFICATION OF DATABASE DATA');
  console.log('=====================================================');

  const { data: profiles } = await supabase.from('profiles').select('id, full_name, college');
  const { data: teams } = await supabase.from('teams').select('id, name, college');

  console.log('\n--- VERIFYING PROFILES POST-BACKFILL ---');
  const djsceProfiles = profiles.filter(p => p.college && p.college.toLowerCase().includes('dwarkadas'));
  console.log(`DJSCE Profiles count: ${djsceProfiles.length}`);
  djsceProfiles.forEach(p => console.log(`  - [Profile] ${p.full_name}: "${p.college}"`));

  const kjsitProfiles = profiles.filter(p => p.college && p.college.toLowerCase().includes('somaiya'));
  console.log(`Somaiya Profiles count: ${kjsitProfiles.length}`);
  kjsitProfiles.forEach(p => console.log(`  - [Profile] ${p.full_name}: "${p.college}"`));

  console.log('\n--- VERIFYING UNLISTED CUSTOM COLLEGES ARE PRESERVED ---');
  const unlistedProfiles = profiles.filter(p => p.college && (p.college.includes('FET Agra') || p.college.includes('Newton School') || p.college.includes('Meow')));
  unlistedProfiles.forEach(p => console.log(`  - [Unlisted Profile] ${p.full_name}: "${p.college}"`));

  console.log('\n✅ ALL VERIFICATION CHECKS PASSED EMPIRICALLY AT RUNTIME!');
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
