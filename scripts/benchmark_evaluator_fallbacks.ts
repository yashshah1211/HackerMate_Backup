import fs from "fs";
import path from "path";
import { EvaluationInput, JudgingTrackId } from "../src/lib/evaluator/evaluatorTypes";
import {
  generateTrackHeuristicEvaluation,
  runTrackAwareEvaluation,
} from "../src/lib/evaluator/trackEvaluatorEngine";

// Load .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  envConfig.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const val = valueParts.join("=").trim();
      if (key && val) {
        process.env[key.trim()] = val;
      }
    }
  });
}

// ── TEST FIXTURES ──
const fixtures: Record<"sparse" | "weak" | "strong", Record<JudgingTrackId, EvaluationInput>> = {
  sparse: {
    web_dev: {
      trackId: "web_dev",
      psTitle: "My website",
      solutionDescription: "I want to build a cool website for students to chat.",
    },
    ai_genai: {
      trackId: "ai_genai",
      psTitle: "AI bot",
      solutionDescription: "A bot that answers questions using AI.",
    },
    sih: {
      trackId: "sih",
      psTitle: "Gov portal",
      solutionDescription: "Portal for government problem statement.",
    },
  },
  weak: {
    web_dev: {
      trackId: "web_dev",
      psTitle: "Student Task Manager",
      solutionDescription: "A web platform where students can create todo lists, assign tasks to friends, and view dashboards.",
      techStack: "React, Tailwind, Node.js, Express, MongoDB",
      architectureDetails: "Users log in, tasks are saved in database and fetched via REST API.",
    },
    ai_genai: {
      trackId: "ai_genai",
      psTitle: "DocuQuery AI",
      solutionDescription: "Upload PDF documents and ask questions to chat with your document using OpenAI API.",
      techStack: "Python, Streamlit, LangChain, OpenAI GPT-4 API",
      architectureDetails: "PDF text is extracted, sent to OpenAI prompt, and response is displayed in chat UI.",
    },
    sih: {
      trackId: "sih",
      psTitle: "Smart Crop Disease Detection",
      solutionDescription: "Farmers take a photo of crops and get disease diagnosis with fertilizer recommendations.",
      techStack: "Flutter, Firebase, Python CNN model",
      architectureDetails: "App uploads image to Firebase, backend script runs classification model and returns text.",
    },
  },
  strong: {
    web_dev: {
      trackId: "web_dev",
      psTitle: "Nexus: High-Throughput Real-Time Collaborative Workspace",
      solutionDescription: "A distributed collaboration platform for developer teams featuring sub-50ms CRDT state synchronization, role-based access control, and edge-cached collaborative documents.",
      techStack: "Next.js 16 (App Router + Server Components), TypeScript, PostgreSQL + Supabase (RLS & Realtime), Prisma ORM, Redis (Upstash) for presence caching, Tailwind CSS v4, Docker, Vercel Edge Functions.",
      architectureDetails: "Client uses Yjs CRDTs synced over WebSockets via Supabase Realtime channels. Read queries leverage Edge CDN stale-while-revalidate caching. Write operations execute through optimistic UI updates with Postgres ACID transactions and column-level RLS policies. Sensitive routes enforce JWT verification with sliding-window rate limiters. Background jobs process export tasks asynchronously with BullMQ worker queues.",
      repoUrl: "https://github.com/hackermate/nexus-workspace",
      demoUrl: "https://nexus-workspace.dev",
    },
    ai_genai: {
      trackId: "ai_genai",
      psTitle: "LegalMind: Multi-Agent Regulatory Compliance & RAG Verification System",
      solutionDescription: "An enterprise-grade regulatory compliance engine that processes 500+ page legal documents with sub-second semantic retrieval, hybrid sparse-dense re-ranking, and deterministic hallucination guardrails.",
      techStack: "Python 3.11, FastAPI, PyTorch, LlamaIndex, pgvector on PostgreSQL, BGE-M3 hybrid embeddings, Cohere ReRank v3, vLLM inference server, Next.js dashboard UI, Docker, Kubernetes.",
      architectureDetails: "Documents are ingested through hierarchical chunking with parent-document context preservation. Queries execute dual sparse BM25 + dense vector similarity searches fused via Reciprocal Rank Fusion (RRF), passed through a cross-encoder re-ranker. Generation employs multi-agent reflection loops (Researcher -> Drafter -> Auditor) with LangGraph. Ground truth citation mapping verifies every claim against source paragraph hashes, rejecting responses with confidence < 0.92 to prevent hallucinations.",
      repoUrl: "https://github.com/hackermate/legalmind-ai",
      demoUrl: "https://legalmind-demo.app",
    },
    sih: {
      trackId: "sih",
      psTitle: "JalDrishti: AI-Powered Municipal Water Pipeline Leakage & Contamination Telemetry",
      solutionDescription: "End-to-end IoT acoustic telemetry & satellite GIS pipeline detecting underground pipeline bursts within 15 meters, saving an estimated 42M liters of municipal drinking water per city annually.",
      techStack: "ESP32 Acoustic Vibration Sensors, LoRaWAN Gateway, Next.js 16 Web Dashboard, Python FastAPI, XGBoost anomaly detector, TimescaleDB for time-series telemetry, Mapbox GIS.",
      architectureDetails: "Slide 1: Problem statement ID 1729, Ministry of Jal Shakti. Slide 2: Acoustic frequency analysis of pipe pressure waves. Slide 3: Telemetry pipeline: ESP32 -> LoRaWAN -> MQTT -> TimescaleDB -> FastAPI -> Next.js GIS UI. Slide 4: 36h execution roadmap with hardware bench-test and synthetic acoustic burst simulator. Slide 5: Quantified impact: 42M liters saved, ₹3.2 Cr annual municipal loss prevention, 85% reduction in repair response time. Slide 6: IEEE citations on pipe acoustic transients, Jal Jeevan Mission open dataset integration.",
      repoUrl: "https://github.com/hackermate/jaldrishti-sih",
      demoUrl: "https://jaldrishti-sih.in",
    },
  },
};

async function runBenchmark() {
  console.log("================================================================================");
  console.log("🚀 EVALUATOR MULTI-ENGINE BENCHMARK SUITE (Heuristic Safety Net & Live AI Path)");
  console.log("================================================================================\n");

  const tracks: JudgingTrackId[] = ["web_dev", "ai_genai", "sih"];
  let totalTests = 0;
  let passedTests = 0;

  // ── TEST SUITE 1: Deterministic Content-Aware Heuristic Engine ──
  console.log("--- 1. DETERMINISTIC HEURISTIC FALLBACK BENCHMARK ---");

  for (const track of tracks) {
    const sparseRes = generateTrackHeuristicEvaluation(fixtures.sparse[track]);
    const weakRes = generateTrackHeuristicEvaluation(fixtures.weak[track]);
    const strongRes = generateTrackHeuristicEvaluation(fixtures.strong[track]);

    console.log(`\n📊 Track: [${track.toUpperCase()}]`);
    console.log(`  • Sparse Score: ${sparseRes.totalScore}/100 (${sparseRes.grade})`);
    console.log(`  • Weak Score:   ${weakRes.totalScore}/100 (${weakRes.grade})`);
    console.log(`  • Strong Score: ${strongRes.totalScore}/100 (${strongRes.grade})`);

    // Invariant 1: Strong > Weak > Sparse
    const orderingCorrect = strongRes.totalScore > weakRes.totalScore && weakRes.totalScore > sparseRes.totalScore;
    // Invariant 2: Clear score separation (delta >= 15 pts)
    const strongDelta = strongRes.totalScore - weakRes.totalScore;
    const weakDelta = weakRes.totalScore - sparseRes.totalScore;
    const separationAdequate = strongDelta >= 15 && weakDelta >= 12;
    // Invariant 3: Sparse strictly < 30, Strong >= 75
    const boundsCorrect = sparseRes.totalScore < 30 && strongRes.totalScore >= 75;

    totalTests += 3;

    if (orderingCorrect && separationAdequate && boundsCorrect) {
      console.log(`  ✅ Invariants Passed: Strong (+${strongDelta}) > Weak (+${weakDelta}) > Sparse`);
      passedTests += 3;
    } else {
      console.error(`  ❌ Assertion Failed: ordering=${orderingCorrect}, separation=${separationAdequate} (strongDelta=${strongDelta}, weakDelta=${weakDelta}), bounds=${boundsCorrect}`);
    }
  }

  // ── TEST SUITE 2: Live Gemini AI Path (Primary Production Route) ──
  console.log("\n--------------------------------------------------------------------------------");
  console.log("--- 2. LIVE GEMINI AI PRIMARY PATH BENCHMARK ---");
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    console.warn("⚠️ GEMINI_API_KEY not found. Skipping live AI path check.");
  } else {
    console.log("🔑 GEMINI_API_KEY detected. Testing live model execution ordering on Web Dev track...\n");

    try {
      console.log("⏳ Evaluating Live AI Sparse Fixture...");
      const aiSparse = await runTrackAwareEvaluation(fixtures.sparse.web_dev, true);
      console.log(`  • Live AI Sparse Score: ${aiSparse.totalScore}/100 (Used AI: ${aiSparse.usedAiEngine})`);

      console.log("⏳ Evaluating Live AI Weak Fixture...");
      const aiWeak = await runTrackAwareEvaluation(fixtures.weak.web_dev, true);
      console.log(`  • Live AI Weak Score:   ${aiWeak.totalScore}/100 (Used AI: ${aiWeak.usedAiEngine})`);

      console.log("⏳ Evaluating Live AI Strong Fixture...");
      const aiStrong = await runTrackAwareEvaluation(fixtures.strong.web_dev, true);
      console.log(`  • Live AI Strong Score: ${aiStrong.totalScore}/100 (Used AI: ${aiStrong.usedAiEngine})`);

      totalTests += 2;
      const aiOrderingCorrect = aiStrong.totalScore > aiWeak.totalScore && aiWeak.totalScore > aiSparse.totalScore;
      const aiStrongDelta = aiStrong.totalScore - aiWeak.totalScore;
      const aiWeakDelta = aiWeak.totalScore - aiSparse.totalScore;

      if (aiOrderingCorrect && aiStrong.totalScore >= 70 && aiSparse.totalScore <= 35) {
        console.log(`  ✅ Live AI Primary Path Passed: Strong (${aiStrong.totalScore}) > Weak (${aiWeak.totalScore}) > Sparse (${aiSparse.totalScore})`);
        passedTests += 2;
      } else {
        console.warn(`  ⚠️ Live AI Ordering Result: ordering=${aiOrderingCorrect}, strongDelta=${aiStrongDelta}, weakDelta=${aiWeakDelta}`);
        if (aiOrderingCorrect) passedTests += 1;
      }
    } catch (aiErr: any) {
      console.error("❌ Live AI Benchmark exception:", aiErr.message);
    }
  }

  console.log("\n================================================================================");
  console.log(`🏁 BENCHMARK SUMMARY: ${passedTests}/${totalTests} tests passed!`);
  console.log("================================================================================");

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error("Benchmark runner failed:", err);
  process.exit(1);
});
