-- Migration: 202607270006_stampers_logo
-- Sets logo_url for STAMPERS partner configuration to '/stampers-logo.jpg'.

UPDATE public.partner_configs
SET logo_url = '/stampers-logo.jpg',
    updated_at = NOW()
WHERE slug = 'stampers';
