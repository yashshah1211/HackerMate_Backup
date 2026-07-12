-- Migration: 202607120001_team_github_sync
-- Add github_repo_url to teams table to support GitHub repository syncing.

ALTER TABLE public.teams 
ADD COLUMN IF NOT EXISTS github_repo_url TEXT;
