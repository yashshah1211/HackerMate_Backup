import type { Metadata } from "next";
import HustleCarnivalPage from "@/components/partners/HustleCarnivalPage";
import { loadHustleCommunity } from "@/lib/partners/hustleCarnivalPublic";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Hustle Carnival 2026 × HackerMate" },
  description: "Hustle Beyond. Explore Club Ellusion’s hybrid buildathon, the online submission phase and the 24 October finale in Mathura. Register officially on Unstop.",
  alternates: { canonical: "/partners/hustle-carnival" },
  // Local review draft: public co-branding and event metadata still require sign-off.
  robots: { index: false, follow: false },
  twitter: {
    card: "summary_large_image",
    title: "Hustle Carnival 2026 × HackerMate",
    description: "Hustle Beyond. Explore the online phase and the 24 October finale in Mathura.",
    images: ["/partners/hustle-carnival/hustle-carnival-gold-brand-poster.jpeg"],
  },
  openGraph: {
    title: "Hustle Carnival 2026 × HackerMate",
    description: "Online ideas. On-campus builds. Hustle Beyond with Club Ellusion in Mathura.",
    url: "/partners/hustle-carnival",
    images: [{ url: "/partners/hustle-carnival/hustle-carnival-gold-brand-poster.jpeg", width: 1254, height: 1254, alt: "Club Ellusion — Hustle Carnival, Hustle Beyond" }],
  },
};

export default async function HustleCarnivalPortal() {
  return <HustleCarnivalPage community={await loadHustleCommunity()} />;
}
