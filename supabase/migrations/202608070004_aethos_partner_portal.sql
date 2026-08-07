-- Migration: Provision ÆTHOS - Day Zero Hackathon & Partner Portal Config
do $$
declare
  v_hackathon_id uuid;
begin
  -- Check if hackathon already exists
  select id into v_hackathon_id
  from public.hackathons
  where name ilike '%AETHOS%' or name ilike '%ÆTHOS%' or name ilike '%Day Zero%'
  limit 1;

  if v_hackathon_id is null then
    insert into public.hackathons (
      id,
      name,
      description,
      mode,
      type,
      prize_pool,
      currency,
      website_url,
      tags,
      start_date
    ) values (
      gen_random_uuid(),
      'ÆTHOS — Day Zero Hackathon',
      'Official National Innovation & Tech Hackathon organized by Alpha Forge. Build high-impact solutions across AI, Web3, Systems, and Open Innovation.',
      'online',
      'external',
      '₹1,00,000+ & Perks',
      'INR (₹)',
      'https://hackermate.in/partners/aethos',
      array['AI/ML', 'Web3', 'Open Innovation', 'Cyber Security', 'GameDev'],
      now()
    )
    returning id into v_hackathon_id;
  end if;

  -- Insert/Upsert partner_configs for 'aethos'
  insert into public.partner_configs (
    slug,
    hackathon_id,
    partner_name,
    tagline,
    brand_color,
    accent_color,
    logo_url,
    banner_url,
    override_prize_pool,
    features
  ) values (
    'aethos',
    v_hackathon_id,
    'ÆTHOS — Day Zero',
    'Official Co-Branded Teammate Matcher & Partner Portal for ÆTHOS — Day Zero by Alpha Forge. Tomorrow Begins.',
    '#F59E0B',
    '#EF4444',
    '/partners/aethos-logo.jpg',
    '/partners/aethos-logo.jpg',
    '₹1,00,000+ Pool',
    jsonb_build_object(
      'organizer', 'Alpha Forge',
      'organizer_logo', '/partners/alpha-forge-logo.jpg',
      'events', jsonb_build_array(
        jsonb_build_object('id', 'ai-ml', 'name', 'AI & Machine Learning'),
        jsonb_build_object('id', 'web3-systems', 'name', 'Web3 & Decentralized Systems'),
        jsonb_build_object('id', 'open-innovation', 'name', 'Open Innovation'),
        jsonb_build_object('id', 'cyber-gamedev', 'name', 'Cyber Security & GameDev')
      )
    )
  )
  on conflict (slug) do update set
    hackathon_id = excluded.hackathon_id,
    partner_name = excluded.partner_name,
    tagline = excluded.tagline,
    brand_color = excluded.brand_color,
    accent_color = excluded.accent_color,
    logo_url = excluded.logo_url,
    banner_url = excluded.banner_url,
    features = excluded.features;

  -- Also insert alias slug 'aethos-day-zero'
  insert into public.partner_configs (
    slug,
    hackathon_id,
    partner_name,
    tagline,
    brand_color,
    accent_color,
    logo_url,
    banner_url,
    override_prize_pool,
    features
  ) values (
    'aethos-day-zero',
    v_hackathon_id,
    'ÆTHOS — Day Zero',
    'Official Co-Branded Teammate Matcher & Partner Portal for ÆTHOS — Day Zero by Alpha Forge. Tomorrow Begins.',
    '#F59E0B',
    '#EF4444',
    '/partners/aethos-logo.jpg',
    '/partners/aethos-logo.jpg',
    '₹1,00,000+ Pool',
    jsonb_build_object(
      'organizer', 'Alpha Forge',
      'organizer_logo', '/partners/alpha-forge-logo.jpg',
      'events', jsonb_build_array(
        jsonb_build_object('id', 'ai-ml', 'name', 'AI & Machine Learning'),
        jsonb_build_object('id', 'web3-systems', 'name', 'Web3 & Decentralized Systems'),
        jsonb_build_object('id', 'open-innovation', 'name', 'Open Innovation'),
        jsonb_build_object('id', 'cyber-gamedev', 'name', 'Cyber Security & GameDev')
      )
    )
  )
  on conflict (slug) do update set
    hackathon_id = excluded.hackathon_id,
    partner_name = excluded.partner_name,
    tagline = excluded.tagline,
    brand_color = excluded.brand_color,
    accent_color = excluded.accent_color,
    logo_url = excluded.logo_url,
    banner_url = excluded.banner_url,
    features = excluded.features;

end $$;
