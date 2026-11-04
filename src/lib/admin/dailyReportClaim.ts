import type { SupabaseClient } from "@supabase/supabase-js";

// A permanent fail-closed scheduled admin report claim. app_settings.key is a
// PostgreSQL primary key, so concurrent inserts cannot both authorize email.
export function indiaReportDate(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return values.year + "-" + values.month + "-" + values.day;
}

export async function claimScheduledDatabaseReport(
  client: Pick<SupabaseClient, "from">,
  at = new Date(),
): Promise<{ status: "reserved" | "duplicate" | "unavailable"; key: string }> {
  const key = "cron:database-activity-report:" + indiaReportDate(at);
  const { error } = await client.from("app_settings").insert({
    key,
    value: JSON.stringify({ status: "reserved", at: at.toISOString() }),
  });
  if (!error) return { status: "reserved", key };
  if (error.code === "23505") return { status: "duplicate", key };
  return { status: "unavailable", key };
}

export async function recordScheduledDatabaseReportOutcome(
  client: Pick<SupabaseClient, "from">,
  key: string,
  dispatchStatus: string,
  at = new Date(),
): Promise<boolean> {
  const { error } = await client.from("app_settings")
    .update({ value: JSON.stringify({ status: dispatchStatus, recorded_at: at.toISOString() }) })
    .eq("key", key);
  return !error;
}
