-- Migration: 202608020001_gamnexis_partner_page
-- Creates partner_configs row for Gamnexis - Puzzle Masters 2026.

DELETE FROM public.partner_configs WHERE slug IN ('puzzle-masters', 'puzzle-masters-hackathon-2026-unstop');

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
  'gamnexis',
  '00000000-0000-0000-0000-000001726256',
  'Gamnexis - Puzzle Masters 2026',
  'Build an Addictive Puzzle Game — National Level GameDev & AI Hackathon by Gamnexis',
  '#0284C7',
  '#38BDF8',
  '/partners/gamnexis-logo.jpg',
  '/partners/gamnexis-banner.jpg',
  '₹ 1,000 + Special Track Awards'
) ON CONFLICT (slug) DO UPDATE SET
  hackathon_id = EXCLUDED.hackathon_id,
  partner_name = EXCLUDED.partner_name,
  tagline = EXCLUDED.tagline,
  brand_color = EXCLUDED.brand_color,
  accent_color = EXCLUDED.accent_color,
  logo_url = EXCLUDED.logo_url,
  banner_url = EXCLUDED.banner_url,
  override_prize_pool = EXCLUDED.override_prize_pool,
  updated_at = NOW();
