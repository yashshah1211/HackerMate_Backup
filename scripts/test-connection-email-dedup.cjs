/* eslint-disable @typescript-eslint/no-require-imports -- Node source-contract regression checks. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("one connection-request RPC creates an in-app notification, without a second email dispatch", () => {
  const source = read("src/app/profile/[id]/useProfileData.ts");
  const action = source.split("const sendConnectionRequest = useCallback(")[1]?.split("const acceptConnection = useCallback(")[0];
  assert.ok(action, "connection-request action must exist");
  assert.match(action, /\.rpc\("send_connection_request"/);
  assert.doesNotMatch(action, /\/api\/send-email|fetch\s*\(/, "connection-request action must not send another email");
  const migration = read("supabase/migrations/202608010001_add_connection_request_message.sql");
  assert.match(migration, /INSERT INTO public\.notifications/);
  assert.match(migration, /'\/connections'/);
});

test("the offline notification webhook remains responsible for connection-request mail", () => {
  const migration = read("supabase/migrations/202608030002_re_enable_offline_email_notifications.sql");
  assert.match(migration, /CREATE TRIGGER trg_notification_insert_webhook/);
  assert.match(migration, /AFTER INSERT ON public\.notifications/);
  assert.match(migration, /'notificationId', NEW\.id/);
  const webhook = read("src/app/api/webhooks/notification/route.ts");
  assert.match(webhook, /lowerLink\.includes\("\/connections"\)/);
  assert.match(webhook, /dispatchEmail\(/);
});
