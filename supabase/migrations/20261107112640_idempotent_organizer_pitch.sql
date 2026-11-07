BEGIN;

-- Existing app_settings RLS/table privileges are unchanged. New claim metadata
-- adds hashes/UUIDs/outcomes; historical receipts are archived verbatim.
CREATE FUNCTION public.claim_organizer_pitch(
  p_intent_id uuid, p_lead_id uuid, p_recipient text, p_fingerprint text,
  p_mode text, p_repeat_of text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  l public.organizer_leads%ROWTYPE;
  j jsonb; prior jsonb; recipient_owner jsonb;
  recipient_hash text; recipient_key text; recipient_value text;
  intent_key text; lead_key text; latest text; expected_repeat text;
  historical boolean; recipient_exists boolean;
BEGIN
  IF p_intent_id IS NULL OR p_lead_id IS NULL OR p_recipient IS NULL
    OR p_recipient <> pg_catalog.lower(pg_catalog.btrim(p_recipient))
    OR pg_catalog.length(p_recipient) > 254
    OR p_recipient !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}$'
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_mode IS NULL OR p_mode NOT IN ('manual','scheduled','automatic')
    OR pg_catalog.length(p_repeat_of) > 100 THEN
    RAISE EXCEPTION 'Invalid organizer send intent' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261107,6);
  recipient_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_recipient,'UTF8')),'hex');
  recipient_key := 'cron:organizer-outreach:v1:recipient:' || recipient_hash;
  intent_key := 'organizer:pitch:v1:intent:' || p_intent_id::text;
  lead_key := 'organizer:pitch:v1:lead:' || p_lead_id::text;
  SELECT value::jsonb INTO j FROM public.app_settings WHERE key=intent_key FOR UPDATE;
  IF FOUND THEN
    IF j->>'lead_id' IS DISTINCT FROM p_lead_id::text OR j->>'recipient_hash' IS DISTINCT FROM recipient_hash
      OR j->>'fingerprint' IS DISTINCT FROM p_fingerprint OR j->>'mode' IS DISTINCT FROM p_mode THEN
      RETURN pg_catalog.jsonb_build_object('outcome','conflict','intent_id',p_intent_id);
    END IF;
    RETURN pg_catalog.jsonb_build_object('outcome','duplicate','intent_id',p_intent_id,'state',j->>'state');
  END IF;
  SELECT * INTO l FROM public.organizer_leads WHERE id=p_lead_id FOR UPDATE;
  IF NOT FOUND OR l.status IS NULL OR l.status NOT IN
    ('new','no_email','pitch_sent','opened','replied','negotiating','partner_live') THEN
    RETURN pg_catalog.jsonb_build_object('outcome','blocked','intent_id',p_intent_id);
  END IF;
  historical := l.pitch_sent_at IS NOT NULL OR NULLIF(pg_catalog.btrim(l.last_sent_to),'') IS NOT NULL
    OR l.status NOT IN ('new','no_email');
  IF p_mode <> 'manual' AND (l.status <> 'new' OR historical) THEN
    RETURN pg_catalog.jsonb_build_object('outcome','blocked','intent_id',p_intent_id);
  END IF;
  IF p_mode <> 'manual' AND pg_catalog.lower(pg_catalog.btrim(l.organizer_email)) IS DISTINCT FROM p_recipient THEN
    RETURN pg_catalog.jsonb_build_object('outcome','blocked','intent_id',p_intent_id);
  END IF;
  IF p_mode='scheduled' AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.regexp_split_to_table(COALESCE(l.notes,''),E'\\r?\\n') AS note
    WHERE pg_catalog.btrim(note)='[HACKERMATE_OUTREACH_APPROVED_V1]'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('outcome','blocked','intent_id',p_intent_id);
  END IF;

  SELECT value INTO latest FROM public.app_settings WHERE key=lead_key FOR UPDATE;
  SELECT value INTO recipient_value FROM public.app_settings WHERE key=recipient_key FOR UPDATE;
  recipient_exists := FOUND;
  IF latest IS NOT NULL THEN
    SELECT value::jsonb INTO prior FROM public.app_settings
      WHERE key='organizer:pitch:v1:intent:' || latest;
    IF prior->>'lead_id' IS DISTINCT FROM p_lead_id::text
      OR prior->>'state' IS DISTINCT FROM 'accepted'
      OR prior->>'crm' IS DISTINCT FROM 'recorded'
      OR prior->>'accounting' IS DISTINCT FROM 'recorded' THEN
      RETURN pg_catalog.jsonb_build_object('outcome','duplicate','intent_id',p_intent_id,
        'state',COALESCE(prior->>'state','unknown'));
    END IF;
    expected_repeat := latest;
  END IF;

  IF recipient_exists THEN
    recipient_owner := recipient_value::jsonb; -- Malformed legacy evidence fails closed.
    IF recipient_owner->>'lead_id' IS DISTINCT FROM p_lead_id::text THEN
      RETURN pg_catalog.jsonb_build_object('outcome','duplicate','intent_id',p_intent_id,'state','suppressed');
    END IF;
    IF recipient_owner ? 'intent_id' THEN
      SELECT value::jsonb INTO j FROM public.app_settings
        WHERE key='organizer:pitch:v1:intent:' || (recipient_owner->>'intent_id');
      IF latest IS NULL OR j->>'state' IS DISTINCT FROM 'accepted'
        OR j->>'crm' IS DISTINCT FROM 'recorded' OR j->>'accounting' IS DISTINCT FROM 'recorded' THEN
        RETURN pg_catalog.jsonb_build_object('outcome','duplicate','intent_id',p_intent_id,'state','unknown');
      END IF;
    ELSIF recipient_owner->>'status' IS DISTINCT FROM 'accepted'
      OR NULLIF(recipient_owner->>'provider_id','') IS NULL OR l.pitch_sent_at IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('outcome','duplicate','intent_id',p_intent_id,'state','unknown');
    END IF;
  END IF;

  -- Preserve suppression across alternate CRM rows, including last-recipient-only
  -- histories and uncertain/held statuses. A repeat approval is lead-scoped.
  IF EXISTS (
    SELECT 1 FROM public.organizer_leads other,
      LATERAL pg_catalog.regexp_split_to_table(COALESCE(other.organizer_email,'') || ',' ||
        COALESCE(other.last_sent_to,''),',') AS address
    WHERE other.id <> p_lead_id AND
      (other.status IS DISTINCT FROM 'new' OR other.pitch_sent_at IS NOT NULL OR
       NULLIF(pg_catalog.btrim(other.last_sent_to),'') IS NOT NULL)
      AND pg_catalog.lower(pg_catalog.btrim(address))=p_recipient
  ) THEN
    RETURN pg_catalog.jsonb_build_object('outcome','duplicate','intent_id',p_intent_id,'state','suppressed');
  END IF;

  IF latest IS NULL AND (historical OR recipient_exists) THEN
    expected_repeat := 'legacy:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.jsonb_build_array(l.id,l.status,l.pitch_sent_at,l.last_sent_to,recipient_value)::text,'UTF8')),'hex');
  END IF;
  IF expected_repeat IS NOT NULL THEN
    IF p_mode <> 'manual' OR p_repeat_of IS DISTINCT FROM expected_repeat THEN
      RETURN pg_catalog.jsonb_build_object('outcome','approval_required','intent_id',p_intent_id,
        'repeat_of',expected_repeat);
    END IF;
  ELSIF p_repeat_of IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('outcome','conflict','intent_id',p_intent_id);
  END IF;

  j := pg_catalog.jsonb_build_object('intent_id',p_intent_id,'lead_id',p_lead_id,
    'recipient_hash',recipient_hash,'fingerprint',p_fingerprint,'mode',p_mode,
    'lead_status',l.status,'state','claimed','crm','pending','accounting','pending',
    'predecessor',expected_repeat,
    -- Archive the exact old receipt before replacing its recipient pointer.
    -- In particular, its provider_id must not be lost behind a history hash.
    'legacy_claim',CASE WHEN recipient_exists AND NOT (recipient_owner ? 'intent_id') THEN recipient_value END,
    'created_at',pg_catalog.clock_timestamp());
  recipient_owner := pg_catalog.jsonb_build_object('intent_id',p_intent_id,'lead_id',p_lead_id,'status','claimed');
  IF recipient_exists THEN
    UPDATE public.app_settings SET value=recipient_owner::text
      WHERE key=recipient_key AND value=recipient_value;
    IF NOT FOUND THEN RAISE EXCEPTION 'Claim changed' USING ERRCODE='40001'; END IF;
  ELSE
    INSERT INTO public.app_settings(key,value) VALUES(recipient_key,recipient_owner::text) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('outcome','duplicate','intent_id',p_intent_id,'state','unknown');
    END IF;
  END IF;
  INSERT INTO public.app_settings(key,value) VALUES(intent_key,j::text);
  INSERT INTO public.app_settings(key,value) VALUES(lead_key,p_intent_id::text)
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
  RETURN pg_catalog.jsonb_build_object('outcome','claimed','intent_id',p_intent_id,'fingerprint',p_fingerprint);
END;
$$;

CREATE FUNCTION public.record_organizer_pitch(
  p_intent_id uuid, p_event text, p_recipient text DEFAULT NULL, p_provider_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE j jsonb; k text; recipient_key text; changed uuid; crm text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(20261107,6);
  k := 'organizer:pitch:v1:intent:' || p_intent_id::text;
  SELECT value::jsonb INTO j FROM public.app_settings WHERE key=k FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intent unavailable' USING ERRCODE='22023'; END IF;
  IF p_event='dispatching' AND j->>'state'='claimed' THEN
    j := j || pg_catalog.jsonb_build_object('state','dispatching');
  ELSIF p_event IN ('accounting_recorded','accounting_failed') AND j->>'state' IN ('accepted','sandbox_accepted')
    AND j->>'accounting'='pending' THEN
    j := j || pg_catalog.jsonb_build_object('accounting',CASE WHEN p_event='accounting_recorded' THEN 'recorded' ELSE 'failed' END);
  ELSIF p_event IN ('accepted','sandbox_accepted','rejected','unknown','not_dispatched') AND j->>'state'='dispatching' THEN
    IF p_recipient IS NULL OR j->>'recipient_hash' IS DISTINCT FROM
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_recipient,'UTF8')),'hex')
      OR (p_event IN ('accepted','sandbox_accepted') AND (p_provider_id IS NULL OR pg_catalog.length(p_provider_id) NOT BETWEEN 1 AND 256)) THEN
      RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023';
    END IF;
    crm := 'not_required';
    IF p_event IN ('accepted','unknown') THEN
      UPDATE public.organizer_leads SET
        status=CASE WHEN p_event='unknown' THEN 'email_outcome_unknown'
          WHEN status IN ('opened','replied','negotiating','partner_live') THEN status ELSE 'pitch_sent' END,
        pitch_sent_at=CASE WHEN p_event='accepted' THEN COALESCE(pitch_sent_at,pg_catalog.clock_timestamp()) ELSE pitch_sent_at END,
        last_sent_to=CASE WHEN p_event='accepted' AND NULLIF(pg_catalog.btrim(last_sent_to),'') IS NULL THEN p_recipient ELSE last_sent_to END,
        updated_at=pg_catalog.clock_timestamp()
      WHERE id=(j->>'lead_id')::uuid AND status IS NOT DISTINCT FROM j->>'lead_status'
      RETURNING id INTO changed;
      crm := CASE WHEN FOUND THEN 'recorded' ELSE 'failed' END;
    END IF;
    j := j || pg_catalog.jsonb_build_object('state',p_event,'provider_id',p_provider_id,'crm',crm,
      'accounting',CASE WHEN p_event IN ('accepted','sandbox_accepted') THEN 'pending' ELSE 'not_required' END);
    recipient_key := 'cron:organizer-outreach:v1:recipient:' || (j->>'recipient_hash');
    UPDATE public.app_settings SET value=pg_catalog.jsonb_build_object('intent_id',p_intent_id,
      'lead_id',j->>'lead_id','status',p_event,'provider_id',p_provider_id)::text
      WHERE key=recipient_key AND value::jsonb->>'intent_id'=p_intent_id::text;
    IF NOT FOUND THEN RAISE EXCEPTION 'Claim ownership unavailable' USING ERRCODE='40001'; END IF;
  ELSE
    RAISE EXCEPTION 'Invalid intent transition' USING ERRCODE='22023';
  END IF;
  UPDATE public.app_settings SET value=(j || pg_catalog.jsonb_build_object('updated_at',pg_catalog.clock_timestamp()))::text WHERE key=k;
  RETURN pg_catalog.jsonb_build_object('intent_id',p_intent_id,'state',j->>'state','crm',j->>'crm','accounting',j->>'accounting');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_organizer_pitch(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_organizer_pitch(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_organizer_pitch(uuid,uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_organizer_pitch(uuid,text,text,text) TO service_role;

COMMIT;
