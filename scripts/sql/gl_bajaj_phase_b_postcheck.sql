-- =============================================================================
-- scripts/sql/gl_bajaj_phase_b_postcheck.sql
-- GL Bajaj Phase B read-only postcheck (run AFTER 20261024120000_gl_bajaj_college_alias.sql)
-- =============================================================================
-- PROD-SAFE: one SELECT. Creates nothing, writes nothing, calls no matchmaking
-- function (matchmaking.norm / college_key are inlined). Returns counts only.
--
-- Rows:
--   gate  every row must have pass = true
--   info  record and compare with the precheck output taken before applying
-- Users may legitimately edit their college after the migration; if a gate about
-- backfilled or ambiguous rows fails, check the 'info' drift rows before escalating.
-- =============================================================================
WITH
c AS (
  SELECT 'GL Bajaj Group of Institutions, Mathura'::text AS m_name,
         'gl-bajaj-mathura'::text AS m_key,
         'GL Bajaj Institute of Technology & Management, Greater Noida'::text AS n_name,
         'gl-bajaj-greater-noida'::text AS n_key,
         ARRAY['gl bajaj group of institutions mathura','gl bajaj group of institution mathura','gl bajaj mathura'] AS m_keys,
         ARRAY['gl bajaj institute of technology and management greater noida'] AS n_keys
),
-- Inlined matchmaking.college_key(): alias = lower(btrim(collapsed whitespace)).
prof AS (
  SELECT p.id, p.college, al.college_key AS resolved, f.college_key AS feature_key, f.eligible, k.match_key
  FROM public.profiles p
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
  LEFT JOIN matchmaking.college_alias al ON al.alias = lower(btrim(regexp_replace(coalesce(p.college, ''), '\s+', ' ', 'g')))
  LEFT JOIN matchmaking.builder_feature f ON f.user_id = p.id
  WHERE p.college ILIKE '%bajaj%'
),
cat AS (
  SELECT prof.*,
    CASE
      WHEN college = c.m_name THEN 'canonical_mathura'
      WHEN college = c.n_name THEN 'canonical_greater_noida'
      WHEN match_key = ANY (c.m_keys) THEN 'legacy_mathura'
      WHEN match_key = ANY (c.n_keys) THEN 'legacy_greater_noida'
      WHEN match_key ~ '(^| )(gl bajaj|glbajaj)( |$)' THEN 'ambiguous'
      ELSE 'unrelated'
    END AS category
  FROM prof, c
),
n AS (
  SELECT
    count(*) FILTER (WHERE category = 'legacy_mathura') AS legacy,
    count(*) FILTER (WHERE category = 'ambiguous') AS ambiguous,
    count(*) FILTER (WHERE category = 'canonical_mathura') AS canonical_m,
    count(*) FILTER (WHERE category = 'canonical_greater_noida') AS canonical_n,
    count(*) FILTER (WHERE category IN ('ambiguous', 'unrelated') AND (resolved IN (c.m_key, c.n_key) OR feature_key IN (c.m_key, c.n_key))) AS ambiguous_keyed,
    count(*) FILTER (WHERE category = 'canonical_mathura' AND (resolved IS DISTINCT FROM c.m_key OR feature_key IS DISTINCT FROM c.m_key)) AS m_wrong,
    count(*) FILTER (WHERE category = 'canonical_greater_noida' AND (resolved IS DISTINCT FROM c.n_key OR feature_key IS DISTINCT FROM c.n_key)) AS n_wrong,
    count(*) FILTER (WHERE resolved IN (c.m_key, c.n_key) AND feature_key IS DISTINCT FROM resolved) AS stale
  FROM cat CROSS JOIN c
),
bf AS (
  SELECT
    (SELECT count(*) FROM matchmaking.gl_bajaj_college_backfill) AS rows,
    (SELECT count(*) FROM matchmaking.gl_bajaj_college_backfill b JOIN public.profiles p ON p.id = b.profile_id
       WHERE p.college IS DISTINCT FROM b.new_college) AS edited_since,
    (SELECT count(*) FROM matchmaking.gl_bajaj_college_backfill b
       JOIN matchmaking.college_alias al ON al.alias = lower(btrim(regexp_replace(b.previous_college, '\s+', ' ', 'g')))
       CROSS JOIN c WHERE al.college_key = c.m_key) AS previous_aliased
),
al AS (
  SELECT
    count(*) FILTER (WHERE x.college_key = c.m_key) AS m_aliases,
    count(*) FILTER (WHERE x.college_key = c.n_key) AS n_aliases,
    count(*) FILTER (WHERE x.college_key = c.m_key AND (x.alias ~ 'noida' OR x.alias !~ 'mathura')) AS m_cross,
    count(*) FILTER (WHERE x.college_key = c.n_key AND (x.alias ~ 'mathura' OR x.alias !~ 'noida')) AS n_cross,
    bool_or(x.alias = lower(c.m_name) AND x.college_key = c.m_key) AS m_canonical,
    bool_or(x.alias = lower(c.n_name) AND x.college_key = c.n_key) AS n_canonical,
    count(*) FILTER (WHERE x.college_key NOT IN (c.m_key, c.n_key)) AS other_n,
    coalesce(md5(string_agg(x.alias || '=' || x.college_key, E'\n' ORDER BY x.alias)
      FILTER (WHERE x.college_key NOT IN (c.m_key, c.n_key))), '') AS other_fp
  FROM matchmaking.college_alias x CROSS JOIN c
),
feed AS (
  SELECT count(*) AS missing
  FROM matchmaking.builder_feature f, c
  WHERE f.college_key IN (c.m_key, c.n_key) AND f.eligible
    AND NOT EXISTS (SELECT 1 FROM matchmaking.builder_feed b WHERE b.user_id = f.user_id AND b.bucket = 'college:' || f.college_key)
),
orphan AS (
  -- Cached GL Bajaj keys whose stored college no longer resolves to that key.
  SELECT count(*) AS n
  FROM matchmaking.builder_feature f
  JOIN public.profiles p ON p.id = f.user_id
  CROSS JOIN c
  LEFT JOIN matchmaking.college_alias al ON al.alias = lower(btrim(regexp_replace(coalesce(p.college, ''), '\s+', ' ', 'g')))
  WHERE f.college_key IN (c.m_key, c.n_key) AND al.college_key IS DISTINCT FROM f.college_key
),
tm AS (
  SELECT count(*) AS stale
  FROM public.teams t
  CROSS JOIN c
  JOIN matchmaking.college_alias al ON al.alias = lower(btrim(regexp_replace(coalesce(t.college, ''), '\s+', ' ', 'g')))
  LEFT JOIN matchmaking.team_feature f ON f.team_id = t.id
  WHERE al.college_key IN (c.m_key, c.n_key) AND f.college_key IS DISTINCT FROM al.college_key
)
SELECT r.section, r.check_name, r.actual, r.expected,
       CASE WHEN r.section = 'gate' THEN r.actual = r.expected END AS pass
FROM (
  SELECT 1 AS o, 'gate' AS section, 'legacy Mathura rows remaining' AS check_name, n.legacy::text AS actual, '0' AS expected FROM n
  UNION ALL SELECT 2, 'gate', 'ambiguous GL Bajaj rows (unchanged)', n.ambiguous::text, '7' FROM n
  UNION ALL SELECT 3, 'gate', 'ambiguous/unrelated rows resolving or cached to a GL Bajaj key', n.ambiguous_keyed::text, '0' FROM n
  UNION ALL SELECT 4, 'gate', 'canonical Mathura rows not keyed gl-bajaj-mathura', n.m_wrong::text, '0' FROM n
  UNION ALL SELECT 5, 'gate', 'canonical Greater Noida rows not keyed gl-bajaj-greater-noida', n.n_wrong::text, '0' FROM n
  UNION ALL SELECT 6, 'gate', 'profiles with a stale cached GL Bajaj key', n.stale::text, '0' FROM n
  UNION ALL SELECT 7, 'gate', 'cached GL Bajaj keys not matching stored college', orphan.n::text, '0' FROM orphan
  UNION ALL SELECT 8, 'gate', 'eligible GL Bajaj builders missing college feed bucket', feed.missing::text, '0' FROM feed
  UNION ALL SELECT 9, 'gate', 'teams with a stale cached GL Bajaj key', tm.stale::text, '0' FROM tm
  UNION ALL SELECT 10, 'gate', 'backfill record rows', bf.rows::text, '11' FROM bf
  UNION ALL SELECT 11, 'gate', 'backfilled previous spellings aliased to Mathura', bf.previous_aliased::text, '11' FROM bf
  UNION ALL SELECT 12, 'gate', 'Mathura aliases naming Noida or not naming Mathura', al.m_cross::text, '0' FROM al
  UNION ALL SELECT 13, 'gate', 'Greater Noida aliases naming Mathura or not naming Noida', al.n_cross::text, '0' FROM al
  UNION ALL SELECT 14, 'gate', 'canonical Mathura alias present', coalesce(al.m_canonical, false)::text, 'true' FROM al
  UNION ALL SELECT 15, 'gate', 'canonical Greater Noida alias present', coalesce(al.n_canonical, false)::text, 'true' FROM al
  UNION ALL SELECT 16, 'gate', 'Greater Noida alias rows', al.n_aliases::text, '1' FROM al
  UNION ALL SELECT 20, 'info', 'Mathura alias rows', al.m_aliases::text, '7..16' FROM al
  UNION ALL SELECT 21, 'info', 'canonical Mathura rows (11 backfilled + pre-existing)', n.canonical_m::text, '12 per audit' FROM n
  UNION ALL SELECT 22, 'info', 'canonical Greater Noida rows', n.canonical_n::text, 'any' FROM n
  UNION ALL SELECT 23, 'info', 'backfilled rows edited by users since', bf.edited_since::text, '0 right after apply' FROM bf
  UNION ALL SELECT 24, 'info', 'unrelated alias rows (must equal precheck)', al.other_n::text, 'precheck value' FROM al
  UNION ALL SELECT 25, 'info', 'unrelated alias fingerprint (must equal precheck)', al.other_fp, 'precheck value' FROM al
) r
ORDER BY r.o;
