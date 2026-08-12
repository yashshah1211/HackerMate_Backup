-- Migration: 202608120001_startupx_partner_page
-- Creates hackathons row and partner_configs row for Gamnexis - StartupX 2026.

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
  '00000000-0000-0000-0000-000001111000',
  'StartupX Hackathon 2026',
  'Free online innovation and startup hackathon organized by Gamnexis. Turn your idea into a real startup! Open innovation across any domain (AI/ML, Web/SaaS, Mobile, FinTech, HealthTech, EdTech, Cybersecurity, Gaming, Blockchain, IoT, Social Impact). Solo builders & teams of 1-6 allowed.',
  '2026-08-10 00:00:00+05:30',
  '2026-09-25 12:00:00+05:30',
  'Online / Virtual',
  'online',
  '₹10,000 Cash Pool + Uplearn Subscriptions',
  'https://unstop.com/o/xqEjdze?lb=xDftlMXW&utm_medium=Share&utm_source=WhatsApp',
  'external',
  ARRAY['Startup', 'Innovation', 'AI', 'SaaS', 'Unstop'],
  'Gamnexis',
  'INR'
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  prize_pool = EXCLUDED.prize_pool,
  website_url = EXCLUDED.website_url,
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
  'startupx',
  '00000000-0000-0000-0000-000001111000',
  'Gamnexis - StartupX 2026',
  'Turn Your Idea Into a Real Startup! — National Innovation & Startup Hackathon by Gamnexis',
  '#0284C7',
  '#38BDF8',
  '/partners/startupx-logo.jpg',
  '/partners/gamnexis-banner.jpg',
  '₹10,000 Cash Pool + Uplearn Subscriptions',
  '{"website_url": "https://unstop.com/o/xqEjdze?lb=xDftlMXW&utm_medium=Share&utm_source=WhatsApp", "support_email": "support@gamnexis.dev", "registration_deadline": "2026-09-05 23:59:59+05:30", "round_1": "10 August 2026 12:00 AM IST - 05 September 2026 11:59 PM IST (Idea & PPT Submission)", "round_2": "22 September 2026 12:00 AM IST - 25 September 2026 12:00 PM IST (Build, Validate & Pitch)", "prize_breakdown": {"1st": "₹5,000 cash + 12-month Uplearn subscription + certificate", "2nd": "₹3,000 cash + 12-month Uplearn subscription + certificate", "3rd": "₹2,000 cash + 6-month Uplearn subscription + certificate", "4th": "6-month Uplearn subscription + certificate", "5th_6th": "3-month Uplearn subscription + certificate"}}'::jsonb
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
