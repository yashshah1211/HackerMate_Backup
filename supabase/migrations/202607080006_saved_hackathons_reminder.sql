-- Migration: Add deadline reminders tracking to saved_hackathons and define matching security definers.

ALTER TABLE public.saved_hackathons ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Function to get pending deadline reminders (security definer to bypass RLS)
CREATE OR REPLACE FUNCTION public.get_pending_deadline_reminders()
RETURNS TABLE (
  saved_id UUID,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  hackathon_id UUID,
  hackathon_name TEXT,
  registration_end TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sh.id AS saved_id,
    sh.user_id AS user_id,
    p.email::TEXT AS user_email,
    p.full_name::TEXT AS user_name,
    h.id AS hackathon_id,
    h.name::TEXT AS hackathon_name,
    h.registration_end AS registration_end
  FROM public.saved_hackathons sh
  JOIN public.profiles p ON p.id = sh.user_id
  JOIN public.hackathons h ON h.id = sh.hackathon_id
  LEFT JOIN public.hackathon_registrations hr ON hr.hackathon_id = sh.hackathon_id AND hr.user_id = sh.user_id
  WHERE 
    sh.reminder_sent_at IS NULL
    AND hr.id IS NULL -- Only builders who have NOT registered yet
    AND h.registration_end IS NOT NULL
    AND h.registration_end >= NOW()
    AND h.registration_end <= NOW() + INTERVAL '24 hours';
END;
$$;

-- Function to mark reminders as sent (security definer to bypass RLS)
CREATE OR REPLACE FUNCTION public.mark_deadline_reminder_sent(p_saved_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.saved_hackathons
  SET reminder_sent_at = NOW()
  WHERE id = ANY(p_saved_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_deadline_reminders() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_deadline_reminder_sent(UUID[]) TO anon, authenticated;
