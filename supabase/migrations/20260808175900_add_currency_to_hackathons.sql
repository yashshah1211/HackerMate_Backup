-- Add currency column to hackathons table
ALTER TABLE public.hackathons ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR';
