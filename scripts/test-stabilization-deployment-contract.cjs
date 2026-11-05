/* eslint-disable @typescript-eslint/no-require-imports -- Disposable localhost SQL and captured synthetic trigger requests only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createFixture } = require('./hustle-phase2-local-db.cjs');
const ROOT = path.resolve(__dirname, '..');

test('release preflight detects privilege failures; actual tracked trigger emits the canonical UUID contract', async () => {
  const db = await createFixture();
  let checks = 0;
  const check = (condition, label) => { assert(condition, label); checks++; };
  try {
    const original = fs.readFileSync(path.join(ROOT, 'supabase/migrations/202607080005_offline_email_notifications.sql'), 'utf8');
    const ddl = original.match(/CREATE TABLE IF NOT EXISTS public\.app_settings \([\s\S]*?\);/)?.[0];
    assert(ddl);
    db.sql(ddl + `
      ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,INSERT,UPDATE,DELETE ON app_settings TO service_role;
      ALTER TABLE profiles ADD COLUMN email text, ADD COLUMN full_name text, ADD COLUMN last_seen_at timestamptz;
      GRANT SELECT(id,email,full_name,is_banned) ON profiles TO service_role;
      UPDATE profiles SET email='synthetic@example.invalid', full_name='Fixture', last_seen_at=NULL;
      CREATE TABLE notifications(id uuid PRIMARY KEY, user_id uuid, message text, link text);
      GRANT SELECT ON notifications TO service_role;
      CREATE TABLE app_secrets(key text PRIMARY KEY, value text NOT NULL);
      INSERT INTO app_secrets VALUES('webhook_secret','synthetic-never-live');
      INSERT INTO app_settings VALUES('site_url','https://fixture.invalid');
      CREATE SCHEMA net;
      CREATE TABLE fixture_webhook_requests(url text, headers jsonb, body jsonb);
      CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb) RETURNS bigint LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO fixture_webhook_requests VALUES(url,headers,body); RETURN 1; END $$;
    `);
    const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/202608030002_re_enable_offline_email_notifications.sql'), 'utf8');
    const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.handle_notification_insert_webhook()');
    assert(start > 0, 'Load only actual producer function/trigger, never historical credential seeds');
    db.sql(migration.slice(start));
    const preflight = fs.readFileSync(path.join(ROOT, 'scripts/notification-release-preflight.sql'), 'utf8');
    const probe = () => JSON.parse(db.sql(preflight).split(/\r?\n/).find(line => line.startsWith('{')));
    const positive = probe();
    for (const [name, value] of Object.entries(positive)) check(value === (name !== 'pg_net_installed'), name + ': native stub deliberately has no pg_net extension');
    db.sql('REVOKE INSERT,UPDATE,DELETE ON app_settings FROM service_role;');
    const denied = probe();
    check(denied.app_settings_read_insert === false, 'INSERT privilege dependency detected');
    check(denied.app_settings_update_value === false, 'UPDATE privilege dependency detected');
    check(denied.app_settings_delete === false, 'DELETE privilege dependency detected');
    db.sql(`INSERT INTO notifications VALUES('00000000-0000-4000-8000-000000000071',
      '00000000-0000-4000-8000-000000000002','Synthetic team invitation','/invites');`);
    const captured = JSON.parse(db.sql('SELECT row_to_json(r) FROM fixture_webhook_requests r;'));
    check(captured.body.notificationId === '00000000-0000-4000-8000-000000000071', 'actual producer emits notification UUID');
    check(captured.body.recipientId === '00000000-0000-4000-8000-000000000002', 'actual producer emits recipient UUID');
    check(captured.body.message === 'Synthetic team invitation' && captured.body.link === '/invites', 'canonical producer content');
    check(captured.url === 'https://fixture.invalid/api/webhooks/notification', 'existing endpoint path');
    check(captured.headers.Authorization === 'Bearer synthetic-never-live', 'synthetic producer/server bearer contract');
    console.log(`Native PostgreSQL: ${checks} deployment/producer assertions passed; no network-capable pg_net installed.`);
  } finally { await db.close(); }
});
