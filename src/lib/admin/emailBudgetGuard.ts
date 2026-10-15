import { SupabaseClient } from "@supabase/supabase-js";

export const RESEND_GLOBAL_DAILY_LIMIT = 100;
export const OUTREACH_DAILY_CAP = 60;
export const NUDGE_DAILY_CAP = 40;

export type DailyEmailStats = {
  date: string;
  outreach_sent: number;
  nudges_sent: number;
  total_sent: number;
  updated_at?: string;
  [key: string]: number | string | undefined;
};

export type BudgetCheckResult = {
  allowedCount: number;
  deferredCount: number;
  todayStats: DailyEmailStats;
  remainingBudget: {
    global: number;
    category: number;
  };
};

export async function getOrCreateTodayStats(
  supabaseAdmin: SupabaseClient
): Promise<DailyEmailStats> {
  const todayStr = new Date().toISOString().split("T")[0];

  const { data: existing, error: readError } = await supabaseAdmin
    .from("daily_email_stats")
    .select("*")
    .eq("date", todayStr)
    .maybeSingle();

  if (readError) {
    console.error("[Email Budget Guard] Cannot verify budget:", readError);
    throw new Error("Email budget unavailable; dispatch blocked.");
  }

  if (existing) {
    for (const key of ["total_sent", "outreach_sent", "nudges_sent"]) {
      if (!Number.isSafeInteger(existing[key]) || existing[key] < 0) throw new Error("Email budget contains invalid counters; dispatch blocked.");
    }
    return existing as DailyEmailStats;
  }

  const newRecord = {
    date: todayStr,
    outreach_sent: 0,
    nudges_sent: 0,
    total_sent: 0,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("daily_email_stats")
    .upsert(newRecord, { onConflict: "date", ignoreDuplicates: true });
  if (error) {
    console.error("[Email Budget Guard] Error initializing daily_email_stats:", error);
    throw new Error("Email budget unavailable; dispatch blocked.");
  }
  // Read the winner: never overwrite an existing row with zero counters.
  const { data, error: verifyError } = await supabaseAdmin.from("daily_email_stats")
    .select("*").eq("date", todayStr).single();
  if (verifyError || !data) {
    console.error("[Email Budget Guard] Cannot verify initialized budget:", verifyError);
    throw new Error("Email budget unavailable; dispatch blocked.");
  }
  return data as DailyEmailStats;
}

// Advisory check only. This does not reserve quota or serialize concurrent dispatches.
export async function checkEmailBudget(
  supabaseAdmin: SupabaseClient,
  category: "outreach" | "nudge",
  requestedCount: number
): Promise<BudgetCheckResult> {
  const stats = await getOrCreateTodayStats(supabaseAdmin);

  const globalRemaining = Math.max(0, RESEND_GLOBAL_DAILY_LIMIT - (stats.total_sent || 0));
  const categoryCap = category === "outreach" ? OUTREACH_DAILY_CAP : NUDGE_DAILY_CAP;
  const categorySent = category === "outreach" ? (stats.outreach_sent || 0) : (stats.nudges_sent || 0);
  const categoryRemaining = Math.max(0, categoryCap - categorySent);

  const allowedCount = Math.max(0, Math.min(requestedCount, categoryRemaining, globalRemaining));
  const deferredCount = requestedCount - allowedCount;

  console.log(`[Email Budget Guard] Category: ${category.toUpperCase()} | Requested: ${requestedCount} | Allowed: ${allowedCount} | Deferred: ${deferredCount} | Daily Total: ${stats.total_sent}/${RESEND_GLOBAL_DAILY_LIMIT}`);

  return {
    allowedCount,
    deferredCount,
    todayStats: stats,
    remainingBudget: {
      global: globalRemaining,
      category: categoryRemaining,
    },
  };
}

export type EmailCategory =
  | "outreach"
  | "nudge"
  | "notifications"
  | "organizer_broadcasts"
  | "admin_reports"
  | "contact_submissions"
  | "test_dispatches";

export async function recordEmailSendSuccess(
  supabaseAdmin: SupabaseClient,
  category: EmailCategory,
  actualSentCount: number = 1
) {
  if (actualSentCount <= 0) return { status: "recorded" as const };
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const stats = await getOrCreateTodayStats(supabaseAdmin);

    const updates: Record<string, number | string> = {
      updated_at: new Date().toISOString(),
    };

    switch (category) {
      case "outreach":
        updates.outreach_sent = (stats.outreach_sent || 0) + actualSentCount;
        break;
      case "nudge":
        updates.nudges_sent = (stats.nudges_sent || 0) + actualSentCount;
        break;
      case "notifications":
        updates.notifications_sent = (Number(stats.notifications_sent) || 0) + actualSentCount;
        break;
      case "organizer_broadcasts":
        updates.organizer_broadcasts_sent = (Number(stats.organizer_broadcasts_sent) || 0) + actualSentCount;
        break;
      case "admin_reports":
        updates.admin_reports_sent = (Number(stats.admin_reports_sent) || 0) + actualSentCount;
        break;
      case "contact_submissions":
        updates.contact_submissions_sent = (Number(stats.contact_submissions_sent) || 0) + actualSentCount;
        break;
      case "test_dispatches":
        updates.test_dispatches_sent = (Number(stats.test_dispatches_sent) || 0) + actualSentCount;
        break;
    }

    const newTotal = (stats.total_sent || 0) + actualSentCount;
    updates.total_sent = newTotal;

    const { data: recorded, error } = await supabaseAdmin
      .from("daily_email_stats")
      .update(updates)
      .eq("date", todayStr).eq("total_sent", stats.total_sent).select("date");

    if (error || recorded?.length !== 1) {
      console.error("[Email Budget Guard] Error recording provider acceptance:", error);
      return { status: "failed" as const };
    }
    return { status: "recorded" as const };
  } catch (error) {
    console.error("[Email Budget Guard] Acceptance accounting unavailable:", error);
    return { status: "failed" as const };
  }
}

export type EmailUsageSummary = {
  date: string;
  status: "partial" | "unavailable";
  note: string;
  total_sent: number | null;
  limit: number;
  usage_percent: number | null;
  is_resend_live: false;
  categories: Record<"outreach" | "test_dispatches" | "notifications" | "organizer_broadcasts" | "admin_reports" | "contact_submissions" | "onboarding_nudges", number | null>;
  remaining_global: number | null;
};

export async function getTodayEmailUsageSummary(supabaseAdmin: SupabaseClient): Promise<EmailUsageSummary> {
  const date = new Date().toISOString().split("T")[0];
  // Reporting is read-only. Legacy counters are partial evidence, not a complete provider ledger.
  let stats: Record<string, number> | null = null;
  try {
    const { data, error } = await supabaseAdmin.from("daily_email_stats").select("*").eq("date", date).maybeSingle();
    if (error) console.error("[Email Usage] Metrics unavailable:", error);
    else stats = data;
  } catch (error) { console.error("[Email Usage] Metrics unavailable:", error); }
  const value = (key: string) => stats && Number.isFinite(stats[key]) ? stats[key] : null;
  return {
    date, status: stats ? "partial" : "unavailable", is_resend_live: false,
    note: stats ? "Legacy counters are partial and may include historical mock outcomes. Complete provider usage and remaining quota are unverified."
      : "Email usage unavailable. No complete quota evidence is available.",
    total_sent: value("total_sent"), limit: RESEND_GLOBAL_DAILY_LIMIT,
    usage_percent: null, remaining_global: null,
    categories: { outreach: value("outreach_sent"), test_dispatches: value("test_dispatches_sent"),
      notifications: value("notifications_sent"), organizer_broadcasts: value("organizer_broadcasts_sent"),
      admin_reports: value("admin_reports_sent"), contact_submissions: value("contact_submissions_sent"), onboarding_nudges: value("nudges_sent") },
  };
}
