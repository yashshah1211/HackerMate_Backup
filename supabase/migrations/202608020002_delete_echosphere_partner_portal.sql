-- Migration: 202608020002_delete_echosphere_partner_portal
-- Permanently deletes EchoSphere partner portal configuration.

DELETE FROM public.partner_configs
WHERE slug = 'echosphere-agora-conversational-ai-hackathon'
   OR partner_name LIKE '%EchoSphere%';
