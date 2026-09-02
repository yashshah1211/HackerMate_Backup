import { Suspense } from "react";
import PitchEvaluatorClient from "@/components/PitchEvaluatorClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Hackathon Pitch & Project Evaluator | HackerMate",
  description: "Evaluate your hackathon pitch, tech stack, and architecture with AI. Get instant rubric scores, domain red flags, and find teammates on HackerMate.",
};

export default function EvaluatorPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pt-20 pb-16">
      <Suspense fallback={<div className="text-center py-20 text-xs text-zinc-500">Loading Evaluator...</div>}>
        <PitchEvaluatorClient initialTrack="web_dev" />
      </Suspense>
    </main>
  );
}
