import { redirect } from "next/navigation";

export default function StandalonePPTEvaluatorPage() {
  // Presentation reviews live inside each team; there is no standalone evaluator.
  redirect("/my-teams");
}
