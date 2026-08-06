const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envPath = 'c:/Users/yashs/OneDrive/Desktop/HackerMate_Backup/frontend/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkQodex() {
  const { data: leads } = await supabaseAdmin
    .from("organizer_leads")
    .select("*")
    .ilike("title", "%qodex%");

  console.log("Qodex Leads:", leads);

  const { data: hackathons } = await supabaseAdmin
    .from("hackathons")
    .select("id, name, website_url")
    .ilike("name", "%qodex%");

  console.log("Qodex Hackathons:", hackathons);
}

checkQodex();
