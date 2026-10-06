-- Additive organizer-access foundation only. Reviewed against local filenames
-- and the read-only production ledger: latest version was 202610060001.
-- This migration is NOT applied by the implementation task. No partner seed,
-- participant grants/policies, dashboard projections or existing RPCs change.
BEGIN;

CREATE TABLE public.event_organizers (
  hackathon_id uuid NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (hackathon_id, user_id)
);

CREATE INDEX event_organizers_user_id_idx ON public.event_organizers(user_id);
ALTER TABLE public.event_organizers ENABLE ROW LEVEL SECURITY;

-- SQL counterpart of requireVerifiedProfile/requireAdmin. Read current protected
-- profile and auth.users identity, never client metadata or caller-supplied IDs.
-- The exact founder exception already exists in requireAdmin and the deletion
-- RPC; retain its semantics here without changing public.is_admin's contract.
CREATE FUNCTION public.has_partner_admin_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles AS p
    JOIN auth.users AS u ON u.id = p.id
    WHERE p.id = auth.uid()
      AND p.is_banned IS FALSE
      AND u.email IS NOT NULL AND u.email <> ''
      AND (p.role = 'admin' OR lower(btrim(u.email)) = 'yashshah7117@gmail.com')
  );
$$;

CREATE FUNCTION public.can_access_partner_event(p_hackathon_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hackathons AS h
    JOIN public.profiles AS p ON p.id = auth.uid()
    JOIN auth.users AS u ON u.id = p.id
    WHERE h.id = p_hackathon_id
      AND p.is_banned IS FALSE
      AND u.email IS NOT NULL AND u.email <> ''
      AND (
        public.has_partner_admin_access()
        OR (h.type = 'native' AND h.organizer_id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.event_organizers AS eo
          WHERE eo.hackathon_id = h.id AND eo.user_id = auth.uid()
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_partner_admin_access() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_partner_event(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_partner_admin_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_partner_event(uuid) TO authenticated;

-- No UPDATE, TRUNCATE or anonymous grants. Assignments are immutable; revoke
-- with DELETE and provision a new row as an authoritative admin if necessary.
REVOKE ALL ON TABLE public.event_organizers FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.event_organizers TO authenticated;

CREATE POLICY event_organizers_read_self ON public.event_organizers
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) AND public.can_access_partner_event(hackathon_id));

CREATE POLICY event_organizers_read_admin ON public.event_organizers
FOR SELECT TO authenticated
USING (public.has_partner_admin_access());

CREATE POLICY event_organizers_provision_admin ON public.event_organizers
FOR INSERT TO authenticated
WITH CHECK (public.has_partner_admin_access() AND created_by = (SELECT auth.uid()));

CREATE POLICY event_organizers_revoke_admin ON public.event_organizers
FOR DELETE TO authenticated
USING (public.has_partner_admin_access());

COMMIT;
