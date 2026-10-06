import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LegacyPartnerPage from "@/components/partners/LegacyPartnerPage";
import PublicEventPage, { PartnerPageState } from "@/components/partners/PublicEventPage";
import { loadPublicPartner } from "@/lib/partners/public";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadPublicPartner(slug);
  if (result.kind === "missing" || result.kind === "unavailable") {
    return { title: "Partner event", robots: { index: false, follow: false } };
  }
  const { config } = result;
  const event = result.kind === "organizer-v1" ? result.event : null;
  const title = event?.name || config.name;
  const description = config.tagline || event?.description || `Event information and teammate discovery for ${title} on HackerMate.`;
  const path = `/partners/${config.slug}`;
  const image = config.bannerUrl || config.logoUrl;
  return {
    title, description, alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website", siteName: "HackerMate",
      images: image ? [{ url: image, alt: title }] : [] },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : [] },
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
