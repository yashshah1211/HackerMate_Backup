import type { Metadata } from "next";
import { EventSeriesHub, EventSeriesState } from "@/components/partners/EventSeriesPage";
import { CRAFTNCODE_SERIES } from "@/lib/partners/eventSeries";
import { loadCraftSeries } from "@/lib/partners/eventSeriesPublic";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const result = await loadCraftSeries();
  return {
    title: "Craft N Code | D³ TechFest 2026",
    description: "Explore currently listed Craft N Code state qualifiers and find teammates for your qualifier on HackerMate.",
    alternates: { canonical: "/partners/craftncode" },
    robots: result.kind === "unavailable" || result.events.length === 0 ? { index: false, follow: false } : undefined,
  };
}

export default async function CraftNCodeHub() {
  const result = await loadCraftSeries();
  return result.kind === "ready" ? <EventSeriesHub series={CRAFTNCODE_SERIES} events={result.events} />
    : <EventSeriesState series={CRAFTNCODE_SERIES} kind="unavailable" retryPath="/partners/craftncode" />;
}
