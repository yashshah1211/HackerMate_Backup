const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);

async function checkMigrations() {
  console.log('=== CHECKING SUPABASE MIGRATION HISTORY TABLE ===\n');

  const { data: migrations, error } = await adminClient
    .from('schema_migrations')
    .select('version')
    .order('version', { ascending: true });

  if (error) {
    console.error('Error fetching schema_migrations:', error);
    return;
  }

  console.log(`Total applied migration versions in DB: ${migrations.length}`);
  const versions = migrations.map(m => m.version);
  console.log('Contains 202607080007:', versions.includes('202607080007'));
  console.log('Contains 20260808183000:', versions.includes('20260808183000'));
  console.log('Contains 20260808184000:', versions.includes('20260808184000'));
}

checkMigrations();
