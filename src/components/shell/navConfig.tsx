import type { ReactNode } from "react";
import { House, MessageSquare, Rocket, Swords, Users, UsersRound } from "lucide-react";

export type NavSection = "home" | "builders" | "teams" | "hackathons" | "practice" | "messages";

export type NavItem = {
  id: NavSection;
  href: string;
  label: string;
  icon: ReactNode;
  /** Shown in the mobile tab bar (max 5). */
  mobile: boolean;
};

/**
 * Global navigation. Six destinations, grouped by intent. Sibling routes
 * (connections, my-teams, invites, leaderboard, evaluator…) live as section
 * tabs inside these destinations instead of competing in the rail.
 */
export const NAV_ITEMS: NavItem[] = [
  { id: "home", href: "/dashboard", label: "Home", icon: <House />, mobile: true },
  { id: "builders", href: "/developers", label: "Builders", icon: <UsersRound />, mobile: true },
  { id: "teams", href: "/teams", label: "Teams", icon: <Users />, mobile: true },
  { id: "hackathons", href: "/hackathons", label: "Hackathons", icon: <Rocket />, mobile: true },
  { id: "practice", href: "/challenges", label: "Practice", icon: <Swords />, mobile: false },
  { id: "messages", href: "/messages", label: "Messages", icon: <MessageSquare />, mobile: true },
];

export function sectionFor(pathname: string | null): NavSection | null {
  if (!pathname) return null;
  const p = pathname;
  if (p === "/dashboard" || p.startsWith("/dashboard/")) return "home";
  if (p.startsWith("/developers") || p.startsWith("/connections") || p.startsWith("/profile")) return "builders";
  if (p.startsWith("/teams") || p.startsWith("/my-teams") || p.startsWith("/invites")) return "teams";
  if (p.startsWith("/hackathons")) return "hackathons";
  if (p.startsWith("/challenges") || p.startsWith("/leaderboard") || p.startsWith("/evaluator") || p.startsWith("/tools")) return "practice";
  if (p.startsWith("/messages")) return "messages";
  return null;
}

/** Detail routes get a back affordance in the mobile top bar. */
export function isDetailRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    /^\/profile\/(?!edit)[^/]+$/.test(pathname) ||
    /^\/teams\/(?!create)[^/]+(\/requests)?$/.test(pathname) ||
    /^\/hackathons\/(?!create|sih)[^/]+(\/organizer)?$/.test(pathname) ||
    /^\/challenges\/[^/]+/.test(pathname) ||
    pathname === "/settings" ||
    pathname === "/notifications" ||
    pathname === "/profile/edit"
  );
}

/**
 * Routes that render without any chrome (auth + onboarding flows). `/dev/*`
 * is the development-only screen gallery, which renders its own mock shell
 * (it 404s in production).
 */
export function isBareRoute(pathname: string | null): boolean {
  return pathname === "/login" || pathname === "/onboarding" || Boolean(pathname?.startsWith("/dev/"));
}

/** Marketing / legal routes use the public header instead of the app shell. */
export function isMarketingRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  return (
    pathname === "/" ||
    pathname === "/terms" ||
    pathname.startsWith("/terms/") ||
    pathname === "/privacy" ||
    pathname.startsWith("/privacy/") ||
    pathname === "/contact" ||
    pathname.startsWith("/contact/") ||
    pathname === "/faq" ||
    pathname.startsWith("/faq/") ||
    pathname.startsWith("/partners")
  );
}

/** V1 rule kept: public/marketing surfaces always render dark. */
export function isForcedDarkRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  const exact = ["/", "/login", "/faq", "/terms", "/privacy", "/contact", "/partners", "/onboarding"];
  return exact.includes(pathname) || pathname.startsWith("/partners/") || pathname.startsWith("/hackathons/sih");
}
