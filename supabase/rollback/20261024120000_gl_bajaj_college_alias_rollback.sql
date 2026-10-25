-- Rollback for supabase/migrations/20261024120000_gl_bajaj_college_alias.sql
-- MANUAL ONLY. Never place in supabase/migrations and never run without release approval.
-- Transactional: any guard failure rolls everything back.
--
-- Effects:
--  1. Deletes only matchmaking.college_alias rows keyed gl-bajaj-mathura or
--     gl-bajaj-greater-noida (the migration refused to run if anyone else used those keys).
--  2. Restores profiles.college from matchmaking.gl_bajaj_college_backfill, but only where
--     the profile still holds the value the migration wrote. Rows the user has edited since
--     are left alone and reported. The existing triggers refresh their caches (and set
--     updated_at), with the aliases already gone so the cached key becomes NULL again.
--  3. Refreshes any other builder or team whose cache still holds a GL Bajaj key
--     (for example canonical names saved through the Phase A app).
--  4. Removes restored rows from the backfill record and drops the table once empty,
--     so the migration can be re-applied later.
-- Phase A application code stays compatible with both states.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
DECLARE
  c_m_name CONSTANT text := 'GL Bajaj Group of Institutions, Mathura';
  c_keys   CONSTANT text[] := ARRAY['gl-bajaj-mathura', 'gl-bajaj-greater-noida'];
  v_aliases integer; v_restored integer; v_skipped integer; v_builders integer := 0; v_teams integer := 0;
  v_other_count integer; v_other_after integer;
  r record;
BEGIN
  IF to_regclass('matchmaking.gl_bajaj_college_backfill') IS NULL THEN
    RAISE EXCEPTION 'GL Bajaj rollback guard: backfill record table not found; nothing to roll back';
  END IF;

  LOCK TABLE matchmaking.college_alias IN SHARE ROW EXCLUSIVE MODE;
  PERFORM 1 FROM public.profiles p
  WHERE p.id IN (SELECT b.profile_id FROM matchmaking.gl_bajaj_college_backfill b) FOR UPDATE;

  SELECT count(*) INTO v_other_count FROM matchmaking.college_alias a WHERE a.college_key <> ALL (c_keys);

  DELETE FROM matchmaking.college_alias a WHERE a.college_key = ANY (c_keys);
  GET DIAGNOSTICS v_aliases = ROW_COUNT;

  SELECT count(*) INTO v_skipped
  FROM matchmaking.gl_bajaj_college_backfill b JOIN public.profiles p ON p.id = b.profile_id
  WHERE p.college IS DISTINCT FROM b.new_college;

  CREATE TEMP TABLE gl_restored (profile_id uuid PRIMARY KEY) ON COMMIT DROP;
  WITH upd AS (
    UPDATE public.profiles p SET college = b.previous_college
    FROM matchmaking.gl_bajaj_college_backfill b
    WHERE b.profile_id = p.id AND p.college = b.new_college AND b.new_college = c_m_name
    RETURNING p.id
  )
  INSERT INTO gl_restored SELECT id FROM upd;
  GET DIAGNOSTICS v_restored = ROW_COUNT;

  FOR r IN
    SELECT f.user_id FROM matchmaking.builder_feature f
    WHERE f.college_key = ANY (c_keys) ORDER BY f.user_id
  LOOP
    PERFORM matchmaking.refresh_builder(r.user_id);
    v_builders := v_builders + 1;
  END LOOP;
  FOR r IN
    SELECT f.team_id FROM matchmaking.team_feature f
    WHERE f.college_key = ANY (c_keys) ORDER BY f.team_id
  LOOP
    PERFORM matchmaking.refresh_team(r.team_id);
    v_teams := v_teams + 1;
  END LOOP;

  IF EXISTS (SELECT 1 FROM matchmaking.builder_feature f WHERE f.college_key = ANY (c_keys))
     OR EXISTS (SELECT 1 FROM matchmaking.team_feature f WHERE f.college_key = ANY (c_keys))
     OR EXISTS (SELECT 1 FROM matchmaking.builder_feed b WHERE b.bucket IN ('college:gl-bajaj-mathura', 'college:gl-bajaj-greater-noida')) THEN
    RAISE EXCEPTION 'GL Bajaj rollback guard: GL Bajaj keys remain in matchmaking caches';
  END IF;
  SELECT count(*) INTO v_other_after FROM matchmaking.college_alias a WHERE a.college_key <> ALL (c_keys);
  IF v_other_after <> v_other_count THEN
    RAISE EXCEPTION 'GL Bajaj rollback guard: unrelated college aliases changed';
  END IF;

  DELETE FROM matchmaking.gl_bajaj_college_backfill b WHERE b.profile_id IN (SELECT profile_id FROM gl_restored);
  IF NOT EXISTS (SELECT 1 FROM matchmaking.gl_bajaj_college_backfill) THEN
    DROP TABLE matchmaking.gl_bajaj_college_backfill;
  END IF;

  RAISE NOTICE 'GL Bajaj rollback: aliases_deleted=%, profiles_restored=%, profiles_skipped_user_edited=%, builders_refreshed=%, teams_refreshed=%',
    v_aliases, v_restored, v_skipped, v_builders, v_teams;
END
$$;

COMMIT;
