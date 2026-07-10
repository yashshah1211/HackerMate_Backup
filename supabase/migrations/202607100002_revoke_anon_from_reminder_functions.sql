-- Migration: 202607100002_revoke_anon_from_reminder_functions
-- Security fix C4: Restrict get_pending_deadline_reminders() and
-- mark_deadline_reminder_sent() to authenticated/service-role only.
--
-- Both functions are SECURITY DEFINER and bypass RLS. Granting them to anon
-- allowed unauthenticated callers to harvest all users' emails, names, and
-- hackathon data, and to silently suppress reminders for any user.
--
-- These functions are only called by the server-side cron API route, which
-- now uses the service-role key and does not require anon execute access.

REVOKE EXECUTE ON FUNCTION public.get_pending_deadline_reminders() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_deadline_reminder_sent(UUID[]) FROM anon;

-- Ensure authenticated retains access (cron route connects via service_role
-- which inherits from authenticated in terms of explicit grants, but making
-- this explicit is safer).
GRANT EXECUTE ON FUNCTION public.get_pending_deadline_reminders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_deadline_reminder_sent(UUID[]) TO authenticated;
