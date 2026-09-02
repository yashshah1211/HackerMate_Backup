/**
 * HackerMate Layout Configuration
 *
 * Source of truth for page layout rendering rules (e.g., footer display).
 */

/**
 * Determines whether the standard site Footer should be rendered for a given route pathname.
 *
 * PAGES THAT SHOULD SHOW THE FOOTER:
 * - / (landing page)
 * - /leaderboard
 * - /hackathons (listing) and /hackathons/[slug] (individual event pages, except /hackathons/sih and /hackathons/create)
 * - /partners/[slug]
 * - /profile/[id] (public Builder Track Record page)
 * - /faq
 * - /tools/ppt-evaluator (and any other publicly linked tool page)
 * - /terms, /privacy, /contact
 *
 * PAGES THAT SHOULD NOT SHOW THE FOOTER:
 * - /dashboard
 * - /teams/[id] and /teams/[id]/workspace
 * - /my-teams
 * - /settings
 * - /onboarding
 * - /admin/* (all tabs)
 * - /hackathons/sih (SIH Team Builder — app tool)
 * - /hackathons/create
 * - /messages and any DM/chat interfaces
 * - /evaluator, /tools/pitch-evaluator (app-like evaluator tools)
 * - /profile/edit (builder profile edit dashboard)
 * - /login, /signup (custom minimal layout)
 */
export function shouldRenderFooter(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  // Normalize trailing slashes (except root '/')
  const normalized = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;

  // 1. Explicit exclusion list for interactive / workspace / tool routes
  if (
    normalized === "/dashboard" ||
    normalized.startsWith("/dashboard/") ||
    normalized === "/hackathons/sih" ||
    normalized.startsWith("/hackathons/sih/") ||
    normalized === "/hackathons/create" ||
    normalized.startsWith("/admin") ||
    normalized.startsWith("/messages") ||
    normalized === "/my-teams" ||
    normalized.startsWith("/my-teams/") ||
    normalized.startsWith("/teams") ||
    normalized.startsWith("/connections") ||
    normalized.startsWith("/developers") ||
    normalized.startsWith("/invites") ||
    normalized.startsWith("/notifications") ||
    normalized === "/settings" ||
    normalized.startsWith("/settings/") ||
    normalized === "/onboarding" ||
    normalized.startsWith("/onboarding/") ||
    normalized === "/evaluator" ||
    normalized.startsWith("/evaluator/") ||
    normalized === "/tools/pitch-evaluator" ||
    normalized.startsWith("/tools/pitch-evaluator/") ||
    normalized === "/profile/edit" ||
    normalized === "/login" ||
    normalized === "/signup"
  ) {
    return false;
  }

  // 2. Explicit inclusion list for marketing, content, and public pages
  if (
    normalized === "/" ||
    normalized === "/leaderboard" ||
    normalized.startsWith("/leaderboard/") ||
    normalized === "/hackathons" ||
    normalized.startsWith("/hackathons/") ||
    normalized.startsWith("/partners") ||
    (normalized.startsWith("/profile/") && normalized !== "/profile/edit") ||
    normalized === "/faq" ||
    normalized.startsWith("/faq/") ||
    (normalized.startsWith("/tools/") && !normalized.startsWith("/tools/pitch-evaluator")) ||
    normalized === "/terms" ||
    normalized === "/privacy" ||
    normalized === "/contact"
  ) {
    return true;
  }

  return false;
}
