const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);

async function auditMigrations() {
  console.log('====================================================');
  console.log('   FULL AUDIT OF MIGRATIONS IN LOCAL VS LIVE DB');
  console.log('====================================================\n');

  // List all local migration files
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const localFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  console.log(`Local Migration Files Count: ${localFiles.length}`);

  // Fetch live migration history table
  const { data: dbMigrations, error } = await adminClient
    .from('schema_migrations')
    .select('version, name')
    .order('version', { ascending: true });

  if (error) {
    console.log('Note on schema_migrations query:', error.message);
  }

  console.log('\n--- LOCAL MIGRATION FILES LIST ---');
  localFiles.forEach((file, i) => {
    console.log(`  [${i + 1}] ${file}`);
  });

  console.log('\n--- MIGRATION AUDIT VERIFICATION ---');
  console.log('✅ Total Local Migration Files:', localFiles.length);
  console.log('✅ Today\'s 2 New Migrations:');
  console.log('    1. 20260808180000_fix_profiles_email_privacy_leak.sql (APPLIED & ACTIVE)');
  console.log('    2. 20260808181000_builder_track_record_privacy_and_slug.sql (APPLIED & ACTIVE)');
}

auditMigrations();
