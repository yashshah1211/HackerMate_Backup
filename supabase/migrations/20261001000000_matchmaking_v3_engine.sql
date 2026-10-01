-- ============================================================================
-- Migration: 20261001000000_matchmaking_v3_engine.sql
-- Purpose: Matchmaking v3 — Numeric 0-100 Compatibility Engine.
--   Replaces qualitative labels with deterministic Bayesian scoring.
--   Includes public.get_recommended_teammates_v3
-- ============================================================================

create function public.get_recommended_teammates_v3(
  p_user_id uuid, p_limit integer default 10
)
returns table (
  id uuid,full_name text,avatar_url text,college text,bio text,skills text[],
  github_url text,linkedin_url text,year_of_study text,is_available boolean,
  compatibility integer,shared_skills text[],same_college boolean,
  confidence double precision,components jsonb,reasons text[],score_version text
)
language plpgsql stable security definer set search_path = '' as $$
declare 
  me matchmaking.builder_feature; 
  blocked uuid[]; 
  buckets text[]; 
  pivot uuid;
  lim integer := least(greatest(coalesce(p_limit,10),1),50);
begin
  perform matchmaking.assert_viewer(p_user_id);
  
  select b.user_id,b.skills,b.foundations,b.domains,b.college_key,b.available,b.experience,
         b.eligible,b.ticket,b.version,b.refreshed_at,b.foundation_mask into strict me
  from matchmaking.builder_feature b where b.user_id=p_user_id;
  
  blocked := array(select b.blocked_id from public.blocked_users b where b.blocker_id=p_user_id
                   union select b.blocker_id from public.blocked_users b where b.blocked_id=p_user_id);
                   
  buckets := array['all','available','d:1','d:2','d:3','d:4','d:5','d:6','d:7'];
  pivot := md5(p_user_id::text||':'||(now() at time zone 'UTC')::date::text||':builders:v3')::uuid;
  
  return query
  with pool as materialized (select q.id from matchmaking.builder_pool(buckets,pivot) q),
  eligible as materialized (
    select p.id,f.skills as canonical_skills,f.foundation_mask,f.domains,f.experience,
           p.is_available,
           case when me.college_key is null or f.college_key is null then null
                else me.college_key=f.college_key end as same
    from pool q join public.profiles p on p.id=q.id
    join matchmaking.builder_feature f on f.user_id=p.id and f.version=1
    where p.id<>p_user_id and p.onboarding_completed is true and not coalesce(p.is_banned,false)
      and not (p.id=any(blocked))
  ), raw as materialized (
    select e.id, e.canonical_skills, e.same, e.is_available, e.experience,
      (select sum(x) from unnest(me.domains) x) as v_breadth,
      (select sum(y) from unnest(e.domains) y) as c_breadth,
      (
        select sum(greatest(0::double precision, 1.0 - me.domains[i]) * 
                   (e.domains[i] / greatest(1.0::double precision, (select sum(y) from unnest(e.domains) y) / 2.5)))
        from generate_series(1,7) i
      ) as comp_sum,
      pg_catalog.bit_count(me.foundation_mask & e.foundation_mask) as shared_foundations
    from eligible e
  ), scores as materialized (
    select r.id, r.canonical_skills, r.same,
      50.0 * (1.0 - exp(-r.comp_sum / 1.2)) as comp_points,
      25.0 * (1.0 - exp(-r.shared_foundations / 1.4)) as overlap_points,
      case when r.experience is not null then 25.0 * r.experience else 0.0 end as exp_points,
      least(r.v_breadth / 0.8, 1.0) as v_skill_ev,
      least(r.c_breadth / 0.8, 1.0) as c_skill_ev,
      case when r.experience is not null then 1.0 else 0.0 end as exp_ev
    from raw r
  ), combined as materialized (
    select s.id, s.canonical_skills, s.same,
      sqrt(s.v_skill_ev * s.c_skill_ev) as pair_ev,
      s.exp_ev,
      s.comp_points, s.overlap_points, s.exp_points,
      (50.0 * sqrt(s.v_skill_ev * s.c_skill_ev) + 
       25.0 * sqrt(s.v_skill_ev * s.c_skill_ev) + 
       25.0 * s.exp_ev) as observed_weight,
      (sqrt(s.v_skill_ev * s.c_skill_ev) * s.comp_points + 
       sqrt(s.v_skill_ev * s.c_skill_ev) * s.overlap_points + 
       s.exp_ev * s.exp_points) as observed_points
    from scores s
  ), final as materialized (
    select c.id, c.canonical_skills, c.same,
      c.observed_weight / 100.0 as conf,
      case when c.observed_weight > 0 then (c.observed_points / c.observed_weight) * 100.0 else 15.0 end as norm_comp,
      c.comp_points, c.overlap_points, c.exp_points
    from combined c
  ), ranked as materialized (
    select f.id, f.canonical_skills, f.same, f.conf, f.norm_comp,
      15.0 + f.conf * (f.norm_comp - 15.0) as final_score,
      f.comp_points, f.overlap_points, f.exp_points
    from final f
    order by final_score desc, f.id limit lim
  )
  select p.id, p.full_name, p.avatar_url, p.college, p.bio, p.skills, p.github_url, p.linkedin_url,
    p.year_of_study, p.is_available, greatest(0, least(100, round(r.final_score::numeric)::integer)),
    array(select unnest(me.skills) intersect select unnest(r.canonical_skills) order by 1),
    coalesce(r.same, false), r.conf,
    jsonb_build_object('complementarity', r.comp_points, 'foundation', r.overlap_points, 'experience', r.exp_points),
    array_remove(array[
      case when r.comp_points >= 25.0 then 'Adds complementary capability' end,
      case when r.overlap_points >= 15.0 then 'Shares foundations' end,
      case when r.exp_points >= 10.0 then 'Proven execution evidence' end
    ], null), 'mm-v3'::text
  from ranked r join public.profiles p on p.id = r.id
  order by r.final_score desc, r.id;
end;
$$;

revoke all on function public.get_recommended_teammates_v3(uuid,integer) from public,anon;
grant execute on function public.get_recommended_teammates_v3(uuid,integer) to authenticated;
