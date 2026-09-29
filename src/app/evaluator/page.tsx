import { Suspense } from "react";
import PitchEvaluatorClient from "@/components/PitchEvaluatorClient";
import { PageLoader } from "@/components/system";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Idea Evaluator & Hackathon Pitch Grader | HackerMate",
  description: "Evaluate your hackathon ideas, pitch, tech stack, and architecture with our Idea Evaluator. Get instant rubric scores, domain red flags, and find teammates on HackerMate.",
};

// PitchEvaluatorClient renders its own V2 <Page> (<main data-v2>) frame.
export default function EvaluatorPage() {
  return (
    <Suspense fallback={<PageLoader label="Loading evaluator" />}>
      <PitchEvaluatorClient initialTrack="web_dev" />
    </Suspense>
  );
}
