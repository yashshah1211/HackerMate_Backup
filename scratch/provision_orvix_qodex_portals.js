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

async function provisionPartnerPortals() {
  const orvixHackathonId = '4262afa3-83bf-426d-a6ff-6f81e071860c';
  const qodexHackathonId = '09d290c4-2ac9-4eea-9dcb-a1bf66b33496';

  // 1. Provision Orvix Partner Portal
  const orvixConfig = {
    slug: 'orvix',
    hackathon_id: orvixHackathonId,
    partner_name: 'Orvix Hackathon 2026',
    tagline: 'National Online Innovation Sprint by NIMBLUX — Build AI, Web, Mobile, Web3 & Open Innovation Solutions',
    brand_color: '#8B5CF6',
    accent_color: '#06B6D4',
    logo_url: null,
    banner_url: null,
    override_prize_pool: 'Winner & Participation Certificates + Sponsored Perks',
    features: {
      website_url: 'https://unstop.com/hackathons/orvix-hackathon-nimblux-1730437',
      organizer: 'NIMBLUX'
    },
    updated_at: new Date().toISOString()
  };

  const { data: existingOrvix } = await supabaseAdmin
    .from('partner_configs')
    .select('id')
    .eq('slug', 'orvix')
    .maybeSingle();

  let orvixRes;
  if (existingOrvix) {
    orvixRes = await supabaseAdmin
      .from('partner_configs')
      .update(orvixConfig)
      .eq('id', existingOrvix.id)
      .select()
      .single();
  } else {
    orvixRes = await supabaseAdmin
      .from('partner_configs')
      .insert(orvixConfig)
      .select()
      .single();
  }

  if (orvixRes.error) {
    console.error('Error provisioning Orvix portal:', orvixRes.error);
  } else {
    console.log('Successfully provisioned Orvix partner portal!');
    console.log('Portal URL: /partners/orvix');
  }

  // 2. Provision Qodex Partner Portal
  const qodexConfig = {
    slug: 'qodex',
    hackathon_id: qodexHackathonId,
    partner_name: 'QodeX 2026',
    tagline: 'National Coding & Tech Innovation Challenge by Aravali International School',
    brand_color: '#2563EB',
    accent_color: '#10B981',
    logo_url: null,
    banner_url: null,
    override_prize_pool: 'Winner & Participation Certificates + Perks',
    features: {
      website_url: 'https://unstop.com/hackathons/qodex-aravali-international-school-1727842',
      organizer: 'Aravali International School'
    },
    updated_at: new Date().toISOString()
  };

  const { data: existingQodex } = await supabaseAdmin
    .from('partner_configs')
    .select('id')
    .eq('slug', 'qodex')
    .maybeSingle();

  let qodexRes;
  if (existingQodex) {
    qodexRes = await supabaseAdmin
      .from('partner_configs')
      .update(qodexConfig)
      .eq('id', existingQodex.id)
      .select()
      .single();
  } else {
    qodexRes = await supabaseAdmin
      .from('partner_configs')
      .insert(qodexConfig)
      .select()
      .single();
  }

  if (qodexRes.error) {
    console.error('Error provisioning Qodex portal:', qodexRes.error);
  } else {
    console.log('Successfully provisioned Qodex partner portal!');
    console.log('Portal URL: /partners/qodex');
  }

  // Also update lead status in organizer_leads to 'partner_live' for both
  await supabaseAdmin
    .from('organizer_leads')
    .update({ status: 'partner_live' })
    .or('title.ilike.%orvix%,title.ilike.%qodex%');

  console.log('Updated organizer lead statuses to partner_live.');
}

provisionPartnerPortals();
