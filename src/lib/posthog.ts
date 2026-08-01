import posthog from "posthog-js";

/**
 * Privacy-Safe User Identification for PostHog.
 * Strictly avoids PII (no email, no full_name). Only passes distinct user UUID
 * and non-identifying operational flags (e.g. onboarding_completed, role).
 */
export function identifyUser(
  userId: string,
  userProperties?: {
    onboarding_completed?: boolean;
    role?: string;
  }
) {
  if (typeof window === "undefined" || !posthog) return;

  const safeProperties: Record<string, any> = {};
  if (userProperties?.onboarding_completed !== undefined) {
    safeProperties.onboarding_completed = userProperties.onboarding_completed;
  }
  if (userProperties?.role !== undefined) {
    safeProperties.role = userProperties.role;
  }

  posthog.identify(userId, safeProperties);
}

/**
 * Custom Funnel Event Tracking for HackerMate.
 */
export function trackEvent(eventName: string, properties?: Record<string, any>) {
  if (typeof window === "undefined" || !posthog) return;
  posthog.capture(eventName, properties);
}
