-- Additive, authenticated builder search. Apply separately before the new client.
-- SECURITY INVOKER preserves profiles RLS and existing column-level SELECT grants.
-- Never apply the historical migration directory as a backlog (supabase/README.md).

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- This document is only an indexed candidate filter. The RPC checks each skill
-- separately below, so matches across separators never become actual matches.
create function public.builder_skill_search_document(p_skills text[])
returns text
language sql immutable strict parallel safe
set search_path = ''
as $$
  select pg_catalog.string_agg(pg_catalog.lower(s.value), E'\n' order by s.position)
  from pg_catalog.unnest(p_skills) with ordinality as s(value, position)
$$;

revoke all on function public.builder_skill_search_document(text[]) from public, anon;
grant execute on function public.builder_skill_search_document(text[]) to authenticated;

-- Respect an already-installed pg_trgm extension's schema; do not relocate it.
-- Only trusted catalog identifiers enter this DDL, quoted with %I. Search input
-- never enters dynamic SQL.
do $$
declare trgm_schema text;
begin
  select n.nspname into strict trgm_schema
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  execute pg_catalog.format(
    'create index profiles_builder_search_name_trgm_idx on public.profiles using gin (pg_catalog.lower(full_name) %I.gin_trgm_ops)', trgm_schema);
  execute pg_catalog.format(
    'create index profiles_builder_search_college_trgm_idx on public.profiles using gin (pg_catalog.lower(college) %I.gin_trgm_ops)', trgm_schema);
  execute pg_catalog.format(
    'create index profiles_builder_search_skills_trgm_idx on public.profiles using gin (public.builder_skill_search_document(skills) %I.gin_trgm_ops)', trgm_schema);
end
$$;

create function public.search_builder_profiles(
  p_query text,
  p_sort text default 'fit',
  p_limit integer default 1000
)
returns table (
  id uuid, full_name text, college text, year_of_study text, bio text,
  avatar_url text, skills text[], is_available boolean,
  has_participated_hackathon boolean, hackathon_participations integer,
  has_won_hackathon boolean, hackathon_wins integer,
  last_seen_at timestamptz, created_at timestamptz
)
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  query text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, ''), E' \t\n\r\f\013'));
  pattern text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_sort is null or p_sort not in ('fit', 'active', 'new') then
    raise exception 'Invalid builder search sort' using errcode = '22023';
  end if;
  if pg_catalog.char_length(query) > 256 then
    raise exception 'Builder search must be 256 characters or fewer' using errcode = '22023';
  end if;

  -- Literal substring matching: %, _ and backslash have no wildcard meaning.
  pattern := '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
    query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

  return query
  select p.id, p.full_name, p.college, p.year_of_study, p.bio,
    p.avatar_url, p.skills, p.is_available,
    p.has_participated_hackathon, p.hackathon_participations,
    p.has_won_hackathon, p.hackathon_wins, p.last_seen_at, p.created_at
  from public.profiles p
  where query = ''
    or pg_catalog.lower(p.full_name) like pattern escape E'\\'
    or pg_catalog.lower(p.college) like pattern escape E'\\'
    or (public.builder_skill_search_document(p.skills) like pattern escape E'\\'
      and exists (
        select 1 from pg_catalog.unnest(p.skills) as s(skill)
        where pg_catalog.lower(s.skill) like pattern escape E'\\'
      ))
  order by
    case when p_sort = 'active' then p.last_seen_at end desc nulls last,
    case when p_sort <> 'active' then p.created_at end desc,
    p.id
  limit least(greatest(coalesce(p_limit, 1000), 0), 1000);
end
$$;

revoke all on function public.search_builder_profiles(text, text, integer) from public, anon;
grant execute on function public.search_builder_profiles(text, text, integer) to authenticated;
notify pgrst, 'reload schema';
