-- Migration: 202607270005_restore_stampers_unstop_url
-- Restores real external Unstop registration URL on public.hackathons for STAMPERS (id 00000000-0000-0000-0000-000001726290).

UPDATE public.hackathons
SET website_url = 'https://unstop.com/hackathons/stampers-national-hackathon-2026-stampers-1726290'
WHERE id = '00000000-0000-0000-0000-000001726290';
