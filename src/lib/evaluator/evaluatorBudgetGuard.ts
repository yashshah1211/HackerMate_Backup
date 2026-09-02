import { SupabaseClient } from "@supabase/supabase-js";

export const GEMINI_GLOBAL_DAILY_LIMIT = 100;
export const ANONYMOUS_IP_DAILY_LIMIT = 2;
export const LOGGED_IN_USER_DAILY_LIMIT = 10;

// In-memory sliding window cache for anonymous IP rate limiting
interface IpUsageRecord {
  count: number;
  lastTimestamp: number;
}
const ipUsageMap = new Map<string, IpUsageRecord>();

export interface BudgetGuardDecision {
  allowAiCall: boolean;
  isRateLimited: boolean;
  rateLimitMessage?: string;
  remainingGlobalBudget: number;
  mode: "gemini_ai" | "heuristic_fallback";
}

/**
 * Checks and updates rate limits and the daily Gemini AI budget.
 */
export async function checkEvaluatorBudgetAndRateLimit(
  supabaseAdmin: SupabaseClient,
  clientIp: string,
  userId?: string | null
): Promise<BudgetGuardDecision> {
  const now = Date.now();
  const todayStr = new Date().toISOString().split("T")[0];
  const appSettingKey = `daily_evaluator_usage_${todayStr}`;

  // 1. IP-level soft friction check for unauthenticated users (in production)
  if (!userId && process.env.NODE_ENV === "production") {
    const ipRecord = ipUsageMap.get(clientIp);
    if (ipRecord) {
      // 30-second rapid spam cooldown
      if (now - ipRecord.lastTimestamp < 30 * 1000) {
        return {
          allowAiCall: false,
          isRateLimited: true,
          rateLimitMessage: "Please wait 30 seconds before submitting another pitch evaluation.",
          remainingGlobalBudget: 0,
          mode: "heuristic_fallback",
        };
      }

      // 24-hour reset window for in-memory cache
      if (now - ipRecord.lastTimestamp < 24 * 60 * 60 * 1000) {
        if (ipRecord.count >= ANONYMOUS_IP_DAILY_LIMIT) {
          return {
            allowAiCall: false,
            isRateLimited: true,
            rateLimitMessage: `You have reached the free limit of ${ANONYMOUS_IP_DAILY_LIMIT} evaluations per day. Please sign in to HackerMate for full access!`,
            remainingGlobalBudget: 0,
            mode: "heuristic_fallback",
          };
        }
      } else {
        // Reset counter after 24h
        ipRecord.count = 0;
      }
    }
  }

  // 2. Global Gemini AI Daily Budget Cap Check
  let currentDailyAiUsage = 0;
  try {
    const { data: setting } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .eq("key", appSettingKey)
      .maybeSingle();

    if (setting?.value) {
      currentDailyAiUsage = parseInt(setting.value, 10) || 0;
    }
  } catch (err) {
    console.warn("[Evaluator Budget Guard] Error reading global usage:", err);
  }

  const remainingGlobalBudget = Math.max(0, GEMINI_GLOBAL_DAILY_LIMIT - currentDailyAiUsage);

  // If daily budget exhausted, seamlessly switch to deterministic heuristic mode
  if (remainingGlobalBudget <= 0) {
    console.log(`[Evaluator Budget Guard] Global Gemini daily cap (${GEMINI_GLOBAL_DAILY_LIMIT}) reached for ${todayStr}. Using Heuristic Fallback.`);
    return {
      allowAiCall: false,
      isRateLimited: false,
      remainingGlobalBudget: 0,
      mode: "heuristic_fallback",
    };
  }

  return {
    allowAiCall: true,
    isRateLimited: false,
    remainingGlobalBudget,
    mode: "gemini_ai",
  };
}

/**
 * Increments the global Gemini call counter and updates IP usage after an evaluation.
 */
export async function recordSuccessfulEvaluation(
  supabaseAdmin: SupabaseClient,
  clientIp: string,
  usedGeminiAi: boolean,
  userId?: string | null
): Promise<void> {
  const now = Date.now();
  const todayStr = new Date().toISOString().split("T")[0];
  const appSettingKey = `daily_evaluator_usage_${todayStr}`;

  // Update in-memory IP tracker for unauthenticated calls
  if (!userId) {
    const current = ipUsageMap.get(clientIp) || { count: 0, lastTimestamp: 0 };
    ipUsageMap.set(clientIp, {
      count: current.count + 1,
      lastTimestamp: now,
    });
  }

  // Increment global database counter if Gemini AI was invoked
  if (usedGeminiAi) {
    try {
      const { data: current } = await supabaseAdmin
        .from("app_settings")
        .select("key, value")
        .eq("key", appSettingKey)
        .maybeSingle();

      const newCount = (parseInt(current?.value || "0", 10) || 0) + 1;

      await supabaseAdmin.from("app_settings").upsert({
        key: appSettingKey,
        value: newCount.toString(),
      });
    } catch (err) {
      console.warn("[Evaluator Budget Guard] Error updating global usage counter:", err);
    }
  }
}
