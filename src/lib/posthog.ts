/**
 * Analytics Bridge (formerly PostHog, now redirected to Google Analytics 4)
 * Preserves backwards compatibility for all existing imports across HackerMate.
 */

export { trackEvent, identifyUser, pageview, GA_TRACKING_ID } from "./gtag";
