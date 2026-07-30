-- Migration: Add unique index on website_url to public.hackathons for scraper deduplication
-- Trim trailing slashes from website_url
UPDATE public.hackathons 
SET website_url = RTRIM(website_url, '/') 
WHERE website_url IS NOT NULL AND website_url LIKE '%/';

-- Create partial unique index on website_url (excluding nulls/empty strings)
CREATE UNIQUE INDEX IF NOT EXISTS hackathons_website_url_unique_idx 
ON public.hackathons (website_url) 
WHERE website_url IS NOT NULL AND website_url != '';
