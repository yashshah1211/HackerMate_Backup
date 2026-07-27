-- Migration: 202607270004_merge_stampers_duplicate
-- Merges duplicate STAMPERS hackathon rows:
-- Retains original scraped row (00000000-0000-0000-0000-000001726290) with type = 'external',
-- updates website_url, updates partner_configs link and sets override_prize_pool to NULL,
-- and removes the duplicate native hackathon row (00000000-0000-0000-0000-000001703934).

-- 1. Update original scraped hackathon row (keep type as 'external', set website_url)
UPDATE public.hackathons
SET website_url = 'https://www.hackermate.in/partners/stampers'
WHERE id = '00000000-0000-0000-0000-000001726290';

-- 2. Update partner_configs row for 'stampers' to point to original hackathon ID and set override_prize_pool to NULL
UPDATE public.partner_configs
SET hackathon_id = '00000000-0000-0000-0000-000001726290',
    override_prize_pool = NULL,
    updated_at = NOW()
WHERE slug = 'stampers';

-- 3. Delete duplicate hackathon row created in previous step
DELETE FROM public.hackathons
WHERE id = '00000000-0000-0000-0000-000001703934';
