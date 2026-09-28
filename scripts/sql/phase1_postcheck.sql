-- =============================================================================
-- scripts/sql/phase1_postcheck.sql
-- Phase 1 (P0 database authorization lockdown) read-only verification
-- =============================================================================
-- Label: every row produced by this file is PROD-SAFE.
--   * It is ONE read-only SELECT over catalog views (pg_proc, pg_policies,
--     pg_constraint, pg_class, pg_attribute) and the migration ledger.
--   * It reads no user rows and writes nothing.
--   * Safe to run in the Supabase SQL editor or through the read-only MCP
--     (role supabase_read_only_user) at any stage.
--
-- Spec:   .kiro/specs/p0-database-authorization-lockdown (Req 4.3, 4.5, 6, 9.4, 9.5, 10)
-- Matrix: PRIORITIZED_ACTION_PLAN.md §1.7 (rows F-*, P-*, G-*)
-- Sources of the expected values:
--   * PRE-1A / PRE-1B: frontend/supabase/rollback/phase1_prestate.sql §A, §C, §F
--   * ALWAYS:          ENGINEERING_AUDIT.md §10.11 E1 (round-three snapshot)
--   * POST-1A / POST-1B: ENGINEERING_AUDIT.md §10.4 "Final" columns
--
-- Four-role notation: P/a/A/S = PUBLIC / anon / authenticated / service_role
-- (T = has EXECUTE, F = doesn't). PUBLIC means a direct grant to PUBLIC; the other
-- three are effective privileges (has_function_privilege).
--
-- HOW TO READ THE RESULT (filter on `section`):
--   Deployment step (§1.4)            Rows that must ALL pass
--   2  before applying 1A             PRE-1A, ALWAYS
--   4  after 1A, before repair        POST-1A, ALWAYS
--   5  after `migration repair` (1A)  POST-1A-REPAIRED (G-6)
--   7  before applying 1B             PRE-1B, POST-1A, ALWAYS
--   8  after 1B, before repair        POST-1B, POST-1A, ALWAYS
--   9  after `migration repair` (1B)  POST-1B-REPAIRED (G-6)
-- Rows for other stages are expected to fail at that point (that is the baseline).
--
-- G-7 fingerprints are md5 of the LF-normalised function body (prosrc). They are
-- generated from the 1A migration file. If that file ever changes, regenerate with:
--   node scripts/verify-db-authz.js fingerprints
-- =============================================================================

WITH
-- -----------------------------------------------------------------------------
-- Expected four-role state and search_path per function signature.
-- -----------------------------------------------------------------------------
fn_expect(section, check_id, sig, exp_acl, exp_config) AS (
  VALUES
  -- PRE-1A (§1.4 step 2 gate): the 19 functions 1A touches, exactly as in §A.
  ('PRE-1A', 'G-0',  'public.add_user_to_team(uuid,uuid,text)',                    'F/F/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.check_rate_limit(text,integer,interval)',             'T/T/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.cleanup_lapsed_streaks()',                            'F/F/T/T', 'search_path=public'),
  ('PRE-1A', 'G-0',  'public.delete_message(uuid)',                                'T/T/T/T', 'search_path=public'),
  ('PRE-1A', 'G-0',  'public.delete_user_completely(uuid)',                        'F/T/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.generate_team_invite_token(uuid)',                    'F/T/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.get_authorized_profile_email(uuid)',                  'T/T/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.get_authorized_profile_email(uuid,uuid)',             'T/T/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.get_pending_deadline_reminders()',                    'T/T/T/T', ''),
  ('PRE-1A', 'G-0',  'public.get_public_builder_profile(text,uuid)',               'T/T/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.is_admin(uuid)',                                      'T/T/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.join_team_instantly(uuid,text)',                      'F/T/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.mark_deadline_reminder_sent(uuid[])',                 'T/T/T/T', ''),
  ('PRE-1A', 'G-0',  'public.record_daily_visit()',                                'T/T/T/T', 'search_path=public'),
  ('PRE-1A', 'G-0',  'public.send_connection_request(uuid)',                       'F/F/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.send_connection_request(uuid,text)',                  'T/T/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.send_message(uuid,text,uuid)',                        'T/T/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.send_message_with_mentions(uuid,text,uuid[],uuid)',   'T/T/T/T', 'search_path=public, pg_temp'),
  ('PRE-1A', 'G-0',  'public.toggle_message_reaction(uuid,text)',                  'T/T/T/T', 'search_path=public, pg_catalog'),

  -- ALWAYS: the 31 functions Phase 1 does not touch keep their exact state,
  -- including the direct service_role grant (decision D3).
  ('ALWAYS', 'G-1u', 'public.accept_connection_request(uuid)',                     'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.accept_team_invite(uuid)',                            'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.accept_team_join_request(uuid)',                      'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.add_member_to_team_conversation()',                   'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.can_access_conversation(uuid)',                       'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.create_team_conversation()',                          'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.create_team_with_owner(text,text,integer,text,uuid,text,text[],text[])', 'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.ensure_team_conversation(uuid)',                      'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.get_builder_public_stats(uuid)',                      'T/T/T/T', 'search_path=public'),
  ('ALWAYS', 'G-1u', 'public.get_my_dm_conversations()',                           'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.get_or_create_dm(uuid)',                              'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.get_recommended_teammates(uuid,integer,boolean)',     'F/F/T/T', 'search_path=""'),
  ('ALWAYS', 'G-1u', 'public.get_recommended_teams(uuid,integer,boolean)',         'F/F/T/T', 'search_path=""'),
  ('ALWAYS', 'G-1u', 'public.grant_hackathon_winner_badges(uuid,uuid[],text,text,text,text,jsonb)', 'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.handle_new_user()',                                   'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.handle_notification_insert_webhook()',                'T/T/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.handle_profile_before_delete()',                      'T/T/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.handle_profile_roles_update()',                       'T/T/T/T', ''),
  ('ALWAYS', 'G-1u', 'public.handle_updated_at()',                                 'T/T/T/T', ''),
  ('ALWAYS', 'G-1u', 'public.is_conversation_participant(uuid)',                   'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.is_team_member(uuid)',                                'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.is_team_owner(uuid)',                                 'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.mark_conversation_read(uuid)',                        'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.pin_message(uuid)',                                   'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.reject_team_invite(uuid)',                            'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.remove_member_from_team_conversation()',              'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.request_to_join_team(uuid)',                          'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.send_team_invite(uuid,uuid)',                         'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.submit_feedback(text,text)',                          'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.toggle_message_pin(uuid)',                            'F/F/T/T', 'search_path=public, pg_temp'),
  ('ALWAYS', 'G-1u', 'public.unpin_message(uuid)',                                 'F/F/T/T', 'search_path=public, pg_temp'),

  -- POST-1A: the 16 retained touched functions, final model (ENGINEERING_AUDIT.md §10.4).
  ('POST-1A', 'F-1',  'public.add_user_to_team(uuid,uuid,text)',                   'F/F/F/F', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-8',  'public.get_public_builder_profile(text,uuid)',              'F/T/T/F', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-5',  'public.get_pending_deadline_reminders()',                   'F/F/F/T', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-6',  'public.mark_deadline_reminder_sent(uuid[])',                'F/F/F/T', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-7',  'public.check_rate_limit(text,integer,interval)',            'F/F/F/T', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-13', 'public.cleanup_lapsed_streaks()',                           'F/F/F/T', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-11', 'public.delete_message(uuid)',                               'F/F/T/F', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-11', 'public.delete_user_completely(uuid)',                       'F/F/T/F', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-11', 'public.generate_team_invite_token(uuid)',                   'F/F/T/F', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-11', 'public.join_team_instantly(uuid,text)',                     'F/F/T/F', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-11', 'public.record_daily_visit()',                               'F/F/T/F', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-11', 'public.send_connection_request(uuid,text)',                 'F/F/T/F', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-11', 'public.send_message(uuid,text,uuid)',                       'F/F/T/F', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-11', 'public.send_message_with_mentions(uuid,text,uuid[],uuid)',  'F/F/T/F', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-11', 'public.toggle_message_reaction(uuid,text)',                 'F/F/T/F', 'search_path=public, pg_temp'),
  ('POST-1A', 'F-12', 'public.is_admin(uuid)',                                     'F/F/T/F', 'search_path=public, pg_temp')
),
fn_rows AS (
  SELECT
    e.section,
    e.check_id,
    e.sig AS object,
    e.exp_acl || ' | ' || e.exp_config AS expected,
    CASE
      WHEN to_regprocedure(e.sig) IS NULL THEN '(function missing)'
      ELSE
        (CASE WHEN EXISTS (
            SELECT 1
            FROM pg_proc p
            CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
            WHERE p.oid = to_regprocedure(e.sig) AND x.grantee = 0 AND x.privilege_type = 'EXECUTE'
          ) THEN 'T' ELSE 'F' END)
        || '/' || (CASE WHEN has_function_privilege('anon', to_regprocedure(e.sig), 'EXECUTE') THEN 'T' ELSE 'F' END)
        || '/' || (CASE WHEN has_function_privilege('authenticated', to_regprocedure(e.sig), 'EXECUTE') THEN 'T' ELSE 'F' END)
        || '/' || (CASE WHEN has_function_privilege('service_role', to_regprocedure(e.sig), 'EXECUTE') THEN 'T' ELSE 'F' END)
        || ' | ' || (SELECT coalesce(array_to_string(p.proconfig, ';'), '') FROM pg_proc p WHERE p.oid = to_regprocedure(e.sig))
    END AS actual
  FROM fn_expect e
),

-- -----------------------------------------------------------------------------
-- Dropped functions (1A-4, 1A-10).
-- -----------------------------------------------------------------------------
dropped_rows AS (
  SELECT
    'POST-1A'::text AS section,
    v.check_id,
    v.sig AS object,
    'absent'::text AS expected,
    CASE WHEN to_regprocedure(v.sig) IS NULL THEN 'absent' ELSE 'present' END AS actual
  FROM (VALUES
    ('F-9',  'public.get_authorized_profile_email(uuid)'),
    ('F-9',  'public.get_authorized_profile_email(uuid,uuid)'),
    ('F-14', 'public.send_connection_request(uuid)')
  ) v(check_id, sig)
),

-- -----------------------------------------------------------------------------
-- Pre-1A definition fingerprints: md5 of the LF-normalised pg_get_functiondef()
-- for every body phase1_prestate.sql §C captured (proves the rollback source is
-- still exact at step 2).
-- -----------------------------------------------------------------------------
prestate_fp_rows AS (
  SELECT
    'PRE-1A'::text AS section,
    'G-0f'::text AS check_id,
    v.sig || ' definition' AS object,
    v.md5 AS expected,
    coalesce(
      (SELECT md5(replace(pg_get_functiondef(p.oid), E'\r\n', E'\n')) FROM pg_proc p WHERE p.oid = to_regprocedure(v.sig)),
      '(function missing)'
    ) AS actual
  FROM (VALUES
    ('public.add_user_to_team(uuid,uuid,text)',            'b6c74de3851ebc9f6e61222e4f90dca5'),
    ('public.get_public_builder_profile(text,uuid)',       '4aa6fd7b2795aa53ea9e4c151867b7d4'),
    ('public.get_authorized_profile_email(uuid,uuid)',     '80bdfbff45573a53d8c79ef47a0768a2'),
    ('public.get_authorized_profile_email(uuid)',          '4882b8db23c55a98ec4f5471e1fcde9c'),
    ('public.send_connection_request(uuid)',               '2f0912cd2be71af9656332a877813a8f'),
    ('public.check_rate_limit(text,integer,interval)',     'e8410a1d464f43770506355bc7abbce6'),
    ('public.get_pending_deadline_reminders()',            'f4778546e6aa155da4396eba2ce707d8'),
    ('public.mark_deadline_reminder_sent(uuid[])',         'c49ca27bbdb6481804e6ee3207f28570')
  ) v(sig, md5)
),

-- -----------------------------------------------------------------------------
-- Post-1A body fingerprints (G-7): md5 of the LF-normalised prosrc, generated
-- from supabase/migrations/20260928100000_phase1a_definer_function_privileges.sql.
-- -----------------------------------------------------------------------------
body_fp_rows AS (
  SELECT
    'POST-1A'::text AS section,
    'G-7'::text AS check_id,
    v.sig || ' body' AS object,
    v.md5 AS expected,
    coalesce(
      (SELECT md5(replace(p.prosrc, E'\r\n', E'\n')) FROM pg_proc p WHERE p.oid = to_regprocedure(v.sig)),
      '(function missing)'
    ) AS actual
  FROM (VALUES
    ('public.add_user_to_team(uuid,uuid,text)',        '9715ab58953122752ebfa7687a83e71d'),
    ('public.get_public_builder_profile(text,uuid)',   'f1aa6a98e65f80539fd2e713a511f02e'),
    ('public.check_rate_limit(text,integer,interval)', '0841214a6c4904f193833a8def1d8851')
  ) v(sig, md5)
),

-- -----------------------------------------------------------------------------
-- 1A-3 body assertions (F-8, F-15; decisions D1, D2, FUN-06).
-- -----------------------------------------------------------------------------
gpbp AS (
  SELECT replace(p.prosrc, E'\r\n', E'\n') AS src
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.get_public_builder_profile(text,uuid)')
),
body_rows AS (
  SELECT 'POST-1A'::text AS section, v.check_id, v.object, v.expected,
         coalesce((SELECT (position(v.needle IN gpbp.src) > 0)::text FROM gpbp), '(function missing)') AS actual
  FROM (VALUES
    ('F-15', 'get_public_builder_profile body references team_projects',             'team_projects',                                      'false'),
    ('F-8',  'get_public_builder_profile body references is_admin (admin branch)',    'is_admin',                                           'false'),
    ('F-8',  'get_public_builder_profile body references p_caller_id',               'p_caller_id',                                        'false'),
    ('F-8',  'get_public_builder_profile body derives the caller from auth.uid()',    'v_caller uuid := auth.uid()',                        'true'),
    ('F-15', 'get_public_builder_profile body returns ''projects'', ''[]''::jsonb',   '''projects'', ''[]''::jsonb',                        'true'),
    ('F-16', 'get_public_builder_profile body has the show_track_record restriction', 'COALESCE(v_profile.show_track_record, true) = false', 'true')
  ) v(check_id, object, needle, expected)
),
aut_body_rows AS (
  SELECT 'POST-1A'::text AS section, 'F-1'::text AS check_id,
         'add_user_to_team body enforces p_role = ''member''' AS object,
         'true'::text AS expected,
         coalesce((SELECT (position('IF p_role IS DISTINCT FROM ''member'' THEN' IN p.prosrc) > 0)::text
                   FROM pg_proc p WHERE p.oid = to_regprocedure('public.add_user_to_team(uuid,uuid,text)')),
                  '(function missing)') AS actual
),

-- -----------------------------------------------------------------------------
-- Anon allowlist (Req 4.3): after 1A, anon executes exactly these six public
-- SECURITY DEFINER functions.
-- -----------------------------------------------------------------------------
anon_rows AS (
  SELECT
    'POST-1A'::text AS section,
    'G-1a'::text AS check_id,
    'public SECURITY DEFINER functions executable by anon' AS object,
    'get_builder_public_stats(uuid), get_public_builder_profile(text, uuid), handle_notification_insert_webhook(), handle_profile_before_delete(), handle_profile_roles_update(), handle_updated_at()'::text AS expected,
    coalesce((
      SELECT string_agg(sig, ', ' ORDER BY sig COLLATE "C")
      FROM (
        SELECT format('%s(%s)', p.proname, oidvectortypes(p.proargtypes)) AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
      ) s
    ), '(none)') AS actual
),

-- -----------------------------------------------------------------------------
-- Policy and constraint (1A-12 / F-10, 1A-2).
-- -----------------------------------------------------------------------------
policy_constraint_rows AS (
  SELECT v.section, v.check_id, v.object, v.expected,
         CASE v.kind
           WHEN 'policy' THEN
             CASE WHEN EXISTS (
               SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'conversation_participants'
                 AND policyname = 'conversation_participants_insert'
             ) THEN 'present' ELSE 'absent' END
           ELSE
             -- Reports validation state AND the exact deparsed expression, so a
             -- same-named constraint with a different (e.g. NULL-permitting)
             -- expression fails the check.
             coalesce((
               SELECT CASE WHEN c.convalidated THEN 'present, validated: ' ELSE 'present, NOT validated: ' END
                      || pg_get_constraintdef(c.oid)
               FROM pg_constraint c
               WHERE c.conrelid = 'public.team_members'::regclass AND c.conname = 'team_members_role_check'
                 AND c.contype = 'c'
             ), 'absent')
         END AS actual
  FROM (VALUES
    ('PRE-1A',  'G-0',  'policy',     'policy conversation_participants_insert', 'present'),
    ('POST-1A', 'F-10', 'policy',     'policy conversation_participants_insert', 'absent'),
    ('PRE-1A',  'G-0',  'constraint', 'constraint team_members_role_check',      'absent'),
    ('POST-1A', '1A-2', 'constraint', 'constraint team_members_role_check',
      'present, validated: CHECK (((role IS NOT NULL) AND (role = ANY (ARRAY[''owner''::text, ''member''::text]))))')
  ) v(section, check_id, kind, object, expected)
),

-- -----------------------------------------------------------------------------
-- profiles privileges.
-- PRE-1B (Req 6.6): the exact pre-state recorded in phase1_prestate.sql §F.
-- POST-1B (P-11 ... P-14): exactly 20 columns updatable by authenticated, none by anon.
-- -----------------------------------------------------------------------------
prof_cols AS (
  SELECT a.attname::text AS col, a.attacl
  FROM pg_attribute a
  WHERE a.attrelid = 'public.profiles'::regclass AND a.attnum > 0 AND NOT a.attisdropped
),
whitelist(col) AS (
  VALUES
    ('avatar_url'), ('bio'), ('college'), ('year_of_study'), ('gender'), ('skills'),
    ('github_url'), ('linkedin_url'), ('is_available'), ('show_track_record'),
    ('onboarding_completed'), ('referrer_source'), ('last_seen_at'), ('updated_at'),
    ('has_participated_hackathon'), ('hackathon_participations'), ('has_won_hackathon'),
    ('hackathon_wins'), ('github_stats'), ('github_stats_updated_at')
),
profile_rows AS (
  -- PRE-1B: table ACL
  SELECT 'PRE-1B'::text AS section, 'P-0'::text AS check_id,
         'public.profiles table ACL' AS object,
         '{postgres=arwdDxtm/postgres,anon=awdDxtm/postgres,authenticated=awdDxtm/postgres,service_role=arwdDxtm/postgres}'::text AS expected,
         (SELECT c.relacl::text FROM pg_class c WHERE c.oid = 'public.profiles'::regclass) AS actual
  UNION ALL
  -- PRE-1B: column ACLs
  SELECT 'PRE-1B', 'P-0', 'profiles.' || pc.col || ' column ACL',
         CASE pc.col
           WHEN 'year_of_study' THEN '{anon=r/postgres,authenticated=rw/postgres}'
           WHEN 'email' THEN '(none)'
           ELSE '{anon=r/postgres,authenticated=r/postgres}'
         END,
         coalesce(pc.attacl::text, '(none)')
  FROM prof_cols pc
  UNION ALL
  SELECT 'PRE-1B', 'P-0', 'profiles column count', '35', (SELECT count(*)::text FROM prof_cols)
  UNION ALL
  -- POST-1B: table-level UPDATE gone for both roles
  SELECT 'POST-1B', 'P-14', 'profiles table-level UPDATE (anon/authenticated)', 'F/F',
         (CASE WHEN has_table_privilege('anon', 'public.profiles', 'UPDATE') THEN 'T' ELSE 'F' END)
         || '/' || (CASE WHEN has_table_privilege('authenticated', 'public.profiles', 'UPDATE') THEN 'T' ELSE 'F' END)
  UNION ALL
  -- POST-1B: per-column UPDATE (anon/authenticated)
  SELECT 'POST-1B',
         CASE
           WHEN pc.col = 'email' THEN 'P-11'
           WHEN pc.col IN ('role', 'is_banned') THEN 'P-12'
           WHEN pc.col IN ('current_streak', 'longest_streak', 'last_active_date',
                           'onboarding_nudge_sent_at', 'last_onboarding_nudge_sent_at',
                           'profile_nudge_count', 'last_nudge_sent_at', 'sih_broadcast_sent_at',
                           'created_at', 'username', 'full_name') THEN 'P-13'
           ELSE 'P-14'
         END,
         'UPDATE profiles.' || pc.col || ' (anon/authenticated)',
         CASE WHEN pc.col IN (SELECT col FROM whitelist) THEN 'F/T' ELSE 'F/F' END,
         (CASE WHEN has_column_privilege('anon', 'public.profiles'::regclass, pc.col, 'UPDATE') THEN 'T' ELSE 'F' END)
         || '/' || (CASE WHEN has_column_privilege('authenticated', 'public.profiles'::regclass, pc.col, 'UPDATE') THEN 'T' ELSE 'F' END)
  FROM prof_cols pc
  UNION ALL
  SELECT 'POST-1B', 'P-14', 'profiles columns updatable by authenticated (count)', '20',
         (SELECT count(*)::text FROM prof_cols pc
          WHERE has_column_privilege('authenticated', 'public.profiles'::regclass, pc.col, 'UPDATE'))
  UNION ALL
  SELECT 'POST-1B', 'P-14', 'profiles column count (the whitelist was reviewed against 35)', '35',
         (SELECT count(*)::text FROM prof_cols)
),

-- -----------------------------------------------------------------------------
-- Migration ledger (G-6). "latest other" must stay the pre-Phase-1 latest version.
-- -----------------------------------------------------------------------------
ledger AS (
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE version = '20260928100000') AS v1a,
    count(*) FILTER (WHERE version = '20260928100100') AS v1b,
    max(version) FILTER (WHERE version NOT IN ('20260928100000', '20260928100100')) AS latest_other
  FROM supabase_migrations.schema_migrations
),
ledger_rows AS (
  SELECT v.section, 'G-6'::text AS check_id, 'supabase_migrations.schema_migrations' AS object, v.expected,
         format('%s rows; 1A=%s; 1B=%s; latest other=%s', l.total, l.v1a, l.v1b, l.latest_other) AS actual
  FROM ledger l
  CROSS JOIN (VALUES
    ('PRE-1A',           '131 rows; 1A=0; 1B=0; latest other=20260905154343'),
    ('POST-1A-REPAIRED', '132 rows; 1A=1; 1B=0; latest other=20260905154343'),
    ('POST-1B-REPAIRED', '133 rows; 1A=1; 1B=1; latest other=20260905154343')
  ) v(section, expected)
),

all_rows AS (
  SELECT section, check_id, object, expected, actual FROM fn_rows
  UNION ALL SELECT section, check_id, object, expected, actual FROM dropped_rows
  UNION ALL SELECT section, check_id, object, expected, actual FROM prestate_fp_rows
  UNION ALL SELECT section, check_id, object, expected, actual FROM body_fp_rows
  UNION ALL SELECT section, check_id, object, expected, actual FROM body_rows
  UNION ALL SELECT section, check_id, object, expected, actual FROM aut_body_rows
  UNION ALL SELECT section, check_id, object, expected, actual FROM anon_rows
  UNION ALL SELECT section, check_id, object, expected, actual FROM policy_constraint_rows
  UNION ALL SELECT section, check_id, object, expected, actual FROM profile_rows
  UNION ALL SELECT section, check_id, object, expected, actual FROM ledger_rows
)
SELECT
  section,
  check_id,
  'PROD-SAFE' AS label,
  object,
  expected,
  actual,
  coalesce(expected = actual, false) AS pass
FROM all_rows
ORDER BY
  CASE section
    WHEN 'PRE-1A' THEN 1
    WHEN 'ALWAYS' THEN 2
    WHEN 'POST-1A' THEN 3
    WHEN 'POST-1A-REPAIRED' THEN 4
    WHEN 'PRE-1B' THEN 5
    WHEN 'POST-1B' THEN 6
    WHEN 'POST-1B-REPAIRED' THEN 7
    ELSE 8
  END,
  check_id,
  object;
