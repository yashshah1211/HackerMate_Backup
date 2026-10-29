"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { RACK_IT_UP_2026 } from "@/lib/partners/rackItUp2026";
import { eventDiscoveryHref } from "@/lib/hackathons/discoveryNavigation";

export const RACK_FUNNEL_KEY = "hm_rack_funnel_v1";
export const RACK_FUNNEL_TTL_MS = 30 * 60 * 1000;
type FunnelEvent = "rack_portal_view" | "rack_find_teammates_click" | "rack_unstop_click"
  | "rack_login_entry" | "rack_onboarding_entry";
type SimpleAnalyticsWindow = Window & {
  sa_event?: (name: FunnelEvent, metadata: { event_slug: typeof RACK_IT_UP_2026.slug }) => void;
  sa_metadata?: unknown;
};

/** Exact generated discovery paths only. This record is never authorization. */
export function rackFunnelDestination(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^\/hackathons\/([0-9a-f-]{36})\?tab=looking_for_teams$/i);
  return match && eventDiscoveryHref(match[1]) === value ? value : null;
}

function measure(name: FunnelEvent, remaining = 4) {
  // No identity, URL, referrer or user-supplied metadata enters the event payload.
  try {
    // Use the existing Simple Analytics script; Vercel Hobby has no custom events.
    // Wait at most one second for readiness; never load a script or block a click.
    const analytics = window as SimpleAnalyticsWindow;
    // The vendor can merge global metadata/collectors into individual events.
    // Fail closed rather than inherit additional data or change shared settings.
    if (analytics.sa_metadata != null && (typeof analytics.sa_metadata !== "object" || Object.keys(analytics.sa_metadata).length > 0)) return;
    if (document.querySelector('script[src="https://scripts.simpleanalyticscdn.com/latest.js"][data-metadata-collector]')) return;
    if (typeof analytics.sa_event !== "function") {
      if (remaining > 0) window.setTimeout(() => measure(name, remaining - 1), 250);
      return;
    }
    analytics.sa_event(name, { event_slug: RACK_IT_UP_2026.slug });
  }
  catch { /* Analytics must never interfere with the journey. */ }
}

function rememberedDestination(): string | null {
  try {
    const raw = sessionStorage.getItem(RACK_FUNNEL_KEY);
    if (!raw) return null;
    const context: unknown = raw.length <= 256 ? JSON.parse(raw) : null;
    if (context && typeof context === "object" && "expiresAt" in context && "destination" in context
      && typeof context.expiresAt === "number" && context.expiresAt > Date.now()
      && context.expiresAt <= Date.now() + RACK_FUNNEL_TTL_MS && rackFunnelDestination(context.destination)) {
      return context.destination as string;
    }
    sessionStorage.removeItem(RACK_FUNNEL_KEY);
  } catch {
    try { sessionStorage.removeItem(RACK_FUNNEL_KEY); } catch { /* Storage is optional. */ }
  }
  return null;
}

/** Best-effort observations; no auth calls, navigation interception or DB writes. */
export default function RackFunnel() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const lastView = useRef("");
  useEffect(() => {
    const key = `${pathname}?${search}`;
    if (lastView.current !== key) {
      lastView.current = key;
      if (pathname === `/partners/${RACK_IT_UP_2026.slug}`) measure("rack_portal_view");
      else if (pathname === "/login" || pathname === "/onboarding") {
        const next = new URLSearchParams(search).get("next");
        if (next && next === rememberedDestination()) measure(pathname === "/login" ? "rack_login_entry" : "rack_onboarding_entry");
      }
    }
    if (pathname !== `/partners/${RACK_IT_UP_2026.slug}`) return;
    const clicked = (event: MouseEvent) => {
      if (event.button !== 0 || !(event.target instanceof window.Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[data-rack-funnel]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (anchor.dataset.rackFunnel === "unstop" && href === RACK_IT_UP_2026.registrationUrl) measure("rack_unstop_click");
      else if (anchor.dataset.rackFunnel === "find_teammates") {
        const destination = rackFunnelDestination(href);
        if (!destination) return;
        // Modified/new-tab clicks are counted but cannot reliably attribute this tab's login.
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !anchor.target) {
          try { sessionStorage.setItem(RACK_FUNNEL_KEY, JSON.stringify({ destination, expiresAt: Date.now() + RACK_FUNNEL_TTL_MS })); }
          catch { /* Browsing and sign-in remain available without storage. */ }
        }
        measure("rack_find_teammates_click");
      }
    };
    document.addEventListener("click", clicked, true);
    return () => document.removeEventListener("click", clicked, true);
  }, [pathname, search]);
  return null;
}
