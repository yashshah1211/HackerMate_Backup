-- Migration: 202608030004_add_unique_website_url_to_hackathons
-- Adds UNIQUE constraint on website_url in public.hackathons so multi-platform scraper upserts succeed cleanly.

-- 1. Deduplicate any existing duplicate website_url rows in public.hackathons (keeping the newest row)
DELETE FROM public.hackathons a
USING public.hackathons b
WHERE a.id < b.id 
  AND a.website_url IS NOT NULL 
  AND LOWER(a.website_url) = LOWER(b.website_url);

-- 2. Add UNIQUE constraint on website_url
ALTER TABLE public.hackathons 
ADD CONSTRAINT hackathons_website_url_unique UNIQUE (website_url);
