-- Migration: 202608040001_morrow_partner_page
-- Creates/updates partner_configs row for Morrow 1.0 (Makers Need More - MnM).

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
  type,
  tags,
  college,
  currency
) VALUES (
  '44067b2e-3c82-4502-8398-4ba8d1b91022',
  'Morrow 1.0',
  'Morrow 1.0 is a global open-source hackathon by Makers Need More (MnM) where students, developers, designers, and innovators build impactful open-source solutions.',
  '2026-07-29',
  '2026-08-31',
  'Online / Global',
  'online',
  'Certificate & Perks',
  'https://unstop.com/hackathons/morrow-10-makers-need-more-mnm-1727667',
  'external',
  ARRAY['Open Source', 'AI', 'Coding', 'Unstop'],
  'Makers Need More (MnM)',
  'INR'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  website_url = EXCLUDED.website_url,
  end_date = EXCLUDED.end_date,
  college = EXCLUDED.college;

INSERT INTO public.partner_configs (
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
) VALUES (
  'morrow',
  '44067b2e-3c82-4502-8398-4ba8d1b91022',
  'Morrow 1.0',
  'Global Open-Source Hackathon by Makers Need More (MnM) — Build & Ship Solutions at the Speed of Thought',
  '#6366F1',
  '#10B981',
  '/partners/morrow-logo.png',
  '/partners/morrow-banner.png',
  'Certificate & Perks',
  '{"website_url": "https://www.mnmworks.xyz/", "whatsapp_channel": "https://whatsapp.com/channel/0029VbDGVGg96H4VGs87xO2Z"}'::jsonb
) ON CONFLICT (slug) DO UPDATE SET
  hackathon_id = EXCLUDED.hackathon_id,
  partner_name = EXCLUDED.partner_name,
  tagline = EXCLUDED.tagline,
  brand_color = EXCLUDED.brand_color,
  accent_color = EXCLUDED.accent_color,
  logo_url = EXCLUDED.logo_url,
  banner_url = EXCLUDED.banner_url,
  override_prize_pool = EXCLUDED.override_prize_pool,
  features = EXCLUDED.features,
  updated_at = NOW();

INSERT INTO public.partner_configs (
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
) VALUES (
  'mnm',
  '44067b2e-3c82-4502-8398-4ba8d1b91022',
  'Morrow 1.0',
  'Global Open-Source Hackathon by Makers Need More (MnM) — Build & Ship Solutions at the Speed of Thought',
  '#6366F1',
  '#10B981',
  '/partners/morrow-logo.png',
  '/partners/morrow-banner.png',
  'Certificate & Perks',
  '{"website_url": "https://www.mnmworks.xyz/", "whatsapp_channel": "https://whatsapp.com/channel/0029VbDGVGg96H4VGs87xO2Z"}'::jsonb
) ON CONFLICT (slug) DO UPDATE SET
  hackathon_id = EXCLUDED.hackathon_id,
  partner_name = EXCLUDED.partner_name,
  tagline = EXCLUDED.tagline,
  brand_color = EXCLUDED.brand_color,
  accent_color = EXCLUDED.accent_color,
  logo_url = EXCLUDED.logo_url,
  banner_url = EXCLUDED.banner_url,
  override_prize_pool = EXCLUDED.override_prize_pool,
  features = EXCLUDED.features,
  updated_at = NOW();
