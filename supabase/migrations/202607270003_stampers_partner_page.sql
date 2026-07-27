-- Migration: 202607270003_stampers_partner_page
-- Creates hackathons row and partner_configs row for STAMPERS National Hackathon 2026.

-- 1. Insert STAMPERS Hackathon into public.hackathons
INSERT INTO public.hackathons (
  id,
  name,
  description,
  start_date,
  end_date,
  location,
  mode,
  prize_pool,
  website_url,
  tags,
  type
) VALUES (
  '00000000-0000-0000-0000-000001703934',
  'STAMPERS National Hackathon 2026',
  'National Innovation Challenge. Find your team, build, and submit your project.',
  '2026-08-15T00:00:00Z',
  '2026-08-20T23:59:59Z',
  'Online',
  'online',
  'Prize Pool TBA',
  'https://www.hackermate.in/partners/stampers',
  ARRAY['AI', 'Web3', 'Open Innovation', 'Hackathon'],
  'native'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date;

-- 2. Insert STAMPERS Partner Configuration into public.partner_configs
INSERT INTO public.partner_configs (
  slug,
  hackathon_id,
  partner_name,
  tagline,
  brand_color,
  accent_color,
  logo_url,
  banner_url,
  override_prize_pool
) VALUES (
  'stampers',
  '00000000-0000-0000-0000-000001703934',
  'STAMPERS National Hackathon 2026',
  'National Innovation Challenge. Build and collaborate with top builders.',
  '#3B82F6',
  '#10B981',
  NULL,
  NULL,
  'Prize Pool TBA'
) ON CONFLICT (slug) DO UPDATE SET
  hackathon_id = EXCLUDED.hackathon_id,
  partner_name = EXCLUDED.partner_name,
  tagline = EXCLUDED.tagline,
  override_prize_pool = EXCLUDED.override_prize_pool,
  updated_at = NOW();
