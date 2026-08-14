'use client';

import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { pageview, GA_TRACKING_ID } from '@/lib/gtag';

function parseReferrerSource(utmSource: string | null, referrer: string): string {
  if (utmSource) {
    const clean = utmSource.toLowerCase().trim();
    if (clean.includes("reddit")) return "reddit";
    if (clean.includes("linkedin")) return "linkedin";
    if (clean.includes("instagram") || clean === "ig") return "instagram";
    if (clean.includes("whatsapp")) return "whatsapp";
    if (clean.includes("discord")) return "discord";
    if (clean.includes("unstop")) return "unstop";
    if (clean.includes("google")) return "google_search";
    return clean;
  }

  if (referrer) {
    const ref = referrer.toLowerCase();
    if (ref.includes("reddit.com") || ref.includes("old.reddit.com")) return "reddit";
    if (ref.includes("linkedin.com") || ref.includes("lnkd.in")) return "linkedin";
    if (ref.includes("instagram.com") || ref.includes("l.instagram.com")) return "instagram";
    if (ref.includes("whatsapp.com") || ref.includes("web.whatsapp.com")) return "whatsapp";
    if (ref.includes("discord.com") || ref.includes("discord.gg")) return "discord";
    if (ref.includes("unstop.org") || ref.includes("unstop.com")) return "unstop";
    if (ref.includes("google.com") || ref.includes("google.co.in")) return "google_search";
    if (ref.includes("t.co") || ref.includes("x.com") || ref.includes("twitter.com")) return "x_twitter";
  }

  return "direct";
}

function AnalyticsPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Capture referral source on first visit
    if (typeof window !== 'undefined') {
      const existing = localStorage.getItem('hm_referrer_source');
      if (!existing) {
        const utmSource = searchParams ? searchParams.get('utm_source') : null;
        const rawReferrer = typeof document !== 'undefined' ? document.referrer : '';
        const detected = parseReferrerSource(utmSource, rawReferrer);
        localStorage.setItem('hm_referrer_source', detected);
      }
    }

    if (pathname && GA_TRACKING_ID) {
      let url = pathname;
      if (searchParams?.toString()) {
        url = `${url}?${searchParams.toString()}`;
      }
      pageview(url);
    }
  }, [pathname, searchParams]);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <AnalyticsPageView />
      </Suspense>
      {children}
    </>
  );
}

// Backward-compatible alias for existing layout imports
export { AppProviders as PostHogProvider };
