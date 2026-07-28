-- Migration: 202607280002_axcentra_logo
-- Sets logo_url for Axcentra partner configuration to '/partners/axcentra-full-logo-transparent.png'.

UPDATE public.partner_configs
SET logo_url = '/partners/axcentra-full-logo-transparent.png',
    updated_at = NOW()
WHERE slug = 'axcentra';
