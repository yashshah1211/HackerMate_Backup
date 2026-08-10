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

export type EmailCategory =
  | "outreach"
  | "nudge"
  | "sih_broadcast"
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
  if (actualSentCount <= 0) return;

  const todayStr = new Date().toISOString().split("T")[0];
  const stats = (await getOrCreateTodayStats(supabaseAdmin)) as any;

  const updates: Record<string, any> = {
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
      updates.notifications_sent = (stats.notifications_sent || 0) + actualSentCount;
      break;
    case "organizer_broadcasts":
      updates.organizer_broadcasts_sent = (stats.organizer_broadcasts_sent || 0) + actualSentCount;
      break;
    case "admin_reports":
      updates.admin_reports_sent = (stats.admin_reports_sent || 0) + actualSentCount;
      break;
    case "contact_submissions":
      updates.contact_submissions_sent = (stats.contact_submissions_sent || 0) + actualSentCount;
      break;
    case "test_dispatches":
      updates.test_dispatches_sent = (stats.test_dispatches_sent || 0) + actualSentCount;
      break;
    case "sih_broadcast":
      break;
  }

  const newTotal = (stats.total_sent || 0) + actualSentCount;
  updates.total_sent = newTotal;

  const { error } = await supabaseAdmin
    .from("daily_email_stats")
    .update(updates)
    .eq("date", todayStr);

  if (error) {
    console.error("[Email Budget Guard] Error recording email send success:", error);
  }
}

export type EmailUsageSummary = {
  date: string;
  total_sent: number;
  limit: number;
  usage_percent: number;
  is_resend_live?: boolean;
  categories: {
    sih_broadcast: number;
    outreach: number;
    test_dispatches: number;
    notifications: number;
    organizer_broadcasts: number;
    admin_reports: number;
    contact_submissions: number;
    onboarding_nudges: number;
  };
  remaining_global: number;
};

export async function getTodayEmailUsageSummary(
  supabaseAdmin: SupabaseClient
): Promise<EmailUsageSummary> {
  const todayStr = new Date().toISOString().split("T")[0]; // UTC Midnight Boundary (matches Resend 00:00 UTC reset)
  const todayStart = `${todayStr}T00:00:00Z`;

  let liveResendCount: number | null = null;
  let isResendLive = false;

  // Try live fetch from Resend API if API key is present
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "User-Agent": "HackerMate/1.0",
        },
      });
      if (res.ok) {
        const resData = await res.json();
        if (Array.isArray(resData?.data)) {
          const todayEmails = resData.data.filter(
            (e: any) => e.created_at && new Date(e.created_at) >= new Date(todayStart)
          );
          liveResendCount = todayEmails.length;
          isResendLive = true;
        }
      }
    } catch (err) {
      console.warn("[Email Budget Guard] Live Resend API fetch fallback to DB:", err);
    }
  }

  const stats = (await getOrCreateTodayStats(supabaseAdmin)) as any;

  // 1. SIH Broadcast (Query actual timestamps on profiles for live precision)
  const { count: sihCount } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gte("sih_broadcast_sent_at", todayStart);

  // 2. Outreach Pitches (Query actual timestamps on organizer_leads for live precision)
  const { count: outreachCount } = await supabaseAdmin
    .from("organizer_leads")
    .select("id", { count: "exact", head: true })
    .gte("pitch_sent_at", todayStart);

  const sih = sihCount || 0;
  const outreach = outreachCount || 0;
  const testDispatches = stats.test_dispatches_sent || 0;
  const notifications = stats.notifications_sent || 0;
  const organizerBroadcasts = stats.organizer_broadcasts_sent || 0;
  const adminReports = stats.admin_reports_sent || 0;
  const contactSubmissions = stats.contact_submissions_sent || 0;
  const onboardingNudges = stats.nudges_sent || 0;

  // Sum of all tracked category counts
  const sumCategories =
    sih +
    outreach +
    testDispatches +
    notifications +
    organizerBroadcasts +
    adminReports +
    contactSubmissions +
    onboardingNudges;

  const totalSent =
    isResendLive && liveResendCount !== null
      ? Math.max(liveResendCount, sumCategories)
      : Math.max(stats.total_sent || 0, sumCategories);

  const usagePercent = Math.min(100, Math.round((totalSent / RESEND_GLOBAL_DAILY_LIMIT) * 100));
  const remainingGlobal = Math.max(0, RESEND_GLOBAL_DAILY_LIMIT - totalSent);

  return {
    date: todayStr,
    total_sent: totalSent,
    limit: RESEND_GLOBAL_DAILY_LIMIT,
    usage_percent: usagePercent,
    is_resend_live: isResendLive,
    categories: {
      sih_broadcast: sih,
      outreach,
      test_dispatches: testDispatches,
      notifications,
      organizer_broadcasts: organizerBroadcasts,
      admin_reports: adminReports,
      contact_submissions: contactSubmissions,
      onboarding_nudges: onboardingNudges,
    },
    remaining_global: remainingGlobal,
  };
}
