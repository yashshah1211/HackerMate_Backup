-- Migration: 202607240003_fix_organizer_leads_rls
-- Update policy organizer_leads_yash_only to use case-insensitive email matching

DROP POLICY IF EXISTS organizer_leads_yash_only ON public.organizer_leads;

CREATE POLICY organizer_leads_yash_only ON public.organizer_leads
    FOR ALL
    TO authenticated
    USING (LOWER(auth.jwt() ->> 'email') = LOWER('yashshah7117@gmail.com'))
    WITH CHECK (LOWER(auth.jwt() ->> 'email') = LOWER('yashshah7117@gmail.com'));
