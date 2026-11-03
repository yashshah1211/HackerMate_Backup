-- Release migration. Qualified only in the disposable native PG17.6 fixture; no production execution is authorized.
-- Add a service-only metadata channel; existing factual writers and partner guards are unchanged.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
CREATE FUNCTION public.store_hackathon_source_evidence(
  p_id uuid, p_identity jsonb, p_observation jsonb, p_expected jsonb,
  p_attempt uuid, p_action text, p_allow_initial boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
SET lock_timeout = '2s' SET timezone = 'UTC' AS $$
DECLARE
  h public.hackathons%ROWTYPE; identity_provider text := p_identity->>'provider';
  identity_id text := p_identity->>'provider_id'; canonical text := p_identity->>'canonical_url';
  matches integer; expected jsonb; metadata jsonb; facts jsonb; locked jsonb; field text;
  checked timestamptz; expires timestamptz; reg_start timestamptz; reg_end timestamptz;
  source_fields text[] := ARRAY['name','description','website_url','college','start_date','end_date',
    'registration_start','registration_end','registration_status','min_team_size','max_team_size',
    'mode','location','prize_pool','currency','rounds_info','rounds_count','tags'];
  preserved text[] := ARRAY['name','description','website_url','college','start_date','end_date',
    'min_team_size','max_team_size','mode','location','prize_pool','currency','rounds_info','rounds_count','tags'];
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
    RAISE EXCEPTION 'Source evidence requires server authority' USING ERRCODE='42501';
  END IF;
  IF p_id IS NULL OR p_attempt IS NULL OR p_action IS NULL OR p_action NOT IN ('lease','apply','failure')
    OR p_allow_initial IS NULL OR p_allow_initial AND p_action <> 'apply'
    OR jsonb_typeof(p_identity) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_identity->'provider') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_identity->'provider_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_identity->'canonical_url') IS DISTINCT FROM 'string'
    OR coalesce(identity_provider,'') NOT IN ('unstop','devfolio','hack2skill')
    OR coalesce(identity_id,'') !~ '^[a-zA-Z0-9_-]{1,200}$' OR length(canonical)>2048
    OR (identity_provider='unstop' AND (canonical !~ '^https://unstop[.]com/(hackathons|competitions|o)/[a-zA-Z0-9_/-]+$'
      OR substring(canonical from '([0-9]+)$') IS DISTINCT FROM identity_id))
    OR (identity_provider='devfolio' AND canonical !~ '^https://[a-z0-9-]+[.]devfolio[.]co$')
    OR (identity_provider='hack2skill' AND (canonical !~ '^https://hack2skill[.]com/event/[a-zA-Z0-9_-]+$' OR identity_id !~ '^[0-9a-f]{24}$')) THEN
    RAISE EXCEPTION 'Invalid evidence identity or action' USING ERRCODE='22023';
  END IF;
  -- Share the identity lock with the unchanged factual writer and bind every legacy alias.
  PERFORM pg_advisory_xact_lock(hashtextextended('hackathon-source:'||identity_provider||':'||identity_id,0));
  SELECT count(*) INTO matches FROM public.hackathons x WHERE x.id=p_id
    OR (x.source_metadata->>'provider'=identity_provider AND x.source_metadata->>'provider_id'=identity_id)
    OR rtrim(x.website_url,'/')=canonical
    OR (identity_provider='unstop' AND x.website_url ~* '^https://unstop[.]com/(hackathons|competitions|o)/'
      AND substring(rtrim(split_part(split_part(x.website_url,'?',1),'#',1),'/') from '([0-9]+)$')=identity_id);
  IF matches<>1 THEN RAISE EXCEPTION 'Missing or duplicate source identity' USING ERRCODE='23505'; END IF;
  SELECT * INTO h FROM public.hackathons WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
  IF coalesce(h.type,'') NOT IN ('external','official') THEN RETURN jsonb_build_object('status','protected'); END IF;
  IF (identity_provider='unstop' AND NOT (h.website_url ~* '^https://unstop[.]com/(hackathons|competitions|o)/'
      AND substring(rtrim(split_part(split_part(h.website_url,'?',1),'#',1),'/') from '([0-9]+)$')=identity_id))
    OR (identity_provider<>'unstop' AND rtrim(h.website_url,'/') IS DISTINCT FROM canonical)
    OR h.website_url IS NULL THEN RAISE EXCEPTION 'Record URL identity conflict' USING ERRCODE='22023'; END IF;
  IF h.source_metadata IS NOT NULL AND (h.source_metadata->'evidence_only' IS DISTINCT FROM 'true'::jsonb
    OR h.source_metadata->>'provider' IS DISTINCT FROM identity_provider OR h.source_metadata->>'provider_id' IS DISTINCT FROM identity_id
    OR jsonb_typeof(h.source_metadata->'protected_fields') IS DISTINCT FROM 'array') THEN
    RETURN jsonb_build_object('status','protected');
  END IF;
  IF h.source_metadata IS NULL AND NOT p_allow_initial THEN RETURN jsonb_build_object('status','requires_adoption'); END IF;
  IF p_action='failure' THEN
    IF h.source_metadata->>'attempt_id' IS DISTINCT FROM p_attempt::text OR h.source_metadata->>'check_status' IS DISTINCT FROM 'checking' THEN
      RETURN jsonb_build_object('status','superseded'); END IF;
    UPDATE public.hackathons SET source_metadata=source_metadata||jsonb_build_object('check_status','failed','checked_at',clock_timestamp(),'last_error','source_check_unsuccessful') WHERE id=h.id;
    RETURN jsonb_build_object('status','failed','id',h.id);
  END IF;
  IF jsonb_typeof(p_expected) IS DISTINCT FROM 'object' OR NOT p_expected ?& (source_fields||ARRAY['id','type','organizer_id','status','archived']) THEN
    RAISE EXCEPTION 'Complete factual/control comparison required' USING ERRCODE='22023'; END IF;
  SELECT jsonb_object_agg(k,to_jsonb(jsonb_populate_record(NULL::public.hackathons,p_expected))->k)
    INTO expected FROM jsonb_object_keys(p_expected) AS k;
  IF NOT to_jsonb(h) @> expected THEN RETURN jsonb_build_object('status','conflict','id',h.id); END IF;
  IF p_action='lease' THEN
    IF h.source_metadata->>'check_status'='checking' AND (h.source_metadata->>'attempt_started_at')::timestamptz>clock_timestamp()-interval '5 minutes' THEN
      RETURN jsonb_build_object('status','busy'); END IF;
    UPDATE public.hackathons SET source_metadata=source_metadata||jsonb_build_object('check_status','checking','attempt_id',p_attempt,'attempt_started_at',clock_timestamp()) WHERE id=h.id;
    RETURN jsonb_build_object('status','leased','snapshot',to_jsonb(h)-'source_metadata');
  END IF;
  IF h.source_metadata IS NOT NULL AND (h.source_metadata->>'attempt_id' IS DISTINCT FROM p_attempt::text OR h.source_metadata->>'check_status' IS DISTINCT FROM 'checking') THEN
    RETURN jsonb_build_object('status','superseded'); END IF;
  facts := p_observation->'facts';
  IF jsonb_typeof(p_observation) IS DISTINCT FROM 'object' OR p_observation->'version' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(p_observation->'provider') IS DISTINCT FROM 'string' OR jsonb_typeof(p_observation->'provider_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_observation->'canonical_url') IS DISTINCT FROM 'string' OR jsonb_typeof(facts->'website_url') IS DISTINCT FROM 'string'
    OR p_observation->>'provider' IS DISTINCT FROM identity_provider OR p_observation->>'provider_id' IS DISTINCT FROM identity_id
    OR p_observation->>'canonical_url' IS DISTINCT FROM canonical OR p_observation->>'check_status' IS DISTINCT FROM 'ok'
    OR p_observation->>'category' IS DISTINCT FROM 'hackathon' OR jsonb_typeof(facts) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_observation->'issues') IS DISTINCT FROM 'array' OR p_observation->'issues' IS DISTINCT FROM '[]'::jsonb
    OR jsonb_typeof(p_observation->'source_hash') IS DISTINCT FROM 'string' OR coalesce(p_observation->>'source_hash','') !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_observation->'checked_at') IS DISTINCT FROM 'string' OR jsonb_typeof(p_observation->'expires_at') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_observation->'evidence') IS DISTINCT FROM 'object'
    OR coalesce(p_observation->>'event_status','') NOT IN ('unknown','upcoming','ongoing','ended')
    OR coalesce(facts->>'registration_status','') NOT IN ('open','closed','not-yet-open','unknown') THEN
    RAISE EXCEPTION 'Invalid evidence observation' USING ERRCODE='22023'; END IF;
  IF facts->>'website_url' IS DISTINCT FROM canonical THEN RAISE EXCEPTION 'Fact URL identity conflict' USING ERRCODE='22023'; END IF;
  checked := (p_observation->>'checked_at')::timestamptz; expires := (p_observation->>'expires_at')::timestamptz;
  IF checked<clock_timestamp()-interval '5 minutes' OR checked>clock_timestamp()+interval '1 minute'
    OR expires<=checked OR expires>checked+interval '26 hours' OR expires<=clock_timestamp() THEN
    RAISE EXCEPTION 'Stale source evidence' USING ERRCODE='22023'; END IF;
  reg_start := CASE WHEN length(facts->>'registration_start')=10 THEN ((facts->>'registration_start')||'T00:00:00+05:30')::timestamptz ELSE (facts->>'registration_start')::timestamptz END;
  reg_end := CASE WHEN length(facts->>'registration_end')=10 THEN ((facts->>'registration_end')||'T00:00:00+05:30')::timestamptz+interval '1 day' ELSE (facts->>'registration_end')::timestamptz END;
  IF reg_start>=reg_end OR (facts->>'registration_status'='open' AND (reg_start IS NULL OR reg_end IS NULL OR checked<reg_start OR checked>=reg_end))
    OR (facts->>'registration_status'='not-yet-open' AND (reg_start IS NULL OR reg_end IS NULL OR checked>=reg_start)) THEN
    RAISE EXCEPTION 'Contradictory registration evidence' USING ERRCODE='22023'; END IF;
  locked := coalesce(h.source_metadata->'protected_fields','[]'::jsonb);
  FOREACH field IN ARRAY preserved LOOP IF NOT locked ? field THEN locked := locked||jsonb_build_array(field); END IF; END LOOP;
  -- A conflicting organizer registration edit remains protected as well; no field is overwritten.
  FOREACH field IN ARRAY ARRAY['registration_start','registration_end','registration_status'] LOOP
    IF to_jsonb(h)->field IS NOT NULL AND to_jsonb(h)->field<>'null'::jsonb
      AND to_jsonb(h)->field IS DISTINCT FROM (CASE field
        WHEN 'registration_start' THEN coalesce(to_jsonb(reg_start),'null'::jsonb)
        WHEN 'registration_end' THEN coalesce(to_jsonb(reg_end),'null'::jsonb)
        ELSE facts->field END)
      AND NOT locked ? field THEN locked := locked||jsonb_build_array(field); END IF;
  END LOOP;
  metadata := (p_observation - 'last_values' - 'protected_fields' - 'attempt_id')||jsonb_build_object(
    'evidence_only',true,'protected_fields',locked,'attempt_id',p_attempt,'last_success_at',p_observation->>'checked_at');
  -- The only successful apply assignment: no editorial column, linked row or partner setting is touched.
  UPDATE public.hackathons SET source_metadata=metadata WHERE id=h.id;
  RETURN jsonb_build_object('status','evidence_refreshed','id',h.id);
END $$;
REVOKE ALL ON FUNCTION public.store_hackathon_source_evidence(uuid,jsonb,jsonb,jsonb,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_hackathon_source_evidence(uuid,jsonb,jsonb,jsonb,uuid,text,boolean) TO service_role;
COMMIT;
