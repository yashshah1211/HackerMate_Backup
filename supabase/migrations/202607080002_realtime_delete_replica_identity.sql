-- Migration: 202607080002_realtime_delete_replica_identity
-- Enables REPLICA IDENTITY FULL on all tables with column-filtered realtime subscriptions
-- to ensure DELETE events are correctly dispatched by Supabase Realtime.

ALTER TABLE public.team_links REPLICA IDENTITY FULL;
ALTER TABLE public.team_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;
ALTER TABLE public.team_invites REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_participants REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
