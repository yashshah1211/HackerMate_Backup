-- Prepared for review only. Apply only under a separately authorized release.
-- Pre-change access/dependency inventory: docs/qa/aggregator-repair/HACKATHON-ACCESS-INVENTORY.json.
BEGIN;
ALTER TABLE public.hackathons ADD COLUMN source_metadata jsonb;
ALTER TABLE public.hackathons ADD CONSTRAINT hackathons_source_metadata_shape CHECK (
  source_metadata IS NULL OR (jsonb_typeof(source_metadata) = 'object'
    AND source_metadata ? 'version' AND source_metadata->>'version' = '1' AND pg_column_size(source_metadata) <= 65536));
CREATE UNIQUE INDEX hackathons_source_identity_unique ON public.hackathons
  ((source_metadata->>'provider'), (source_metadata->>'provider_id')) WHERE source_metadata IS NOT NULL;

-- No existing table privileges or RLS predicates change. Protect the additive authority column
-- even where an existing table-wide INSERT/UPDATE grant covers newly added columns.
CREATE FUNCTION public.guard_hackathon_source_metadata() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE field text; locked jsonb; before_values jsonb; after_values jsonb;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.source_metadata IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND NEW.source_metadata IS DISTINCT FROM OLD.source_metadata) THEN
    IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
      RAISE EXCEPTION 'Source evidence is server-owned' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.source_metadata IS NOT NULL
    AND NEW.source_metadata IS NOT DISTINCT FROM OLD.source_metadata THEN
    before_values := to_jsonb(OLD); after_values := to_jsonb(NEW);
    locked := coalesce(OLD.source_metadata->'protected_fields','[]'::jsonb);
    FOREACH field IN ARRAY ARRAY['name','description','website_url','college','start_date','end_date',
      'registration_start','registration_end','registration_status','min_team_size','max_team_size',
      'mode','location','prize_pool','currency','rounds_info','rounds_count','tags'] LOOP
      IF before_values->field IS DISTINCT FROM after_values->field AND NOT locked ? field THEN
        locked := locked || jsonb_build_array(field);
      END IF;
    END LOOP;
    IF locked IS DISTINCT FROM coalesce(OLD.source_metadata->'protected_fields','[]'::jsonb) THEN
      NEW.source_metadata := OLD.source_metadata || jsonb_build_object('protected_fields',locked,
        'check_status','unresolved','issues',jsonb_build_array('editorial_override'));
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_hackathon_source_metadata() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER hackathons_source_metadata_guard BEFORE INSERT OR UPDATE ON public.hackathons
FOR EACH ROW EXECUTE FUNCTION public.guard_hackathon_source_metadata();

-- Committed before HTTP: a failed/killed/lost-response source check cannot leave an old
-- successful observation promoted. No database lock is held across provider requests.
CREATE FUNCTION public.begin_hackathon_source_check(p_id uuid,p_attempt uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public SET lock_timeout='2s' SET timezone='UTC' AS $$
DECLARE h public.hackathons%ROWTYPE;
BEGIN
  SELECT * INTO h FROM public.hackathons WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
  IF h.source_metadata IS NULL THEN RETURN jsonb_build_object('status','requires_adoption'); END IF;
  IF h.organizer_id IS NOT NULL OR coalesce(h.type,'') NOT IN ('external','official')
    OR EXISTS(SELECT 1 FROM public.partner_configs p WHERE p.hackathon_id=h.id
      OR rtrim(p.features->>'website_url','/')=rtrim(h.website_url,'/')) THEN
    RETURN jsonb_build_object('status','protected');
  END IF;
  IF h.source_metadata->>'check_status'='checking'
    AND (h.source_metadata->>'attempt_started_at')::timestamptz > clock_timestamp()-interval '5 minutes' THEN
    RETURN jsonb_build_object('status','busy');
  END IF;
  UPDATE public.hackathons SET source_metadata=source_metadata || jsonb_build_object(
    'check_status','checking','attempt_id',p_attempt,'attempt_started_at',clock_timestamp()) WHERE id=h.id;
  RETURN jsonb_build_object('status','leased','snapshot',to_jsonb(h)-'source_metadata');
END $$;
REVOKE ALL ON FUNCTION public.begin_hackathon_source_check(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_hackathon_source_check(uuid,uuid) TO service_role;

CREATE FUNCTION public.apply_hackathon_source_check(
  p_id uuid,p_identity jsonb,p_observation jsonb,p_patch jsonb,p_expected jsonb,p_attempt uuid,
  p_failure text DEFAULT NULL,p_adopt_fields text[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public SET lock_timeout='2s' SET timezone='UTC' AS $$
DECLARE
  h public.hackathons%ROWTYPE; result_row public.hackathons%ROWTYPE; matches integer;
  provider text := p_identity->>'provider'; provider_id text := p_identity->>'provider_id';
  canonical text := p_identity->>'canonical_url'; patch jsonb := '{}'::jsonb;
  baseline jsonb; locked jsonb; metadata jsonb; field text; value jsonb; current_values jsonb;
  source_fields constant text[] := ARRAY['name','description','website_url','college','start_date','end_date',
    'registration_start','registration_end','registration_status','min_team_size','max_team_size',
    'mode','location','prize_pool','currency','rounds_info','rounds_count','tags'];
BEGIN
  IF jsonb_typeof(p_identity) IS DISTINCT FROM 'object' OR NOT p_identity ?& ARRAY['provider','provider_id','canonical_url'] OR provider IS NULL OR provider NOT IN ('unstop','devfolio','hack2skill') OR provider_id IS NULL
    OR provider_id !~ '^[a-zA-Z0-9_-]{1,200}$' OR canonical IS NULL OR length(canonical)>2048
    OR (provider='unstop' AND canonical !~ '^https://unstop[.]com/(hackathons|competitions|o)/[a-zA-Z0-9_/-]+$')
    OR (provider='devfolio' AND canonical !~ '^https://[a-z0-9-]+[.]devfolio[.]co$')
    OR (provider='hack2skill' AND canonical !~ '^https://hack2skill[.]com/event/[a-zA-Z0-9_-]+$') THEN
    RAISE EXCEPTION 'Invalid source identity' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hackathon-source:'||provider||':'||provider_id,0));
  SELECT count(*) INTO matches FROM public.hackathons WHERE id=p_id
    OR (source_metadata->>'provider'=provider AND source_metadata->>'provider_id'=provider_id)
    OR rtrim(website_url,'/')=canonical;
  IF matches>1 THEN RAISE EXCEPTION 'Source identity conflict' USING ERRCODE='23505'; END IF;
  SELECT * INTO h FROM public.hackathons WHERE id=p_id
    OR (source_metadata->>'provider'=provider AND source_metadata->>'provider_id'=provider_id)
    OR rtrim(website_url,'/')=canonical FOR UPDATE;
  IF FOUND THEN
    IF h.organizer_id IS NOT NULL OR coalesce(h.type,'') NOT IN ('external','official')
      OR EXISTS(SELECT 1 FROM public.partner_configs p WHERE p.hackathon_id=h.id
        OR rtrim(p.features->>'website_url','/')=rtrim(h.website_url,'/')) THEN
      RETURN jsonb_build_object('status','protected','id',h.id);
    END IF;
    IF h.source_metadata IS NULL AND coalesce(cardinality(p_adopt_fields),0)=0 THEN
      RETURN jsonb_build_object('status','requires_adoption','id',h.id);
    END IF;
    IF h.source_metadata IS NOT NULL THEN
      IF h.source_metadata->>'provider' IS DISTINCT FROM provider
        OR h.source_metadata->>'provider_id' IS DISTINCT FROM provider_id THEN
        RAISE EXCEPTION 'Source identity changed' USING ERRCODE='22023';
      END IF;
      IF h.source_metadata->>'attempt_id' IS DISTINCT FROM p_attempt::text THEN
        RETURN jsonb_build_object('status','superseded','id',h.id);
      END IF;
      IF h.source_metadata->>'check_status'<>'checking' THEN
        RETURN jsonb_build_object('status','already_completed','id',h.id);
      END IF;
    END IF;
    IF p_failure IS NOT NULL THEN
      UPDATE public.hackathons SET source_metadata=source_metadata || jsonb_build_object(
        'check_status','failed','checked_at',clock_timestamp(),'last_error',left(p_failure,120)) WHERE id=h.id;
      RETURN jsonb_build_object('status','failed','id',h.id);
    END IF;
    -- Complete source field and control snapshot, not a blind upsert or a timestamp-only comparison.
    IF jsonb_typeof(p_expected) IS DISTINCT FROM 'object' OR NOT p_expected ?& (source_fields||ARRAY['id','type','organizer_id','status','archived']) THEN
      RAISE EXCEPTION 'Missing expected source/control snapshot' USING ERRCODE='22023';
    END IF;
    -- Compare typed values, not a PostgREST/psql timezone's textual serialization.
    -- Retain every supplied key and the required complete field/control snapshot.
    SELECT jsonb_object_agg(k,to_jsonb(jsonb_populate_record(NULL::public.hackathons,p_expected))->k)
      INTO metadata FROM jsonb_object_keys(p_expected) AS k;
    IF NOT to_jsonb(h) @> metadata THEN
      UPDATE public.hackathons SET source_metadata=source_metadata || jsonb_build_object('check_status','unresolved','issues',jsonb_build_array('editorial_conflict')) WHERE id=h.id;
      RETURN jsonb_build_object('status','conflict','id',h.id);
    END IF;
    current_values := to_jsonb(h); baseline := coalesce(h.source_metadata->'last_values','{}'::jsonb);
    locked := coalesce(h.source_metadata->'protected_fields','[]'::jsonb);
  ELSE
    IF p_id IS NOT NULL OR p_failure IS NOT NULL THEN RETURN jsonb_build_object('status','missing'); END IF;
    IF p_observation->>'category'<>'hackathon' OR p_observation->>'check_status'<>'ok' THEN
      RETURN jsonb_build_object('status','not_a_verified_hackathon');
    END IF;
    current_values := '{}'::jsonb; baseline := '{}'::jsonb; locked := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(p_observation) IS DISTINCT FROM 'object' OR NOT p_observation ?& ARRAY['version','provider','provider_id','canonical_url','check_status','category','source_hash','checked_at','facts'] OR p_observation->>'version'<>'1'
    OR p_observation->>'provider' IS DISTINCT FROM provider OR p_observation->>'provider_id' IS DISTINCT FROM provider_id
    OR p_observation->>'canonical_url' IS DISTINCT FROM canonical
    OR p_observation->>'check_status' NOT IN ('ok','unresolved')
    OR p_observation->>'category' NOT IN ('hackathon','other','unknown')
    OR p_observation->>'source_hash' !~ '^[0-9a-f]{64}$'
    OR (p_observation->>'checked_at')::timestamptz < clock_timestamp()-interval '5 minutes'
    OR (p_observation->>'checked_at')::timestamptz > clock_timestamp()+interval '1 minute' THEN
    RAISE EXCEPTION 'Invalid or stale source observation' USING ERRCODE='22023';
  END IF;
  IF p_adopt_fields IS NOT NULL AND NOT p_adopt_fields <@ source_fields THEN
    RAISE EXCEPTION 'Invalid adoption fields' USING ERRCODE='22023';
  END IF;
  FOR field,value IN SELECT e.key,e.value FROM jsonb_each(coalesce(p_patch,'{}'::jsonb)) e LOOP
    IF NOT field=ANY(source_fields) THEN RAISE EXCEPTION 'Unsupported source field' USING ERRCODE='22023'; END IF;
    IF value='null'::jsonb THEN CONTINUE; END IF; -- unknown does not erase known data
    IF h.id IS NOT NULL AND NOT field=ANY(coalesce(p_adopt_fields,ARRAY[]::text[]))
      AND (locked ? field OR (current_values->field IS NOT NULL AND current_values->field<>'null'::jsonb
        AND (NOT baseline ? field OR baseline->field IS DISTINCT FROM current_values->field))) THEN
      IF NOT locked ? field THEN locked := locked || jsonb_build_array(field); END IF;
      CONTINUE;
    END IF;
    patch := patch || jsonb_build_object(field,value); baseline := baseline || jsonb_build_object(field,value);
    IF field=ANY(coalesce(p_adopt_fields,ARRAY[]::text[])) THEN locked := locked-field; END IF;
  END LOOP;
  result_row := jsonb_populate_record(h,patch);
  IF (result_row.min_team_size IS NOT NULL AND result_row.min_team_size<1)
    OR (result_row.max_team_size IS NOT NULL AND result_row.max_team_size<1)
    OR result_row.min_team_size>result_row.max_team_size THEN RAISE EXCEPTION 'Invalid source team size' USING ERRCODE='22023'; END IF;
  SELECT baseline || coalesce(jsonb_object_agg(key,to_jsonb(result_row)->key),'{}'::jsonb) INTO baseline FROM jsonb_object_keys(patch) AS key;
  metadata := p_observation || jsonb_build_object('attempt_id',p_attempt,'last_values',baseline,
    'protected_fields',locked,'last_success_at',p_observation->>'checked_at',
    'expires_at',(p_observation->>'checked_at')::timestamptz+interval '26 hours');
  IF jsonb_array_length(locked)>0 THEN metadata := metadata || jsonb_build_object('check_status','unresolved','issues',jsonb_build_array('protected_fields')); END IF;
  IF h.id IS NULL THEN
    INSERT INTO public.hackathons(name,description,website_url,college,start_date,end_date,registration_start,registration_end,
      registration_status,min_team_size,max_team_size,mode,location,prize_pool,currency,rounds_info,rounds_count,tags,type,status,archived,source_metadata)
    VALUES(result_row.name,result_row.description,result_row.website_url,result_row.college,result_row.start_date,result_row.end_date,
      result_row.registration_start,result_row.registration_end,result_row.registration_status,result_row.min_team_size,result_row.max_team_size,
      result_row.mode,result_row.location,result_row.prize_pool,result_row.currency,coalesce(result_row.rounds_info,'[]'),result_row.rounds_count,
      result_row.tags,'external','approved',false,metadata) RETURNING id INTO h.id;
    RETURN jsonb_build_object('status','created','id',h.id);
  END IF;
  UPDATE public.hackathons SET name=result_row.name,description=result_row.description,website_url=result_row.website_url,
    college=result_row.college,start_date=result_row.start_date,end_date=result_row.end_date,registration_start=result_row.registration_start,
    registration_end=result_row.registration_end,registration_status=result_row.registration_status,min_team_size=result_row.min_team_size,
    max_team_size=result_row.max_team_size,mode=result_row.mode,location=result_row.location,prize_pool=result_row.prize_pool,currency=result_row.currency,
    rounds_info=result_row.rounds_info,rounds_count=result_row.rounds_count,tags=result_row.tags,source_metadata=metadata WHERE id=h.id;
  RETURN jsonb_build_object('status',CASE WHEN jsonb_array_length(locked)>0 THEN 'protected_fields' ELSE 'refreshed' END,'id',h.id);
END $$;
REVOKE ALL ON FUNCTION public.apply_hackathon_source_check(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_hackathon_source_check(uuid,jsonb,jsonb,jsonb,jsonb,uuid,text,text[]) TO service_role;
COMMENT ON COLUMN public.hackathons.source_metadata IS 'Server-owned factual source evidence, freshness and editorial protection. Not an approval or registration record.';
COMMIT;
