const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');

// Parse database URL or pooler connection
let dbUrl = env.match(/DATABASE_URL=(.*)/)?.[1]?.trim();
if (!dbUrl) {
  // Construct direct connection URL if omitted
  const projectRef = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].split('//')[1].split('.')[0];
  const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
  dbUrl = `postgres://postgres.${projectRef}:${serviceKey}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
}

async function runMigration() {
  console.log('=== APPLYING MIGRATION: 202608080005_fix_profiles_email_privacy_leak.sql ===');

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '202608080005_fix_profiles_email_privacy_leak.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Also test executing via pg client or supabase management API
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database.');
    await client.query(sql);
    console.log('✅ Successfully applied migration 202608080005_fix_profiles_email_privacy_leak.sql!');
  } catch (err) {
    console.error('Error applying migration via pg:', err.message);
  } finally {
    await client.end();
  }
}

runMigration();
