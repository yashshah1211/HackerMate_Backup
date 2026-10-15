import { EventSeriesState } from "@/components/partners/EventSeriesPage";
import { CRAFTNCODE_SERIES } from "@/lib/partners/eventSeries";

export default function NotFound() {
  return <EventSeriesState series={CRAFTNCODE_SERIES} kind="missing" />;
}
