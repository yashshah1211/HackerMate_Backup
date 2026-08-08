const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

async function runRpcMigration() {
  console.log('=== APPLYING MIGRATION VIA SERVICE ROLE SQL RPC ===');

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '202608080005_fix_profiles_email_privacy_leak.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Attempt RPC endpoints
  const endpoints = ['exec', 'execute_sql', 'pg_exec'];

  for (const ep of endpoints) {
    console.log(`Trying /rest/v1/rpc/${ep}...`);
    try {
      const res = await fetch(`${url}/rest/v1/rpc/${ep}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({ query: sql, sql: sql })
      });

      console.log(`Endpoint ${ep} status:`, res.status);
      const text = await res.text();
      console.log(`Endpoint ${ep} response:`, text);
      if (res.ok) {
        console.log(`✅ Success via /rest/v1/rpc/${ep}!`);
        return;
      }
    } catch (err) {
      console.error(`Endpoint ${ep} error:`, err.message);
    }
  }
}

runRpcMigration();
