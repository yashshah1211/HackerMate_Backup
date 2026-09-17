-- Migration: 20260917160000_sql_security_hardening.sql
-- Security Hardening:
-- 1. P1-2: Atomic check_rate_limit implementation with INSERT ... ON CONFLICT DO UPDATE
-- 2. P1-3: Revoke execute from PUBLIC and anon on send_message and send_message_with_mentions
-- 3. P1-4: Tighten organizer_leads RLS to require verified email or pin to super-admin UUID

-- ── 1. Atomic Rate Limiter (P1-2) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_ip TEXT,
  p_limit INTEGER,
  p_window_interval INTERVAL
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_time TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_rec record;
  v_now timestamptz := clock_timestamp();
  v_window_end timestamptz := v_now + p_window_interval;
BEGIN
  -- Atomic upsert:
  -- If row doesn't exist, insert with request_count = 1 and reset_time = v_window_end.
  -- If row exists and reset_time has passed, reset count = 1 and reset_time = v_window_end.
  -- If row exists and reset_time has not passed, increment request_count by 1.
  INSERT INTO public.rate_limits (ip, request_count, reset_time)
  VALUES (p_ip, 1, v_window_end)
  ON CONFLICT (ip) DO UPDATE
  SET
    request_count = CASE
      WHEN public.rate_limits.reset_time <= v_now THEN 1
      ELSE public.rate_limits.request_count + 1
    END,
    reset_time = CASE
      WHEN public.rate_limits.reset_time <= v_now THEN v_window_end
      ELSE public.rate_limits.reset_time
    END
  RETURNING public.rate_limits.request_count, public.rate_limits.reset_time INTO v_rec;

  IF v_rec.request_count <= p_limit THEN
    RETURN QUERY SELECT TRUE, GREATEST(0, p_limit - v_rec.request_count), v_rec.reset_time;
  ELSE
    RETURN QUERY SELECT FALSE, 0, v_rec.reset_time;
  END IF;
END;
$$;

-- Revoke execute from public/anon; only authenticated users and service role can invoke
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTERVAL) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTERVAL) TO authenticated, service_role;


-- ── 2. Revoke Unauthenticated Access on Message Functions (P1-3) ────────────
REVOKE ALL ON FUNCTION public.send_message(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.send_message_with_mentions(uuid, text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message_with_mentions(uuid, text, uuid[], uuid) TO authenticated;

-- Defensive sweep: revoke on legacy overloads if they exist in the catalog
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'send_message' AND p.pronargs = 2
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.send_message(uuid, text) FROM PUBLIC, anon;';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.send_message(uuid, text) TO authenticated;';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'send_message_with_mentions' AND p.pronargs = 3
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.send_message_with_mentions(uuid, text, uuid[]) FROM PUBLIC, anon;';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.send_message_with_mentions(uuid, text, uuid[]) TO authenticated;';
  END IF;
END $$;


-- ── 3. Tighten Organizer Leads RLS to Verified Identities (P1-4) ────────────
DROP POLICY IF EXISTS organizer_leads_yash_only ON public.organizer_leads;

CREATE POLICY organizer_leads_yash_only ON public.organizer_leads
    FOR ALL
    TO authenticated
    USING (
      auth.uid() = '99e1c41d-1794-4f4d-87f6-4018a3a754d2'::uuid
      OR (
        LOWER(auth.jwt() ->> 'email') = 'yashshah7117@gmail.com'
        AND (
          COALESCE((auth.jwt() ->> 'email_verified')::boolean, false) = true
          OR COALESCE((auth.jwt() -> 'user_metadata' ->> 'email_verified')::boolean, false) = true
        )
      )
    )
    WITH CHECK (
      auth.uid() = '99e1c41d-1794-4f4d-87f6-4018a3a754d2'::uuid
      OR (
        LOWER(auth.jwt() ->> 'email') = 'yashshah7117@gmail.com'
        AND (
          COALESCE((auth.jwt() ->> 'email_verified')::boolean, false) = true
          OR COALESCE((auth.jwt() -> 'user_metadata' ->> 'email_verified')::boolean, false) = true
        )
      )
    );
