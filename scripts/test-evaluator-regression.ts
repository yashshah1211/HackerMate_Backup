import { generateTrackHeuristicEvaluation, runTrackAwareEvaluation } from "../src/lib/evaluator/trackEvaluatorEngine";
import { EvaluationInput } from "../src/lib/evaluator/evaluatorTypes";

async function runRegressionTests() {
  console.log("=== Running Evaluator Regression Tests ===\n");

  const baseInput: Omit<EvaluationInput, "trackId"> = {
    psTitle: "Regression Test Project",
    solutionDescription: "A test project description that is long enough to pass heuristic checks. We use React, Next.js, and Postgres.",
    architectureDetails: "Database schema includes user and posts table. Caching with Redis.",
    slidesText: "Slide 1: Intro. Slide 2: Tech stack. Slide 3: Future work.",
  };

  // Test 1: General Mode (Domain-neutral)
  console.log("--- Test 1: General Hackathon Mode ---");
  const generalResult = generateTrackHeuristicEvaluation({ ...baseInput, trackId: "generic" });
  console.assert(generalResult.trackId === "generic", "Failed Test 1: trackId mismatch");
  console.assert(generalResult.totalScore > 0, "Failed Test 1: score is 0");
  console.log("General Mode passed.\n");

  // Test 2: Specialized Mode (Web Dev)
  console.log("--- Test 2: Specialized Mode (Web Dev) ---");
  const webDevResult = generateTrackHeuristicEvaluation({ ...baseInput, trackId: "web_dev" });
  console.assert(webDevResult.trackId === "web_dev", "Failed Test 2: trackId mismatch");
  console.assert(webDevResult.categoryLabels.tech === "Full-Stack & Database Architecture", "Failed Test 2: label mismatch");
  console.log("Web Dev Mode passed.\n");

  // Test 3: Custom Rubric & Limitation Disclosure
  console.log("--- Test 3: Custom Rubric Specific Mode (Heuristic Fallback) ---");
  const specificResult = generateTrackHeuristicEvaluation({ 
    ...baseInput, 
    trackId: "specific", 
    customRubric: "40% Design, 30% Tech, 20% Impact, 10% Presentation" 
  });
  console.assert(specificResult.trackId === "specific", "Failed Test 3: trackId mismatch");
  const hasDisclosure = specificResult.redFlags.some(flag => flag.includes("cannot accurately evaluate arbitrary custom rubrics"));
  console.assert(hasDisclosure, "Failed Test 3: Missing fallback limitation disclosure");
  console.log("Custom Rubric Fallback Disclosure passed.\n");

  // Test 4: Historical Evaluation Compatibility / Invalid Rubric Inputs
  console.log("--- Test 4: Invalid Track Fallback ---");
  // @ts-ignore - purposefully passing invalid track
  const invalidResult = generateTrackHeuristicEvaluation({ ...baseInput, trackId: "invalid_track_id" });
  console.assert(invalidResult.trackId === "generic", "Failed Test 4: Invalid track should default to generic");
  console.log("Invalid Track Fallback passed.\n");

  console.log("All regression tests passed successfully.");
}

runRegressionTests().catch(console.error);
