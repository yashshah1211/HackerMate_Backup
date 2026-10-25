-- Migration: 20261024120000_gl_bajaj_college_alias
-- GL Bajaj Phase B. Source only: do not apply to any database without release approval,
-- and never apply the migrations directory as a backlog (supabase/README.md).
-- Runbook, expected counts and release order: docs/architecture/gl-bajaj-college-normalization.md
-- Read-only checks: scripts/sql/gl_bajaj_phase_b_precheck.sql and _postcheck.sql
-- Rollback (reviewed, manual): supabase/rollback/20261024120000_gl_bajaj_college_alias_rollback.sql
--
-- Intended effects on first application (counts reconciled with the user's 2026-10-25 read-only audit):
--  1. matchmaking.college_alias gains rows for two separate keys only. Existing rows are
--     never updated or deleted, and any conflicting row aborts the migration.
--       gl-bajaj-mathura        the canonical Mathura name, the 7 Phase A reviewed
--                               spellings and every legacy Mathura spelling found in
--                               profiles (9 expected), all in matchmaking.norm() form
--       gl-bajaj-greater-noida  the canonical Greater Noida name only
--  2. public.profiles: exactly 11 legacy rows whose college is a campus-explicit Mathura spelling
--     (same rule as Phase A normalizeCollege) are set to
--     'GL Bajaj Group of Institutions, Mathura'. The 7 campus-ambiguous rows and all other
--     profile values are untouched, including the 1 already-canonical Mathura profile.
--     Existing triggers also set updated_at on those 11 legacy rows only.
--  3. matchmaking.gl_bajaj_college_backfill (private) records each changed row's previous
--     value so the rollback can restore it exactly.
--  4. Caches: the existing matchmaking_profile_changed trigger refreshes builder_feature and
--     builder_feed for the 11 rows (and re-derives their teams from unchanged inputs).
--     Profiles and teams that already hold a canonical name but carry a stale cached key
--     are refreshed explicitly. No other builder or team is rebuilt.
-- Every guard raises 'GL Bajaj Phase B guard: ...' and the whole transaction rolls back.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Private, non-client-readable record of changed rows (matchmaking schema usage is
-- already revoked from public/anon/authenticated). Rows are removed with the profile.
CREATE TABLE IF NOT EXISTS matchmaking.gl_bajaj_college_backfill (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  previous_college text NOT NULL,
  new_college text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE matchmaking.gl_bajaj_college_backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE matchmaking.gl_bajaj_college_backfill FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE matchmaking.gl_bajaj_college_backfill IS
  'GL Bajaj Phase B: previous profiles.college values changed by 20261024120000, for rollback only.';

-- Same key as Phase A collegeMatchKey(): lowercase, "&" -> "and", other punctuation ->
-- space, collapsed whitespace, runs of single letters joined ("g.l." -> "gl").
-- Session-local and dropped before COMMIT.
CREATE OR REPLACE FUNCTION pg_temp.gl_bajaj_match_key(v text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  WITH tok AS (
    SELECT t.tok, t.ord, t.tok ~ '^[a-z]$' AS single
    FROM regexp_split_to_table(
      btrim(regexp_replace(replace(lower(coalesce(v, '')), '&', ' and '), '[^a-z0-9]+', ' ', 'g')), ' '
    ) WITH ORDINALITY AS t(tok, ord)
    WHERE t.tok <> ''
  ), isl AS (
    SELECT tok.*, tok.ord - row_number() OVER (PARTITION BY tok.single ORDER BY tok.ord) AS grp FROM tok
  ), words AS (
    SELECT min(isl.ord) AS pos,
           CASE WHEN isl.single THEN string_agg(isl.tok, '' ORDER BY isl.ord) ELSE min(isl.tok) END AS word
    FROM isl GROUP BY isl.single, CASE WHEN isl.single THEN isl.grp ELSE isl.ord END
  )
  SELECT coalesce(string_agg(words.word, ' ' ORDER BY words.pos), '') FROM words
$$;

DO $$
DECLARE
  c_m_name CONSTANT text := 'GL Bajaj Group of Institutions, Mathura';
  c_m_key  CONSTANT text := 'gl-bajaj-mathura';
  c_n_name CONSTANT text := 'GL Bajaj Institute of Technology & Management, Greater Noida';
  c_n_key  CONSTANT text := 'gl-bajaj-greater-noida';
  -- Reviewed campus-explicit keys (identical to Phase A CAMPUS_ALIAS_KEYS).
  c_m_match_keys CONSTANT text[] := ARRAY[
    'gl bajaj group of institutions mathura',
    'gl bajaj group of institution mathura',
    'gl bajaj mathura'];
  c_n_match_keys CONSTANT text[] := ARRAY[
    'gl bajaj institute of technology and management greater noida'];
  -- Phase A reviewed Mathura spellings (CAMPUS_REVIEWED_SPELLINGS).
  c_reviewed_mathura CONSTANT text[] := ARRAY[
    'GL Bajaj Group Of Institutions Mathura',
    'GL Bajaj Group Of Institutions, Mathura',
    'G.L. Bajaj Group Of Institutions, Mathura',
    'G.L.bajaj group of institutions mathura',
    'GL Bajaj group of institution mathura',
    'G.l bajaj mathura',
    'Gl bajaj mathura'];
  -- From the read-only production audit. If the precheck differs, re-audit and update
  -- these values in review before applying. Any mismatch aborts the migration.
  c_expected_legacy_rows      CONSTANT integer := 11;
  c_expected_legacy_spellings CONSTANT integer := 9;
  c_expected_ambiguous_rows   CONSTANT integer := 7;

  v_legacy integer; v_spellings integer; v_ambiguous integer; v_noida integer;
  v_recorded integer; v_first_run boolean;
  v_other_count integer; v_other_fp text; v_other_count_after integer; v_other_fp_after text;
  v_aliases_added integer; v_updated integer := 0;
  v_builders integer := 0; v_teams integer := 0;
  r record;
BEGIN
  -- 0. The effective production schema must match what this migration relies on.
  IF to_regclass('matchmaking.college_alias') IS NULL
     OR to_regclass('matchmaking.builder_feature') IS NULL
     OR to_regclass('matchmaking.builder_feed') IS NULL
     OR to_regclass('matchmaking.team_feature') IS NULL
     OR to_regprocedure('matchmaking.norm(text)') IS NULL
     OR to_regprocedure('matchmaking.college_key(text)') IS NULL
     OR to_regprocedure('matchmaking.refresh_builder(uuid)') IS NULL
     OR to_regprocedure('matchmaking.refresh_team(uuid)') IS NULL THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: required matchmaking objects are missing';
  END IF;
  -- Aliases below are stored in this exact form; punctuation must be preserved.
  IF matchmaking.norm(E'  G.L.  Bajaj ,\tMathura ') IS DISTINCT FROM 'g.l. bajaj , mathura' THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: matchmaking.norm behaviour differs from the audit';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = 'public.profiles'::regclass AND t.tgname = 'matchmaking_profile_changed'
      AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
  ) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: matchmaking_profile_changed trigger is missing or not enabled for origin sessions';
  END IF;

  -- 1. Freeze the inputs: alias writers wait, candidate profile rows are row-locked.
  LOCK TABLE matchmaking.college_alias IN SHARE ROW EXCLUSIVE MODE;
  PERFORM 1 FROM public.profiles p WHERE p.college ILIKE '%bajaj%' FOR UPDATE;

  CREATE TEMP TABLE gl_candidates (
    id uuid PRIMARY KEY, college text NOT NULL, match_key text NOT NULL,
    category text NOT NULL, feature_key_before text
  ) ON COMMIT DROP;
  INSERT INTO gl_candidates
  SELECT p.id, p.college, k.match_key,
    CASE
      WHEN p.college = c_m_name THEN 'canonical_mathura'
      WHEN p.college = c_n_name THEN 'canonical_greater_noida'
      WHEN k.match_key = ANY (c_m_match_keys) THEN 'legacy_mathura'
      WHEN k.match_key = ANY (c_n_match_keys) THEN 'legacy_greater_noida'
      WHEN k.match_key ~ '(^| )(gl bajaj|glbajaj)( |$)' THEN 'ambiguous'
      ELSE 'unrelated'
    END,
    f.college_key
  FROM public.profiles p
  CROSS JOIN LATERAL (SELECT pg_temp.gl_bajaj_match_key(p.college) AS match_key) k
  LEFT JOIN matchmaking.builder_feature f ON f.user_id = p.id
  WHERE p.college ILIKE '%bajaj%';

  SELECT count(*) FILTER (WHERE category = 'legacy_mathura'),
         count(DISTINCT college) FILTER (WHERE category = 'legacy_mathura'),
         count(*) FILTER (WHERE category = 'ambiguous'),
         count(*) FILTER (WHERE category = 'legacy_greater_noida')
  INTO v_legacy, v_spellings, v_ambiguous, v_noida
  FROM gl_candidates;
  SELECT count(*) INTO v_recorded FROM matchmaking.gl_bajaj_college_backfill;

  -- 2. Drift guards.
  IF v_noida <> 0 THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: % unreviewed Greater Noida legacy rows found', v_noida;
  END IF;
  IF EXISTS (SELECT 1 FROM gl_candidates
             WHERE category = 'legacy_mathura' AND (college !~* 'mathura' OR college ~* 'noida')) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: a legacy Mathura candidate does not name Mathura alone';
  END IF;
  IF v_legacy = c_expected_legacy_rows THEN
    v_first_run := true;
    IF v_spellings <> c_expected_legacy_spellings THEN
      RAISE EXCEPTION 'GL Bajaj Phase B guard: expected % distinct legacy Mathura spellings, found %',
        c_expected_legacy_spellings, v_spellings;
    END IF;
    IF v_ambiguous <> c_expected_ambiguous_rows THEN
      RAISE EXCEPTION 'GL Bajaj Phase B guard: expected % ambiguous GL Bajaj rows, found %',
        c_expected_ambiguous_rows, v_ambiguous;
    END IF;
  ELSIF v_legacy = 0 AND v_recorded > 0 THEN
    v_first_run := false; -- Already applied: only verify and repair caches.
  ELSE
    RAISE EXCEPTION 'GL Bajaj Phase B guard: expected % legacy Mathura rows, found %',
      c_expected_legacy_rows, v_legacy;
  END IF;

  -- 3. Intended alias rows, in matchmaking.norm() form. A string that would map to both
  --    campuses violates the primary key and aborts.
  CREATE TEMP TABLE gl_aliases (alias text PRIMARY KEY, college_key text NOT NULL) ON COMMIT DROP;
  INSERT INTO gl_aliases(alias, college_key)
  SELECT matchmaking.norm(v), c_m_key FROM unnest(ARRAY[c_m_name] || c_reviewed_mathura) v
  UNION SELECT matchmaking.norm(c.college), c_m_key FROM gl_candidates c WHERE c.category = 'legacy_mathura'
  UNION SELECT matchmaking.norm(b.previous_college), c_m_key FROM matchmaking.gl_bajaj_college_backfill b
  UNION SELECT matchmaking.norm(c_n_name), c_n_key;

  IF EXISTS (SELECT 1 FROM gl_aliases g
             WHERE (g.college_key = c_m_key AND NOT (pg_temp.gl_bajaj_match_key(g.alias) = ANY (c_m_match_keys)))
                OR (g.college_key = c_n_key AND NOT (pg_temp.gl_bajaj_match_key(g.alias) = ANY (c_n_match_keys)))) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: an intended alias is not campus-explicit for its key';
  END IF;
  IF EXISTS (SELECT 1 FROM matchmaking.college_alias a JOIN gl_aliases g ON g.alias = a.alias
             WHERE a.college_key <> g.college_key) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: an existing alias conflicts with an intended GL Bajaj alias';
  END IF;
  IF EXISTS (SELECT 1 FROM matchmaking.college_alias a
             WHERE a.college_key IN (c_m_key, c_n_key)
               AND NOT EXISTS (SELECT 1 FROM gl_aliases g WHERE g.alias = a.alias)) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: unexpected existing alias rows use a GL Bajaj key';
  END IF;

  SELECT count(*), coalesce(md5(string_agg(a.alias || '=' || a.college_key, E'\n' ORDER BY a.alias)), '')
  INTO v_other_count, v_other_fp
  FROM matchmaking.college_alias a WHERE a.college_key NOT IN (c_m_key, c_n_key);

  INSERT INTO matchmaking.college_alias(alias, college_key)
  SELECT g.alias, g.college_key FROM gl_aliases g
  ON CONFLICT (alias) DO NOTHING;
  GET DIAGNOSTICS v_aliases_added = ROW_COUNT;

  IF matchmaking.college_key(c_m_name) IS DISTINCT FROM c_m_key
     OR matchmaking.college_key(c_n_name) IS DISTINCT FROM c_n_key THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: canonical names do not resolve to their own keys';
  END IF;
  IF EXISTS (SELECT 1 FROM gl_candidates c WHERE c.category = 'legacy_mathura'
             AND matchmaking.college_key(c.college) IS DISTINCT FROM c_m_key) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: a legacy Mathura spelling does not resolve to Mathura';
  END IF;
  IF EXISTS (SELECT 1 FROM gl_candidates c WHERE c.category IN ('ambiguous', 'unrelated')
             AND matchmaking.college_key(c.college) IN (c_m_key, c_n_key)) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: an ambiguous or unrelated value resolves to a GL Bajaj key';
  END IF;

  -- 4. Bounded backfill. Aliases already exist, so the AFTER trigger caches the right key.
  IF v_first_run THEN
    INSERT INTO matchmaking.gl_bajaj_college_backfill(profile_id, previous_college, new_college)
    SELECT c.id, c.college, c_m_name FROM gl_candidates c WHERE c.category = 'legacy_mathura';

    UPDATE public.profiles p SET college = c_m_name
    FROM gl_candidates c
    WHERE c.id = p.id AND c.category = 'legacy_mathura' AND p.college = c.college;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> c_expected_legacy_rows THEN
      RAISE EXCEPTION 'GL Bajaj Phase B guard: expected to update % profiles, updated %',
        c_expected_legacy_rows, v_updated;
    END IF;
  END IF;

  -- 5. Refresh only stale caches whose stored college now resolves to a GL Bajaj key
  --    (canonical names saved before this migration, or rows the trigger missed).
  FOR r IN
    SELECT p.id FROM public.profiles p
    LEFT JOIN matchmaking.builder_feature f ON f.user_id = p.id
    WHERE p.college ILIKE '%bajaj%'
      AND matchmaking.college_key(p.college) IN (c_m_key, c_n_key)
      AND f.college_key IS DISTINCT FROM matchmaking.college_key(p.college)
    ORDER BY p.id
  LOOP
    PERFORM matchmaking.refresh_builder(r.id);
    v_builders := v_builders + 1;
  END LOOP;
  FOR r IN
    SELECT t.id FROM public.teams t
    LEFT JOIN matchmaking.team_feature f ON f.team_id = t.id
    WHERE t.college ILIKE '%bajaj%'
      AND matchmaking.college_key(t.college) IN (c_m_key, c_n_key)
      AND f.college_key IS DISTINCT FROM matchmaking.college_key(t.college)
    ORDER BY t.id
  LOOP
    PERFORM matchmaking.refresh_team(r.id);
    v_teams := v_teams + 1;
  END LOOP;

  -- 6. Post-conditions.
  IF EXISTS (SELECT 1 FROM gl_candidates c JOIN public.profiles p ON p.id = c.id
             WHERE c.category = 'legacy_mathura' AND p.college IS DISTINCT FROM c_m_name) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: a legacy Mathura row was not backfilled';
  END IF;
  IF EXISTS (SELECT 1 FROM gl_candidates c JOIN public.profiles p ON p.id = c.id
             WHERE c.category <> 'legacy_mathura' AND p.college IS DISTINCT FROM c.college) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: a non-Mathura candidate row changed';
  END IF;
  IF EXISTS (SELECT 1 FROM gl_candidates c LEFT JOIN matchmaking.builder_feature f ON f.user_id = c.id
             WHERE c.category IN ('ambiguous', 'unrelated')
               AND f.college_key IS DISTINCT FROM c.feature_key_before) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: an ambiguous or unrelated cached key changed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p LEFT JOIN matchmaking.builder_feature f ON f.user_id = p.id
             WHERE p.college ILIKE '%bajaj%' AND matchmaking.college_key(p.college) IN (c_m_key, c_n_key)
               AND f.college_key IS DISTINCT FROM matchmaking.college_key(p.college))
     OR EXISTS (SELECT 1 FROM matchmaking.builder_feature f JOIN public.profiles p ON p.id = f.user_id
                WHERE f.college_key IN (c_m_key, c_n_key)
                  AND matchmaking.college_key(p.college) IS DISTINCT FROM f.college_key) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: builder_feature college keys are inconsistent';
  END IF;
  IF EXISTS (SELECT 1 FROM matchmaking.builder_feature f
             WHERE f.college_key IN (c_m_key, c_n_key) AND f.eligible
               AND NOT EXISTS (SELECT 1 FROM matchmaking.builder_feed b
                               WHERE b.user_id = f.user_id AND b.bucket = 'college:' || f.college_key)) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: builder_feed is missing a GL Bajaj college bucket';
  END IF;
  IF EXISTS (SELECT 1 FROM public.teams t LEFT JOIN matchmaking.team_feature f ON f.team_id = t.id
             WHERE t.college ILIKE '%bajaj%' AND matchmaking.college_key(t.college) IN (c_m_key, c_n_key)
               AND f.college_key IS DISTINCT FROM matchmaking.college_key(t.college)) THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: team_feature college keys are inconsistent';
  END IF;
  SELECT count(*), coalesce(md5(string_agg(a.alias || '=' || a.college_key, E'\n' ORDER BY a.alias)), '')
  INTO v_other_count_after, v_other_fp_after
  FROM matchmaking.college_alias a WHERE a.college_key NOT IN (c_m_key, c_n_key);
  IF v_other_count_after <> v_other_count OR v_other_fp_after <> v_other_fp THEN
    RAISE EXCEPTION 'GL Bajaj Phase B guard: unrelated college aliases changed';
  END IF;

  RAISE NOTICE 'GL Bajaj Phase B: first_run=%, aliases_added=%, profiles_updated=%, builders_refreshed=%, teams_refreshed=%, ambiguous_untouched=%',
    v_first_run, v_aliases_added, v_updated, v_builders, v_teams, v_ambiguous;
END
$$;

DROP FUNCTION pg_temp.gl_bajaj_match_key(text);

COMMIT;
