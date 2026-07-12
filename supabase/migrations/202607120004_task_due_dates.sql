-- Migration: 202607120004_task_due_dates
-- Add due_date column to team_tasks table.

ALTER TABLE public.team_tasks 
ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITH TIME ZONE;
