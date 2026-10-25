-- =============================================================================
-- scripts/sql/gl_bajaj_phase_b_precheck.sql
-- GL Bajaj Phase B read-only precheck (run BEFORE 20261024120000_gl_bajaj_college_alias.sql)
-- =============================================================================
-- PROD-SAFE: one SELECT. It creates nothing, writes nothing and calls no matchmaking
-- function (matchmaking.norm is inlined). It returns stored college spellings and
-- counts, never user ids. Run it in a READ ONLY transaction or the read-only MCP.
--
-- Rows:
--   gate    every row must have pass = true before applying the migration
--   info    context to record in the release notes (compare with the postcheck)
--   detail  one row per stored spelling: category, spelling, row count
-- The match_key logic is identical to Phase A collegeMatchKey() and to the
-- migration's pg_temp.gl_bajaj_match_key(); the local test checks all three agree.
-- =============================================================================
WITH
c AS (
  SELECT 'GL Bajaj Group of Institutions, Mathura'::text AS m_name,
         'gl-bajaj-mathura'::text AS m_key,
         'GL Bajaj Institute of Technology & Management, Greater Noida'::text AS n_name,
         'gl-bajaj-greater-noida'::text AS n_key,
         ARRAY['gl bajaj group of institutions mathura','gl bajaj group of institution mathura','gl bajaj mathura'] AS m_keys,
         ARRAY['gl bajaj institute of technology and management greater noida'] AS n_keys,
         ARRAY['GL Bajaj Group Of Institutions Mathura','GL Bajaj Group Of Institutions, Mathura',
               'G.L. Bajaj Group Of Institutions, Mathura','G.L.bajaj group of institutions mathura',
               'GL Bajaj group of institution mathura','G.l bajaj mathura','Gl bajaj mathura'] AS reviewed
),
cand AS (
  SELECT p.id, p.college, k.match_key, f.college_key AS feature_key,
    CASE
      WHEN p.college = c.m_name THEN 'canonical_mathura'
      WHEN p.college = c.n_name THEN 'canonical_greater_noida'
      WHEN k.match_key = ANY (c.m_keys) THEN 'legacy_mathura'
      WHEN k.match_key = ANY (c.n_keys) THEN 'legacy_greater_noida'
      WHEN k.match_key ~ '(^| )(gl bajaj|glbajaj)( |$)' THEN 'ambiguous'
      ELSE 'unrelated'
    END AS category
  FROM public.profiles p
  CROSS JOIN c
  CROSS JOIN LATERAL (
    SELECT coalesce(string_agg(w.word, ' ' ORDER BY w.pos), '') AS match_key
    FROM (
      SELECT min(i.ord) AS pos,
             CASE WHEN i.single THEN string_agg(i.tok, '' ORDER BY i.ord) ELSE min(i.tok) END AS word
      FROM (
        SELECT t.tok, t.ord, t.single, t.ord - row_number() OVER (PARTITION BY t.single ORDER BY t.ord) AS grp
        FROM (
          SELECT s.tok, s.ord, s.tok ~ '^[a-z]$' AS single
          FROM regexp_split_to_table(
            btrim(regexp_replace(replace(lower(coalesce(p.college, '')), '&', ' and '), '[^a-z0-9]+', ' ', 'g')), ' '
          ) WITH ORDINALITY AS s(tok, ord)
          WHERE s.tok <> ''
        ) t
      ) i
      GROUP BY i.single, CASE WHEN i.single THEN i.grp ELSE i.ord END
    ) w
  ) k
  LEFT JOIN matchmaking.builder_feature f ON f.user_id = p.id
  WHERE p.college ILIKE '%bajaj%'
),
n AS (
  SELECT
    count(*) FILTER (WHERE category = 'legacy_mathura') AS legacy,
    count(DISTINCT college) FILTER (WHERE category = 'legacy_mathura') AS spellings,
    count(*) FILTER (WHERE category = 'ambiguous') AS ambiguous,
    count(*) FILTER (WHERE category = 'legacy_greater_noida') AS legacy_noida,
    count(*) FILTER (WHERE category = 'canonical_mathura') AS canonical_m,
    count(*) FILTER (WHERE category = 'canonical_greater_noida') AS canonical_n,
    count(*) FILTER (WHERE category = 'legacy_mathura' AND (college !~* 'mathura' OR college ~* 'noida')) AS not_mathura_only,
    count(*) FILTER (WHERE category IN ('legacy_mathura', 'ambiguous') AND feature_key IS NOT NULL) AS keyed_now
  FROM cand
),
intended AS (
  SELECT lower(btrim(regexp_replace(v, '\s+', ' ', 'g'))) AS alias, c.m_key AS college_key
  FROM c, unnest(ARRAY[c.m_name] || c.reviewed) v
  UNION
  SELECT lower(btrim(regexp_replace(x.college, '\s+', ' ', 'g'))), c.m_key
  FROM cand x, c WHERE x.category = 'legacy_mathura'
  UNION
  SELECT lower(btrim(regexp_replace(c.n_name, '\s+', ' ', 'g'))), c.n_key FROM c
),
a AS (
  SELECT
    (SELECT count(*) FROM matchmaking.college_alias x JOIN intended i ON i.alias = x.alias
      WHERE x.college_key <> i.college_key) AS conflicts,
    (SELECT count(*) FROM matchmaking.college_alias x, c WHERE x.college_key IN (c.m_key, c.n_key)) AS using_keys,
    (SELECT count(*) FROM (SELECT alias FROM intended GROUP BY alias HAVING count(DISTINCT college_key) > 1) d) AS dual,
    (SELECT count(*) FROM intended, c WHERE college_key = c.m_key) AS intended_m,
    (SELECT count(*) FROM intended, c WHERE college_key = c.n_key) AS intended_n,
    (SELECT count(*) FROM matchmaking.college_alias x, c WHERE x.college_key NOT IN (c.m_key, c.n_key)) AS other_n,
    (SELECT coalesce(md5(string_agg(x.alias || '=' || x.college_key, E'\n' ORDER BY x.alias)), '')
       FROM matchmaking.college_alias x, c WHERE x.college_key NOT IN (c.m_key, c.n_key)) AS other_fp
),
teams AS (
  SELECT
    (SELECT count(DISTINCT r.id) FROM (
       SELECT tm.team_id AS id FROM public.team_members tm JOIN cand x ON x.id = tm.user_id AND x.category = 'legacy_mathura'
       UNION SELECT t.id FROM public.teams t JOIN cand x ON x.id = t.owner_id AND x.category = 'legacy_mathura'
     ) r) AS related,
    (SELECT count(*) FROM public.teams t, c WHERE t.college ILIKE '%bajaj%') AS gl_teams
),
trig AS (
  SELECT coalesce(string_agg(t.tgname || ':' || t.tgenabled::text, ', ' ORDER BY t.tgname), '') AS list,
         coalesce(bool_or(t.tgname = 'matchmaking_profile_changed' AND t.tgenabled IN ('O','A')), false) AS mm
  FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid = 'public.profiles'::regclass AND NOT t.tgisinternal
)
SELECT r.section, r.check_name, r.actual, r.expected, g.ok AS pass FROM (
  SELECT 1 AS o, 'gate' AS section, 'matchmaking objects exist' AS check_name,
    ((to_regclass('matchmaking.college_alias') IS NOT NULL AND to_regclass('matchmaking.builder_feature') IS NOT NULL
      AND to_regclass('matchmaking.builder_feed') IS NOT NULL AND to_regclass('matchmaking.team_feature') IS NOT NULL
      AND to_regprocedure('matchmaking.norm(text)') IS NOT NULL AND to_regprocedure('matchmaking.college_key(text)') IS NOT NULL
      AND to_regprocedure('matchmaking.refresh_builder(uuid)') IS NOT NULL AND to_regprocedure('matchmaking.refresh_team(uuid)') IS NOT NULL))::text AS actual,
    'true' AS expected, NULL::boolean AS pass
  UNION ALL SELECT 2, 'gate', 'matchmaking_profile_changed enabled on profiles', trig.mm::text, 'true', NULL FROM trig
  UNION ALL SELECT 3, 'gate', 'backfill table not yet created', (to_regclass('matchmaking.gl_bajaj_college_backfill') IS NULL)::text, 'true', NULL
  UNION ALL SELECT 4, 'gate', 'legacy Mathura rows', n.legacy::text, '11', NULL FROM n
  UNION ALL SELECT 5, 'gate', 'legacy Mathura distinct spellings', n.spellings::text, '9', NULL FROM n
  UNION ALL SELECT 6, 'gate', 'ambiguous GL Bajaj rows (left unchanged)', n.ambiguous::text, '7', NULL FROM n
  UNION ALL SELECT 7, 'gate', 'legacy Greater Noida rows (unreviewed)', n.legacy_noida::text, '0', NULL FROM n
  UNION ALL SELECT 8, 'gate', 'legacy Mathura rows not naming Mathura alone', n.not_mathura_only::text, '0', NULL FROM n
  UNION ALL SELECT 9, 'gate', 'existing aliases conflicting with intended aliases', a.conflicts::text, '0', NULL FROM a
  UNION ALL SELECT 10, 'gate', 'existing aliases already using a GL Bajaj key', a.using_keys::text, '0', NULL FROM a
  UNION ALL SELECT 11, 'gate', 'intended aliases mapping to both campuses', a.dual::text, '0', NULL FROM a
  UNION ALL SELECT 20, 'info', 'canonical Mathura rows (not updated; cache refreshed if stale)', n.canonical_m::text, 'any', NULL FROM n
  UNION ALL SELECT 21, 'info', 'canonical Greater Noida rows (not updated; cache refreshed if stale)', n.canonical_n::text, 'any', NULL FROM n
  UNION ALL SELECT 22, 'info', 'legacy/ambiguous rows with a non-null cached key', n.keyed_now::text, '0 per audit', NULL FROM n
  UNION ALL SELECT 23, 'info', 'intended Mathura aliases', a.intended_m::text, '7..16', NULL FROM a
  UNION ALL SELECT 24, 'info', 'intended Greater Noida aliases', a.intended_n::text, '1', NULL FROM a
  UNION ALL SELECT 25, 'info', 'unrelated alias rows (compare with postcheck)', a.other_n::text, 'unchanged after', NULL FROM a
  UNION ALL SELECT 26, 'info', 'unrelated alias fingerprint (compare with postcheck)', a.other_fp, 'unchanged after', NULL FROM a
  UNION ALL SELECT 27, 'info', 'teams the profile trigger will re-derive', teams.related::text, 'any', NULL FROM teams
  UNION ALL SELECT 28, 'info', 'teams with a Bajaj college value', teams.gl_teams::text, '0 per audit', NULL FROM teams
  UNION ALL SELECT 29, 'info', 'profiles triggers (name:enabled)', trig.list, 'review', NULL FROM trig
  -- Body fingerprints; compare with the values printed by the local test (repository versions).
  UNION ALL
  SELECT 30 + row_number() OVER (ORDER BY f.proname), 'info', 'fingerprint matchmaking.' || f.proname,
         md5(replace(f.prosrc, E'\r', '')), 'local test value', NULL
  FROM pg_catalog.pg_proc f JOIN pg_catalog.pg_namespace s ON s.oid = f.pronamespace
  WHERE s.nspname = 'matchmaking' AND f.proname IN ('norm', 'college_key', 'refresh_builder', 'refresh_team', 'profile_changed')
  UNION ALL
  SELECT 100 + row_number() OVER (ORDER BY x.category, x.college), 'detail', x.category, x.college, x.rows::text, NULL
  FROM (SELECT category, college, count(*) AS rows FROM cand GROUP BY category, college) x
) r
CROSS JOIN LATERAL (SELECT CASE WHEN r.section = 'gate' THEN r.actual = r.expected END AS ok) g
ORDER BY r.o;
