-- ============================================================================
-- Migration: 20260822120100_get_recommended_teammates_rpc
-- Purpose: Replace the dashboard's full-table profiles download
--   (src/app/dashboard/page.tsx, "Fetch all other profiles for
--   compatibility calculation" block) with a bounded, indexed,
--   server-side Jaccard-compatibility query.
--
-- Ported verbatim from the previous client-side logic:
--   score = |skills ∩ other| / |skills ∪ other| × 100 (lowercased, trimmed),
--   clamped to [5, 99]; same-college detection incl. acronym first-word list
--   and substring containment.
--
-- Deliberate deltas vs. the old client code:
--   1. Excludes banned / non-onboarded builders (directory already did;
--      the dashboard silently didn't).
--   2. Blocked users are excluded here → the two blocked_users round trips
--      on the dashboard are removed as well.
--   3. Deterministic tie-break on created_at DESC.
--   4. Returns no email and no github_stats jsonb (payload stays small and
--      consistent with the email-privacy posture of migration 20260808182000).
-- ============================================================================

create or replace function public.get_recommended_teammates(
  p_user_id uuid,
  p_limit int default 50
)
returns table (
  id            uuid,
  full_name     text,
  avatar_url    text,
  college       text,
  bio           text,
  skills        text[],
  github_url    text,
  linkedin_url  text,
  year_of_study text,
  is_available  boolean,
  compatibility int,
  shared_skills text[],
  same_college  boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select
      id,
      array(select lower(btrim(s)) from unnest(skills) s where btrim(s) <> '') as ns,
      lower(btrim(college)) as ncol
    from public.profiles
    where id = p_user_id
  ),

  my_blocks as (
    select blocked_id as uid from public.blocked_users where blocker_id = p_user_id
    union
    select blocker_id as uid from public.blocked_users where blocked_id = p_user_id
  ),

  -- c.* is intentional (keeps parity with any future profile columns used in
  -- scoring); only the explicit column list below ever leaves the function.
  candidates as (
    select
      c.*,
      array(select lower(btrim(s)) from unnest(c.skills) s where btrim(s) <> '') as ns,
      lower(btrim(c.college)) as ncol,
      (regexp_split_to_array(lower(btrim(c.college)), '[\s,()]+'))[1] as fw
    from public.profiles c
    where c.id <> p_user_id
      and c.onboarding_completed = true
      and coalesce(c.is_banned, false) = false
      and c.id not in (select uid from my_blocks)
  ),

  scored as (
    select
      s.*,
      m.ns    as my_ns,
      m.ncol  as my_ncol,
      (regexp_split_to_array(coalesce(m.ncol, ''), '[\s,()]+'))[1] as my_fw,
      array(select unnest(m.ns) intersect select unnest(s.ns)) as shared_arr,
      (select count(distinct x)::int from (
        select unnest(m.ns) union select unnest(s.ns)
      ) u(x)) as union_size
    from candidates s
    cross join me m
  ),

  ranked as (
    select
      s.id,
      s.full_name,
      s.avatar_url,
      s.college,
      s.bio,
      s.skills,
      s.github_url,
      s.linkedin_url,
      s.year_of_study,
      s.is_available,
      greatest(5, least(
        case when s.union_size > 0
             then round((cardinality(s.shared_arr) * 100.0) / s.union_size)::int
             else 0
        end,
        99
      )) as compatibility,
      coalesce(s.shared_arr, '{}') as shared_skills,
      (
        s.ncol is not null and s.my_ncol is not null and s.ncol <> ''
        and (
          s.ncol = s.my_ncol
          or (
            s.fw = s.my_fw
            and s.fw = any(array[
              'djsce', 'spit', 'vjti', 'tsec', 'vesit',
              'coep', 'pict', 'vit', 'mit', 'vnit'
            ])
          )
          or position(s.ncol in s.my_ncol) > 0
          or position(s.my_ncol in s.ncol) > 0
        )
      ) as same_college,
      s.created_at
    from scored s
  )

  select
    r.id,
    r.full_name,
    r.avatar_url,
    r.college,
    r.bio,
    r.skills,
    r.github_url,
    r.linkedin_url,
    r.year_of_study,
    r.is_available,
    r.compatibility,
    r.shared_skills,
    r.same_college
  from ranked r
  order by r.compatibility desc, r.created_at desc nulls last
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function public.get_recommended_teammates(uuid, int) from public, anon;
grant execute on function public.get_recommended_teammates(uuid, int) to authenticated;
