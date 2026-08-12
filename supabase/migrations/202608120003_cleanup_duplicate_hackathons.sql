-- Migration: 202608120003_cleanup_duplicate_hackathons
-- Deletes unreferenced duplicate hackathon rows for StartupX Hackathon 2026 and Codeissance 2026.

DELETE FROM public.hackathons
WHERE id = '4c2761b2-0257-47e2-84ff-23226b4efac4'; -- StartupX unreferenced scraped duplicate

DELETE FROM public.hackathons
WHERE id = 'e649af25-763c-4a32-b721-4629f890300d'; -- Codeissance unreferenced scraped duplicate
