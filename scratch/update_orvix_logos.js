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

async function updateOrvixLogos() {
  const { data, error } = await supabaseAdmin
    .from('partner_configs')
    .update({
      logo_url: '/partners/orvix-logo.jpg',
      banner_url: '/partners/nimblux-logo.jpg',
      features: {
        website_url: 'https://unstop.com/hackathons/orvix-hackathon-nimblux-1730437',
        organizer: 'NIMBLUX',
        organizer_logo: '/partners/nimblux-logo.jpg'
      },
      updated_at: new Date().toISOString()
    })
    .eq('slug', 'orvix')
    .select()
    .single();

  if (error) {
    console.error('Error updating Orvix logos:', error);
  } else {
    console.log('Successfully updated Orvix partner config with logos!');
    console.log('Result:', data);
  }
}

updateOrvixLogos();
