/**
 * Google Analytics 4 (GA4) Bridge for HackerMate
 * Handles pageviews, custom event tracking, and user property association.
 */

export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID || "";

// https://developers.google.com/analytics/devguides/collection/gtagjs/pages
export const pageview = (url: string) => {
  if (typeof window !== "undefined" && (window as any).gtag && GA_TRACKING_ID) {
    (window as any).gtag("config", GA_TRACKING_ID, {
      page_path: url,
    });
  }
};

/**
 * Custom event tracking for GA4
 * @param eventName - Name of the action (e.g. 'team_created', 'sih_deck_evaluated')
 * @param properties - Key-value event parameters
 */
export const trackEvent = (eventName: string, properties: Record<string, any> = {}) => {
  if (typeof window === "undefined") return;

  if ((window as any).gtag && GA_TRACKING_ID) {
    (window as any).gtag("event", eventName, properties);
  } else if (process.env.NODE_ENV === "development") {
    // Helpful debug logging in dev mode
    console.debug(`[GA4 Event] ${eventName}:`, properties);
  }
};

/**
 * Privacy-safe user identification for GA4.
 * Associates a pseudonymous user ID with custom user properties.
 */
export const identifyUser = (
  userId: string,
  traits?: Record<string, any>
) => {
  if (typeof window === "undefined" || !userId) return;

  const safeProperties = {
    user_id: userId,
    user_college: traits?.college || "unspecified",
    user_branch: traits?.branch || "unspecified",
    user_grad_year: traits?.grad_year || "unspecified",
    skills_count: traits?.skills_count ?? 0,
    teams_joined: traits?.team_count ?? 0,
    onboarding_completed: traits?.onboarding_completed ?? true,
    ...(traits || {}),
  };

  if ((window as any).gtag && GA_TRACKING_ID) {
    (window as any).gtag("set", "user_properties", safeProperties);
    (window as any).gtag("config", GA_TRACKING_ID, { user_id: userId });
  } else if (process.env.NODE_ENV === "development") {
    console.debug(`[GA4 Identify] User: ${userId}`, safeProperties);
  }
};
