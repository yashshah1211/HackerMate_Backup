import PitchEvaluatorClient from "@/components/PitchEvaluatorClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Hackathon Pitch & Project Evaluator | HackerMate",
  description: "Evaluate your hackathon pitch, tech stack, and architecture with AI. Get instant rubric scores, domain red flags, and find teammates on HackerMate.",
};

export default function EvaluatorPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pt-20 pb-16">
      <PitchEvaluatorClient initialTrack="web_dev" />
    </main>
  );
}
