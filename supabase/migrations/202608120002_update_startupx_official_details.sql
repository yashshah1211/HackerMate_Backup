-- Migration: 202608120002_update_startupx_official_details
-- Updates public.hackathons and public.partner_configs with official StartupX 2026 details.

UPDATE public.hackathons
SET
  description = 'Free online innovation and startup hackathon organized by Gamnexis. Turn your idea into a real startup! Open innovation across any domain (AI/ML, Web/SaaS, Mobile, FinTech, HealthTech, EdTech, Cybersecurity, Gaming, Blockchain, IoT, Social Impact). Solo builders & teams of 1-6 allowed.',
  start_date = '2026-08-10 00:00:00+05:30',
  end_date = '2026-09-25 12:00:00+05:30',
  prize_pool = '₹10,000 Cash Pool + Uplearn Subscriptions',
  website_url = 'https://unstop.com/o/xqEjdze?lb=xDftlMXW&utm_medium=Share&utm_source=WhatsApp'
WHERE id = '00000000-0000-0000-0000-000001111000';

UPDATE public.partner_configs
SET
  tagline = 'Turn Your Idea Into a Real Startup! — National Innovation & Startup Hackathon by Gamnexis',
  override_prize_pool = '₹10,000 Cash Pool + Uplearn Subscriptions',
  features = jsonb_build_object(
    'website_url', 'https://unstop.com/o/xqEjdze?lb=xDftlMXW&utm_medium=Share&utm_source=WhatsApp',
    'support_email', 'support@gamnexis.dev',
    'registration_deadline', '2026-09-05 23:59:59+05:30',
    'round_1', '10 August 2026 12:00 AM IST - 05 September 2026 11:59 PM IST (Idea & PPT Submission)',
    'round_2', '22 September 2026 12:00 AM IST - 25 September 2026 12:00 PM IST (Build, Validate & Pitch)',
    'prize_breakdown', jsonb_build_object(
      '1st', '₹5,000 cash + 12-month Uplearn subscription + certificate',
      '2nd', '₹3,000 cash + 12-month Uplearn subscription + certificate',
      '3rd', '₹2,000 cash + 6-month Uplearn subscription + certificate',
      '4th', '6-month Uplearn subscription + certificate',
      '5th_6th', '3-month Uplearn subscription + certificate'
    )
  ),
  updated_at = NOW()
WHERE slug = 'startupx';
