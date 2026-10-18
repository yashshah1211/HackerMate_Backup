-- Source only. Do not apply to any connected database without release approval.
-- Permission sweep documented in docs/hustle-phase2-pr-a.md. Existing ACLs unchanged.
BEGIN;
CREATE TABLE public.hustle_phase2_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL DEFAULT '0da43cba-90dc-449c-a126-a2fc8be8a379' REFERENCES public.hackathons(id),
  source_digest text NOT NULL UNIQUE CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  imported_by uuid NOT NULL REFERENCES auth.users(id),
  imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 500),
  activated_at timestamptz,
  CHECK (event_id = '0da43cba-90dc-449c-a126-a2fc8be8a379')
);
CREATE TABLE public.hustle_phase2_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL DEFAULT '0da43cba-90dc-449c-a126-a2fc8be8a379' REFERENCES public.hackathons(id),
  batch_id uuid NOT NULL REFERENCES public.hustle_phase2_batches(id),
  external_team_id text NOT NULL CHECK (external_team_id ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  team_name text NOT NULL CHECK (length(team_name) BETWEEN 1 AND 120),
  leader_name text NOT NULL CHECK (length(leader_name) BETWEEN 1 AND 120),
  leader_email text NOT NULL CHECK (length(leader_email) <= 254 AND leader_email = lower(btrim(leader_email)) AND leader_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  leader_whatsapp text CHECK (leader_whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  second_member_name text CHECK (length(second_member_name) BETWEEN 1 AND 120 AND lower(second_member_name) <> lower(leader_name)),
  decision text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','confirmed','declined')),
  decided_at timestamptz,
  CHECK ((decision = 'pending') = (decided_at IS NULL)),
  CHECK (event_id = '0da43cba-90dc-449c-a126-a2fc8be8a379'),
  UNIQUE(event_id, external_team_id), UNIQUE(event_id, leader_email), UNIQUE(event_id, leader_whatsapp)
);
CREATE INDEX hustle_phase2_teams_batch_idx ON public.hustle_phase2_teams(batch_id);
CREATE TABLE public.hustle_phase2_invites (
  team_id uuid PRIMARY KEY REFERENCES public.hustle_phase2_teams(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL DEFAULT '2026-10-23T23:00:00+05:30' CHECK (expires_at <= '2026-10-23T23:00:00+05:30'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz
);
CREATE TABLE public.hustle_phase2_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES auth.users(id),
  team_id uuid REFERENCES public.hustle_phase2_teams(id), batch_id uuid REFERENCES public.hustle_phase2_batches(id),
  action text NOT NULL CHECK (action IN ('import','activate','invite','revoke','confirmed','declined')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.hustle_phase2_limits (
  key text PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 80),
  bucket timestamptz NOT NULL, hits integer NOT NULL CHECK(hits > 0)
);
ALTER TABLE public.hustle_phase2_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hustle_phase2_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hustle_phase2_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hustle_phase2_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hustle_phase2_limits ENABLE ROW LEVEL SECURITY;
-- Intentionally no browser-role policies: all raw access is denied, including admins.
REVOKE ALL ON public.hustle_phase2_batches, public.hustle_phase2_teams, public.hustle_phase2_invites, public.hustle_phase2_audit, public.hustle_phase2_limits FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.hustle_phase2_batches, public.hustle_phase2_teams, public.hustle_phase2_invites TO service_role;
GRANT SELECT, INSERT ON public.hustle_phase2_audit TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hustle_phase2_limits TO service_role;

-- Admin identity is supplied only by the verified backend. Browser roles cannot
-- execute this helper or the mutation functions, including with a forged actor.
-- Narrow definer boundary: service_role cannot read auth.users in production.
-- Returns only a boolean; fully qualified relations and an empty search path.
-- The trusted migration owner must retain access to the protected identity rows.
CREATE FUNCTION public.hustle_phase2_authorized(p_actor uuid, p_write boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_write IS TRUE AND EXISTS (SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.id = p_actor AND p.is_banned IS FALSE AND u.email IS NOT NULL AND u.email <> ''
    AND (p.role = 'admin' OR lower(btrim(u.email)) = 'yashshah7117@gmail.com'));
$$;
CREATE FUNCTION public.hustle_phase2_window(p_now timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT CASE WHEN p_now < '2026-10-23T10:00:00+05:30'::timestamptz THEN 'before'
 WHEN p_now < '2026-10-23T23:00:00+05:30'::timestamptz THEN 'open' ELSE 'closed' END;
$$;
CREATE FUNCTION public.hustle_phase2_import(p_actor uuid, p_digest text, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_batch uuid; v_count integer;
BEGIN
 IF NOT public.hustle_phase2_authorized(p_actor, true) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 -- Serialize capacity checks/imports; unique constraints still enforce conflicts.
 PERFORM pg_advisory_xact_lock(20261023, 1);
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Rows required'; END IF;
 v_count := jsonb_array_length(p_rows);
 IF v_count NOT BETWEEN 1 AND 500 OR (SELECT count(*) FROM public.hustle_phase2_teams) + v_count > 500 THEN RAISE EXCEPTION 'Invalid batch size'; END IF;
 INSERT INTO public.hustle_phase2_batches(source_digest, imported_by, row_count) VALUES(p_digest,p_actor,v_count) RETURNING id INTO v_batch;
 INSERT INTO public.hustle_phase2_teams(batch_id,external_team_id,team_name,leader_name,leader_email,leader_whatsapp,second_member_name)
 SELECT v_batch, r.external_team_id,r.team_name,r.leader_name,r.leader_email,r.leader_whatsapp,r.second_member_name
 FROM jsonb_to_recordset(p_rows) AS r(external_team_id text,team_name text,leader_name text,leader_email text,leader_whatsapp text,second_member_name text);
 INSERT INTO public.hustle_phase2_audit(actor_id,batch_id,action) VALUES(p_actor,v_batch,'import');
 RETURN jsonb_build_object('batchId',v_batch,'imported',v_count,'active',false);
END; $$;
CREATE FUNCTION public.hustle_phase2_activate(p_actor uuid, p_batch uuid, p_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_batch public.hustle_phase2_batches%ROWTYPE;
BEGIN
 IF NOT public.hustle_phase2_authorized(p_actor,true) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_batch FROM public.hustle_phase2_batches WHERE id=p_batch AND source_digest=p_digest FOR UPDATE;
 IF NOT FOUND OR v_batch.row_count <> (SELECT count(*) FROM public.hustle_phase2_teams WHERE batch_id=p_batch) THEN RAISE EXCEPTION 'Batch not ready'; END IF;
 IF public.hustle_phase2_window(clock_timestamp())='closed' THEN RAISE EXCEPTION 'Registration closed'; END IF;
 IF v_batch.activated_at IS NULL THEN
  UPDATE public.hustle_phase2_batches SET activated_at=clock_timestamp() WHERE id=p_batch;
  INSERT INTO public.hustle_phase2_audit(actor_id,batch_id,action) VALUES(p_actor,p_batch,'activate');
 END IF;
 RETURN jsonb_build_object('active',true);
END; $$;
CREATE FUNCTION public.hustle_phase2_invite(p_actor uuid, p_team uuid, p_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_team public.hustle_phase2_teams%ROWTYPE;
BEGIN
 IF NOT public.hustle_phase2_authorized(p_actor,true) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_team FROM public.hustle_phase2_teams WHERE id=p_team FOR UPDATE;
 IF NOT FOUND OR v_team.decision <> 'pending' OR public.hustle_phase2_window(clock_timestamp())='closed'
 OR NOT EXISTS(SELECT 1 FROM public.hustle_phase2_batches WHERE id=v_team.batch_id AND activated_at IS NOT NULL) THEN RAISE EXCEPTION 'Team not eligible'; END IF;
 INSERT INTO public.hustle_phase2_invites(team_id,token_hash) VALUES(p_team,p_hash)
 ON CONFLICT(team_id) DO UPDATE SET token_hash=excluded.token_hash,revoked_at=NULL,created_at=clock_timestamp()
 WHERE public.hustle_phase2_invites.revoked_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Revoke the existing invitation before replacing it'; END IF;
 INSERT INTO public.hustle_phase2_audit(actor_id,team_id,action) VALUES(p_actor,p_team,'invite');
 RETURN true;
END; $$;
CREATE FUNCTION public.hustle_phase2_revoke(p_actor uuid, p_team uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NOT public.hustle_phase2_authorized(p_actor,true) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 -- Always lock team before invite, matching response/issue order.
 PERFORM id FROM public.hustle_phase2_teams WHERE id=p_team FOR UPDATE;
 UPDATE public.hustle_phase2_invites SET revoked_at=clock_timestamp() WHERE team_id=p_team AND revoked_at IS NULL;
 IF FOUND THEN INSERT INTO public.hustle_phase2_audit(actor_id,team_id,action) VALUES(p_actor,p_team,'revoke'); END IF;
 RETURN true;
END; $$;
CREATE FUNCTION public.hustle_phase2_inspect(p_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT jsonb_build_object('team_name',t.team_name,'leader_name',t.leader_name,'second_member_name',t.second_member_name,'decision',t.decision,'window',public.hustle_phase2_window(clock_timestamp()))
 FROM public.hustle_phase2_invites i JOIN public.hustle_phase2_teams t ON t.id=i.team_id
 JOIN public.hustle_phase2_batches b ON b.id=t.batch_id
 WHERE i.token_hash=p_hash AND i.revoked_at IS NULL AND i.expires_at > clock_timestamp()
 AND b.activated_at IS NOT NULL AND t.event_id='0da43cba-90dc-449c-a126-a2fc8be8a379';
$$;
CREATE FUNCTION public.hustle_phase2_respond(p_hash text, p_decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_team public.hustle_phase2_teams%ROWTYPE; v_invite public.hustle_phase2_invites%ROWTYPE; v_now timestamptz;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('confirmed','declined') THEN RETURN jsonb_build_object('status','invalid'); END IF;
 SELECT t.* INTO v_team FROM public.hustle_phase2_teams t JOIN public.hustle_phase2_invites i ON i.team_id=t.id WHERE i.token_hash=p_hash FOR UPDATE OF t;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;
 SELECT * INTO v_invite FROM public.hustle_phase2_invites WHERE team_id=v_team.id AND token_hash=p_hash FOR UPDATE;
 v_now := clock_timestamp(); -- authoritative time AFTER waiting for locks
 IF NOT FOUND OR v_invite.revoked_at IS NOT NULL OR v_invite.expires_at <= v_now
 OR NOT EXISTS(SELECT 1 FROM public.hustle_phase2_batches WHERE id=v_team.batch_id AND activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('status','invalid'); END IF;
 IF public.hustle_phase2_window(v_now) <> 'open' THEN RETURN jsonb_build_object('status','closed'); END IF;
 IF v_team.decision <> 'pending' THEN
  RETURN jsonb_build_object('status',CASE WHEN v_team.decision=p_decision THEN 'ok' ELSE 'conflict' END,'decision',v_team.decision);
 END IF;
 UPDATE public.hustle_phase2_teams SET decision=p_decision,decided_at=v_now WHERE id=v_team.id;
 INSERT INTO public.hustle_phase2_audit(team_id,action) VALUES(v_team.id,p_decision);
 RETURN jsonb_build_object('status','ok','decision',p_decision);
END; $$;
-- Intentional narrow SECURITY DEFINER projection: raw tables remain inaccessible.
-- Authority is auth.uid() + the existing exact-event predicate on EVERY call.
-- No caller-provided actor/event parameter, search_path empty, explicit projection.
CREATE FUNCTION public.hustle_phase2_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_access_partner_event('0da43cba-90dc-449c-a126-a2fc8be8a379') THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'counts',(SELECT jsonb_build_object('shortlisted',count(*),'confirmed',count(*) FILTER(WHERE decision='confirmed'),'declined',count(*) FILTER(WHERE decision='declined'),'pending',count(*) FILTER(WHERE decision='pending')) FROM public.hustle_phase2_teams),
 'teams',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'external_team_id',t.external_team_id,'team_name',t.team_name,'leader_name',t.leader_name,'leader_email',t.leader_email,'leader_whatsapp',t.leader_whatsapp,'second_member_name',t.second_member_name,'batch_id',t.batch_id,'decision',t.decision,'decided_at',t.decided_at,'invite_status',CASE WHEN i.team_id IS NULL THEN 'not_created' WHEN i.revoked_at IS NOT NULL THEN 'revoked' ELSE 'ready' END) ORDER BY t.external_team_id) FROM public.hustle_phase2_teams t LEFT JOIN public.hustle_phase2_invites i ON i.team_id=t.id),'[]'::jsonb),
 'batches',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'source_digest',source_digest,'row_count',row_count,'activated_at',activated_at) ORDER BY imported_at) FROM public.hustle_phase2_batches),'[]'::jsonb));
END; $$;
CREATE FUNCTION public.hustle_phase2_limit(p_key text, p_max integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_hits integer; v_bucket timestamptz := date_trunc('minute',clock_timestamp());
BEGIN
 IF p_max NOT BETWEEN 1 AND 300 THEN RETURN false; END IF;
 DELETE FROM public.hustle_phase2_limits WHERE bucket < v_bucket - interval '2 minutes';
 INSERT INTO public.hustle_phase2_limits(key,bucket,hits) VALUES(p_key,v_bucket,1)
 ON CONFLICT(key) DO UPDATE SET bucket=excluded.bucket,hits=CASE WHEN public.hustle_phase2_limits.bucket=excluded.bucket THEN public.hustle_phase2_limits.hits+1 ELSE 1 END
 RETURNING hits INTO v_hits;
 RETURN v_hits <= p_max;
END; $$;

REVOKE ALL ON FUNCTION public.hustle_phase2_authorized(uuid,boolean), public.hustle_phase2_window(timestamptz), public.hustle_phase2_import(uuid,text,jsonb), public.hustle_phase2_activate(uuid,uuid,text), public.hustle_phase2_invite(uuid,uuid,text), public.hustle_phase2_revoke(uuid,uuid), public.hustle_phase2_inspect(text), public.hustle_phase2_respond(text,text), public.hustle_phase2_snapshot(), public.hustle_phase2_limit(text,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hustle_phase2_authorized(uuid,boolean), public.hustle_phase2_window(timestamptz), public.hustle_phase2_import(uuid,text,jsonb), public.hustle_phase2_activate(uuid,uuid,text), public.hustle_phase2_invite(uuid,uuid,text), public.hustle_phase2_revoke(uuid,uuid), public.hustle_phase2_inspect(text), public.hustle_phase2_respond(text,text), public.hustle_phase2_limit(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.hustle_phase2_snapshot() TO authenticated;
COMMIT;
