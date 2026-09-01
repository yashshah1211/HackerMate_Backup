import PitchEvaluatorClient from "@/components/PitchEvaluatorClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "SIH AI Pitch Deck & Format Evaluator | HackerMate Tools",
  description: "Benchmark your Smart India Hackathon 6-slide deck against official jury rubrics. Instant format compliance and scoring.",
};

export default function StandalonePPTEvaluatorPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pt-20 pb-16">
      <PitchEvaluatorClient initialTrack="sih" />
    </main>
  );
}
