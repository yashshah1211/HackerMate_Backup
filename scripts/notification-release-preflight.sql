-- Read-only deployment evidence. No secrets, profile rows or setting values returned.
-- Run only in an authorized SQL session; every boolean must be true for release.
BEGIN READ ONLY;
WITH relations AS (
  SELECT to_regclass('public.app_settings') AS settings,
    to_regclass('public.notifications') AS notifications,
    to_regclass('public.profiles') AS profiles
), webhook AS (
  SELECT p.* FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.handle_notification_insert_webhook()')
)
SELECT jsonb_build_object(
  'service_role_bypasses_rls', coalesce((SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'), false),
  'service_role_public_usage', has_schema_privilege('service_role', 'public', 'USAGE'),
  'app_settings_exists', settings IS NOT NULL,
  'app_settings_rls_enabled', coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = settings), false),
  'app_settings_key_primary_key', EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'key'
    WHERE c.conrelid = settings AND c.contype = 'p' AND c.conkey = ARRAY[a.attnum]
  ),
  'app_settings_read_insert', (
    SELECT count(*) = 2 AND coalesce(bool_and(
      has_column_privilege('service_role', settings, a.attnum, 'SELECT') AND
      has_column_privilege('service_role', settings, a.attnum, 'INSERT')), false)
    FROM pg_attribute a WHERE a.attrelid = settings AND a.attname IN ('key', 'value') AND NOT a.attisdropped
  ),
  'app_settings_update_value', coalesce((SELECT has_column_privilege('service_role', settings, a.attnum, 'UPDATE')
    FROM pg_attribute a WHERE a.attrelid = settings AND a.attname = 'value' AND NOT a.attisdropped), false),
  'app_settings_delete', coalesce(has_table_privilege('service_role', settings, 'DELETE'), false),
  'notification_read', (
    SELECT count(*) = 4 AND coalesce(bool_and(has_column_privilege('service_role', notifications, a.attnum, 'SELECT')), false)
    FROM pg_attribute a WHERE a.attrelid = notifications AND a.attname IN ('id', 'user_id', 'message', 'link') AND NOT a.attisdropped
  ),
  'profile_read', (
    SELECT count(*) = 4 AND coalesce(bool_and(has_column_privilege('service_role', profiles, a.attnum, 'SELECT')), false)
    FROM pg_attribute a WHERE a.attrelid = profiles AND a.attname IN ('id', 'full_name', 'email', 'is_banned') AND NOT a.attisdropped
  ),
  'notification_ids_are_uuid', (
    SELECT count(*) = 2 FROM pg_attribute a WHERE a.attrelid = notifications
    AND a.attname IN ('id', 'user_id') AND a.atttypid = 'uuid'::regtype AND NOT a.attisdropped
  ),
  'notification_after_insert_trigger', EXISTS (
    SELECT 1 FROM pg_trigger t WHERE t.tgrelid = notifications
    AND t.tgfoid = to_regprocedure('public.handle_notification_insert_webhook()')
    AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A') AND t.tgtype = 5
  ),
  'trigger_security_definer', coalesce((SELECT prosecdef FROM webhook), false),
  'trigger_payload_notification_id', coalesce((SELECT lower(prosrc) ~ '''notificationid''\s*,\s*new\.id' FROM webhook), false),
  'trigger_payload_recipient_id', coalesce((SELECT lower(prosrc) ~ '''recipientid''\s*,\s*new\.user_id' FROM webhook), false),
  'trigger_uses_pg_net', coalesce((SELECT lower(prosrc) ~ 'net\.http_post\s*\(' FROM webhook), false),
  'trigger_uses_app_secrets', coalesce((SELECT lower(prosrc) ~ 'public\.app_secrets' FROM webhook), false),
  'pg_net_installed', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
) AS release_checks FROM relations;
ROLLBACK;
