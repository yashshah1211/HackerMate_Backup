import { getAnalysisDisplay, type AnalysisMetadata } from "@/lib/ppt/analysisMetadata";
import { Tape } from "@/components/system";

export default function PitchAnalysisBadge({ feedback }: { feedback?: { analysis?: AnalysisMetadata; usedAiFallback?: boolean } }) {
  const display = getAnalysisDisplay(feedback);
  return <Tape tone={display.mode === "heuristic_fallback" ? "warn" : "neutral"} title={display.description}>{display.label}</Tape>;
}
