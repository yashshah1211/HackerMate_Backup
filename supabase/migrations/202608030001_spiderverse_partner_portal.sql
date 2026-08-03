-- Migration: 202608030001_spiderverse_partner_portal
-- Creates/Updates XPLORE'26 - Into the SpiderVerse Hackathon and partner_configs row for LICET CSE Symposium.

-- 1. Ensure Hackathon record exists
INSERT INTO public.hackathons (
  id, name, description, mode, type, prize_pool, college, start_date, end_date, website_url, tags
) VALUES (
  '00000000-0000-0000-0000-000001703936',
  'XPLORE''26 — Into the SpiderVerse',
  'National-Level Tech Symposium by Department of CSE, LICET, Chennai featuring 6 Spider-Verse events: Web Forge, Multiverse Breach CTF, Spider Sense, Across the SpiderVerse Treasure Hunt, Beyond the Web, and Spider Sprint speed coding.',
  'offline',
  'external',
  'Exciting Prizes & Certificates',
  'LICET, Chennai',
  '2026-08-08 09:00:00+05:30',
  '2026-08-08 18:00:00+05:30',
  'https://xplore26.xyz/',
  ARRAY['web-forge', 'multiverse-breach-ctf', 'spider-sense', 'spiderverse', 'paper-presentation', 'speed-coding']
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  prize_pool = EXCLUDED.prize_pool,
  college = EXCLUDED.college,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  website_url = EXCLUDED.website_url,
  tags = EXCLUDED.tags;

-- 2. Seed XPLORE'26 Spider-Verse partner configuration with events metadata
INSERT INTO public.partner_configs (
  slug, hackathon_id, partner_name, tagline, brand_color, accent_color, logo_url, banner_url, override_prize_pool, features
) VALUES (
  'spiderverse',
  '00000000-0000-0000-0000-000001703936',
  'XPLORE''26 — Into the SpiderVerse',
  'National-Level Tech Symposium by Dept of CSE, LICET Chennai. 6 Spider-Verse Event Tracks, Exciting Prizes & Certificates!',
  '#E11D48',
  '#06B6D4',
  '/partners/spiderverse-logo.jpg',
  NULL,
  'Exciting Prizes & Certificates',
  '{
    "organizer": "Department of CSE, LICET (Loyola-ICAM College of Engineering & Technology)",
    "location": "LICET Campus, Nungambakkam, Chennai - 600034",
    "event_date": "8th August 2026",
    "website_url": "https://xplore26.xyz/",
    "email": "eiconcse@licet.ac.in",
    "events": [
      {
        "id": "web-forge",
        "name": "Web Forge",
        "category": "Website Building",
        "icon": "🕸️",
        "desc": "Build creative and responsive websites in this web development challenge."
      },
      {
        "id": "multiverse-breach",
        "name": "Multiverse Breach",
        "category": "Capture The Flag (CTF)",
        "icon": "🛡️",
        "desc": "Solve cybersecurity puzzles, breach defenses, and capture the flags."
      },
      {
        "id": "spider-sense",
        "name": "Spider Sense",
        "category": "Technical Quiz",
        "icon": "🧠",
        "desc": "Test your core CS fundamentals, algorithms, and technical knowledge."
      },
      {
        "id": "across-spiderverse",
        "name": "Across the SpiderVerse",
        "category": "Technical Treasure Hunt",
        "icon": "🗺️",
        "desc": "Decode technical clues across the multiverse in an epic treasure hunt."
      },
      {
        "id": "beyond-the-web",
        "name": "Beyond the Web",
        "category": "Paper Presentation",
        "icon": "📄",
        "desc": "Present innovative technical research papers and emerging technology solutions."
      },
      {
        "id": "spider-sprint",
        "name": "Spider Sprint",
        "category": "Speed Coding",
        "icon": "⚡",
        "desc": "Race against time to solve complex algorithmic coding challenges."
      }
    ]
  }'::jsonb
) ON CONFLICT (slug) DO UPDATE SET
  hackathon_id = EXCLUDED.hackathon_id,
  partner_name = EXCLUDED.partner_name,
  tagline = EXCLUDED.tagline,
  brand_color = EXCLUDED.brand_color,
  accent_color = EXCLUDED.accent_color,
  logo_url = EXCLUDED.logo_url,
  override_prize_pool = EXCLUDED.override_prize_pool,
  features = EXCLUDED.features,
  updated_at = NOW();
