-- Migration: 202607280007_daily_email_stats
-- Creates daily_email_stats table for tracking daily email send counts against Resend limits.

CREATE TABLE IF NOT EXISTS public.daily_email_stats (
  date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  outreach_sent INT DEFAULT 0,
  nudges_sent INT DEFAULT 0,
  total_sent INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.daily_email_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS daily_email_stats_read ON public.daily_email_stats;
CREATE POLICY daily_email_stats_read ON public.daily_email_stats
  FOR SELECT TO authenticated, anon USING (true);
