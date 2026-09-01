import PitchEvaluatorClient from "@/components/PitchEvaluatorClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Pitch & Project Evaluator | HackerMate Tools",
  description: "Test your hackathon pitch, tech stack, and architecture with track-aware AI grading.",
};

export default function PitchEvaluatorToolPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pt-20 pb-16">
      <PitchEvaluatorClient initialTrack="web_dev" />
    </main>
  );
}
