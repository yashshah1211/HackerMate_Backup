-- =============================================================================
-- Migration 20260928100100_phase1b_profiles_update_whitelist
-- Phase 1B: column-level UPDATE whitelist on public.profiles (SEC-06)
--
-- Spec:  .kiro/specs/p0-database-authorization-lockdown (design.md "Migration 1B", Req 6)
-- Audit: ENGINEERING_AUDIT.md SEC-06, §10.3 (column classification, writers W1-W10),
--        §10.11 E5 (exact pre-state)
-- Plan:  PRIORITIZED_ACTION_PLAN.md §1.2 "1B statements"
--
-- -----------------------------------------------------------------------------
-- HOW TO APPLY (PRIORITIZED_ACTION_PLAN.md §1.4 steps 7-9, decision D10)
-- -----------------------------------------------------------------------------
--   * NEVER apply with `supabase db push` (OPS-08).
--   * Only after 1A is applied, its ledger row repaired, and 1A verified.
--   * The staging decision (§0.12) must be recorded first.
--   * Immediately before applying: re-capture the profiles UPDATE pre-state and
--     compare it with phase1_prestate.sql §F (phase1_postcheck.sql PRE-1B rows).
--     On any difference, stop.
--   * The founder pastes this whole file into the Supabase SQL editor. Everything
--     between BEGIN and COMMIT runs as one transaction.
--   * Then: production-safe postchecks (POST-1B rows), then
--     `supabase migration repair --status applied 20260928100100`, then G-6.
--
-- -----------------------------------------------------------------------------
-- WHAT IT DOES
-- -----------------------------------------------------------------------------
--   1. REVOKE UPDATE ON public.profiles FROM anon, authenticated.
--      A table-level REVOKE also removes the column-level UPDATE grants of the
--      same roles, including the pre-existing year_of_study grant.
--   2. GRANT UPDATE on exactly 20 columns to authenticated. This is the union of
--      the columns written by the traced client writers W1-W10. anon gets nothing.
--   Not granted (15): id, email, role, is_banned, created_at, full_name, username,
--   current_streak, longest_streak, last_active_date, onboarding_nudge_sent_at,
--   last_onboarding_nudge_sent_at, profile_nudge_count, last_nudge_sent_at,
--   sih_broadcast_sent_at.
--   RLS policies are not changed. service_role, DEFINER functions and triggers are
--   not affected by these grants.
--
-- -----------------------------------------------------------------------------
-- EXACT PRE-1B STATE (phase1_prestate.sql §F; captured 2026-09-27, read-only)
-- -----------------------------------------------------------------------------
--   Table ACL:
--     {postgres=arwdDxtm/postgres,anon=awdDxtm/postgres,authenticated=awdDxtm/postgres,service_role=arwdDxtm/postgres}
--     anon and authenticated hold table-level INSERT, UPDATE, DELETE, TRUNCATE,
--     REFERENCES, TRIGGER, MAINTAIN (their SELECT is column-level).
--   Column ACLs:
--     year_of_study: {anon=r/postgres,authenticated=rw/postgres}  (the only column-level UPDATE)
--     email:         no column ACL
--     the other 33 columns: {anon=r/postgres,authenticated=r/postgres}
--   Effective UPDATE: all 35 columns for anon AND for authenticated.
--
-- -----------------------------------------------------------------------------
-- ROLLBACK (manual only; NEVER executed by this migration)
-- -----------------------------------------------------------------------------
-- Restores the exact pre-1B state for BOTH anon and authenticated
-- (phase1_prestate.sql §F). Run as one reviewed transaction:
--
--   BEGIN;
--   REVOKE UPDATE ON public.profiles FROM anon, authenticated;        -- clears the 20 column grants
--   GRANT UPDATE ON public.profiles TO anon, authenticated;           -- table-level, as before 1B
--   GRANT UPDATE (year_of_study) ON public.profiles TO authenticated; -- pre-1B column grant
--   COMMIT;
--
-- The anon line exists only to reproduce the pre-state exactly. anon cannot match
-- profiles_update_self (id = auth.uid()) without a session.
-- =============================================================================

BEGIN;

REVOKE UPDATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (
  -- user-editable
  avatar_url, bio, college, year_of_study, gender, skills, github_url, linkedin_url,
  is_available, show_track_record, onboarding_completed, referrer_source,
  -- client-maintained telemetry
  last_seen_at,
  -- transitional: trigger-managed, still sent by clients (remove in Phase 2)
  updated_at,
  -- transitional: self-reported reputation (remove in Phase 2)
  has_participated_hackathon, hackathon_participations, has_won_hackathon, hackathon_wins,
  -- transitional: client-side GitHub sync (remove in Phase 2)
  github_stats, github_stats_updated_at
) ON public.profiles TO authenticated;

COMMIT;
