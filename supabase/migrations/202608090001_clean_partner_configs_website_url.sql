-- Clean up partner_configs.features JSONB where website_url is an Unstop URL or identical to hackathons.website_url
UPDATE partner_configs
SET features = features - 'website_url'
WHERE features->>'website_url' ILIKE '%unstop%';
