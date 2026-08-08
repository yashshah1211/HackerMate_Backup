const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function run() {
  const tables = ['profiles', 'teams', 'hackathons', 'organizer_leads', 'sih_submissions', 'sih_team_members'];
  for (const t of tables) {
    try {
      const { data, error } = await supabase.from(t).select('*').limit(1);
      if (error) {
        console.log(`Table ${t} read error:`, error.message);
        continue;
      }
      if (data && data.length > 0) {
        const cols = Object.keys(data[0]);
        if (cols.includes('college')) {
          const { data: matches } = await supabase.from(t).select('*').or('college.ilike.%thakur%,college.ilike.%tcet%');
          console.log(`Table ${t} has ${matches ? matches.length : 0} matching entries for thakur/tcet.`);
          if (matches && matches.length > 0) {
            matches.forEach(m => console.log(`  - [${t}] ID: ${m.id}, college: "${m.college}"`));
          }
        } else {
          console.log(`Table ${t} exists but does NOT have a 'college' column.`);
        }
      } else {
        console.log(`Table ${t} is empty.`);
      }
    } catch (e) {
      console.log(`Table ${t} exception:`, e.message);
    }
  }
}

run();
