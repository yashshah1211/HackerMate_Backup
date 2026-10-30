import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegacyPartnerPage from "@/components/partners/LegacyPartnerPage";
import PublicEventPage, { PartnerPageState } from "@/components/partners/PublicEventPage";
import { loadPublicPartner } from "@/lib/partners/public";
import { RACK_IT_UP_2026 } from "@/lib/partners/rackItUp2026";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadPublicPartner(slug);
  if (result.kind === "missing" || result.kind === "unavailable") {
    return { title: "Partner event", robots: { index: false, follow: false },
      alternates: { canonical: null }, openGraph: null, twitter: null };
  }
  const { config } = result;
  const event = result.kind === "organizer-v1" ? result.event : null;
  const rack = config.slug === RACK_IT_UP_2026.slug ? RACK_IT_UP_2026 : null;
  const title = rack?.name || event?.name || config.name;
  const description = rack?.introduction || config.tagline || event?.description || `Event information and teammate discovery for ${title} on HackerMate.`;
  const path = `/partners/${config.slug}`;
  const image = config.bannerUrl || config.logoUrl;
  const images = image ? [{ url: image, alt: title }]
    : [{ url: "/og-image.png", width: 1200, height: 630, alt: "HackerMate — Team Operating System" }];
  // Only this checked-in mark is known to be square; other artwork is unmeasured.
  const compactLogo = Boolean(rack && !config.bannerUrl && config.logoUrl === "/partners/rack-it-up-2026/RackItUp-mark.png");
  return {
    title, description, alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website", siteName: "HackerMate",
      images },
    twitter: { card: compactLogo ? "summary" : "summary_large_image",
      title, description, images: [image || "/og-image.png"] },
  };
}

export default async function PartnerPage({ params }: Props) {
  const { slug } = await params;
  const result = await loadPublicPartner(slug);
  if (result.kind === "missing") notFound();
  if (result.kind === "unavailable") return <PartnerPageState unavailable />;
  if (result.kind === "legacy") return <LegacyPartnerPage />;
  if (result.kind === "organizer-v1") return <PublicEventPage config={result.config} event={result.event} />;
}
