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

  const { data: existing } = await supabaseAdmin
    .from("daily_email_stats")
    .select("*")
    .eq("date", todayStr)
    .maybeSingle();

  if (existing) {
    return existing as DailyEmailStats;
  }

  const newRecord = {
    date: todayStr,
    outreach_sent: 0,
    nudges_sent: 0,
    total_sent: 0,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await supabaseAdmin
    .from("daily_email_stats")
    .upsert(newRecord, { onConflict: "date" })
    .select()
    .single();

  if (error || !inserted) {
    console.error("[Email Budget Guard] Error initializing daily_email_stats:", error);
    return newRecord;
  }

  return inserted as DailyEmailStats;
}

export async function checkAndReserveEmailBudget(
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

export async function recordEmailSendSuccess(
  supabaseAdmin: SupabaseClient,
  category: "outreach" | "nudge",
  actualSentCount: number
) {
  if (actualSentCount <= 0) return;

  const todayStr = new Date().toISOString().split("T")[0];
  const stats = await getOrCreateTodayStats(supabaseAdmin);

  const newOutreach = stats.outreach_sent + (category === "outreach" ? actualSentCount : 0);
  const newNudges = stats.nudges_sent + (category === "nudge" ? actualSentCount : 0);
  const newTotal = stats.total_sent + actualSentCount;

  const { error } = await supabaseAdmin
    .from("daily_email_stats")
    .update({
      outreach_sent: newOutreach,
      nudges_sent: newNudges,
      total_sent: newTotal,
      updated_at: new Date().toISOString(),
    })
    .eq("date", todayStr);

  if (error) {
    console.error("[Email Budget Guard] Error recording email send success:", error);
  }
}
