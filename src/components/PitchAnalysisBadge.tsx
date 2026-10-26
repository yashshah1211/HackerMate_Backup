import { getAnalysisDisplay, type AnalysisMetadata } from "@/lib/ppt/analysisMetadata";
import { Tape } from "@/components/system";

export default function PitchAnalysisBadge({ feedback, currentResponse = false }: { feedback?: { analysis?: AnalysisMetadata; usedAiFallback?: boolean }; currentResponse?: boolean }) {
  const display = getAnalysisDisplay(feedback, currentResponse);
  return <Tape tone={display.mode === "heuristic_fallback" ? "warn" : "neutral"} title={display.description}>{display.label}</Tape>;
}
