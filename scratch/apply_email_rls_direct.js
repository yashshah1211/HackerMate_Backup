const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');

// Use pooler or direct host
// Project ref: rhryjrbebfrrfhtyyzbs
const projectRef = 'rhryjrbebfrrfhtyyzbs';

// Try standard pooler connection strings
const connStrings = [
  `postgres://postgres.${projectRef}:postgres@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
  `postgres://postgres.${projectRef}:postgres@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
  `postgres://postgres:${env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1]}@db.${projectRef}.supabase.co:5432/postgres`
];

async function tryConnectAndExecute() {
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '202608080005_fix_profiles_email_privacy_leak.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  for (const connStr of connStrings) {
    console.log('Trying connection...');
    const client = new Client({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });

    try {
      await client.connect();
      console.log(' Connected! Executing SQL...');
      await client.query(sql);
      console.log('✅ Migration 202608080005 executed successfully!');
      await client.end();
      return;
    } catch (err) {
      console.log(' Failed with:', err.message);
      try { await client.end(); } catch (e) {}
    }
  }
}

tryConnectAndExecute();
