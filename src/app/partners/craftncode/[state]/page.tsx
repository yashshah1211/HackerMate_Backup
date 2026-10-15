import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventSeriesQualifier, EventSeriesState } from "@/components/partners/EventSeriesPage";
import { CRAFTNCODE_SERIES } from "@/lib/partners/eventSeries";
import { loadCraftQualifier } from "@/lib/partners/eventSeriesPublic";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ state: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state } = await params;
  const result = await loadCraftQualifier(state);
  if (result.kind !== "ready") return { title: "Craft N Code qualifier", robots: { index: false, follow: false } };
  return {
    title: `Craft N Code — ${result.qualifier.state} | D³ TechFest 2026`,
    description: `Organizer rules, official registration and teammate discovery for the ${result.qualifier.state} qualifier.`,
    alternates: { canonical: `/partners/craftncode/${result.qualifier.slug}` },
  };
}

export default async function CraftNCodeQualifier({ params }: Props) {
  const { state } = await params;
  const result = await loadCraftQualifier(state);
  if (result.kind === "missing") notFound();
  if (result.kind === "unavailable") return <EventSeriesState series={CRAFTNCODE_SERIES} kind="unavailable" retryPath={`/partners/craftncode/${state}`} />;
  return <EventSeriesQualifier series={CRAFTNCODE_SERIES} qualifier={result.qualifier} event={result.event} />;
}
