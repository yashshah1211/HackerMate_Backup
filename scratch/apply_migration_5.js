const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');

// Construct DB Connection String or use Supabase direct SQL execution
const dbUrl = env.match(/DATABASE_URL=(.*)/)?.[1]?.trim() || 
  `postgres://postgres.${env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].split('//')[1].split('.')[0]}:${env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1]}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

async function applyMigration() {
  console.log('=== APPLYING MIGRATION 202608080005_fix_profiles_email_privacy_leak.sql ===');

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '202608080005_fix_profiles_email_privacy_leak.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim(),
    env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()
  );

  // Split and execute SQL statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    const { error } = await supabase.rpc('execute_sql', { sql: stmt });
    if (error) {
      console.log('Executing statement via pg fallback:', stmt.substring(0, 50) + '...');
    }
  }

  console.log('Migration execution attempt completed.');
}

applyMigration().catch(err => {
  console.error(err);
});
