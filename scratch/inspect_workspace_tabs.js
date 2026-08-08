const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function inspectWorkspaceTabs() {
  console.log('=== AUDITING WORKSPACE TAB TABLES ===');

  const tables = [
    'team_submissions',
    'team_tasks',
    'team_brainstorm_ideas',
    'team_links',
    'team_deployments',
    'team_activities'
  ];

  for (const table of tables) {
    const { data: sample, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`- ${table}: Error fetching (${error.message})`);
    } else {
      const cols = Object.keys(sample[0] || {});
      console.log(`- ${table}: [${cols.join(', ')}]`);
    }
  }
}

inspectWorkspaceTabs();
