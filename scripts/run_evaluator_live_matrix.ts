import fs from "fs";
import path from "path";
import { runTrackAwareEvaluation } from "../src/lib/evaluator/trackEvaluatorEngine";
import { EvaluationInput } from "../src/lib/evaluator/evaluatorTypes";

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

interface TestMatrixCase {
  trackName: string;
  hackathonName: string;
  category: "GREAT" | "BAD_OFF_TOPIC";
  input: EvaluationInput;
}

const testCases: TestMatrixCase[] = [
  // ── 1. WEB DEV TRACK: STAMPERS National Hackathon 2026 ──
  {
    trackName: "Web Development & Full-Stack",
    hackathonName: "STAMPERS National Hackathon 2026",
    category: "GREAT",
    input: {
      trackId: "web_dev",
      psTitle: "NexusFlow: Distributed Real-Time Micro-Frontend Collaboration Hub",
      solutionDescription: "High-throughput real-time collaboration workspace for distributed engineering teams. Features sub-30ms CRDT state synchronization, integrated schema-to-mock API generation, optimistic UI updates, and role-based access control.",
      techStack: "Next.js 15 (App Router + React Server Components), TypeScript 5.5, Tailwind CSS v4, PostgreSQL with Supabase RLS, Prisma ORM, Redis (Upstash) for sub-10ms presence caching, Yjs CRDTs, Docker, Vercel Edge Middleware.",
      architectureDetails: "Clients connect via Yjs WebSockets to edge gateways with optimistic local state updates. Backend executes relational ACID transactions on PostgreSQL with row-level security (RLS) policies per team workspace. Database indexes applied on (team_id, updated_at). Sensitive endpoints protected by sliding-window Redis rate-limiting (100 req/min) and HMAC-signed webhook validation. Background export jobs queued asynchronously with BullMQ worker pools.",
      repoUrl: "https://github.com/hackermate/nexusflow-web",
      demoUrl: "https://nexusflow.vercel.app",
    },
  },
  {
    trackName: "Web Development & Full-Stack",
    hackathonName: "STAMPERS National Hackathon 2026",
    category: "BAD_OFF_TOPIC",
    input: {
      trackId: "web_dev",
      psTitle: "Cat Video Browser",
      solutionDescription: "A website where people can watch random funny cat videos and click a like button with sound effects.",
      techStack: "HTML, CSS, jQuery",
      architectureDetails: "I put videos on the webpage using html video tags and added basic css styling.",
    },
  },

  // ── 2. AI / GENAI TRACK: Axcentra x All India Hackathon ──
  {
    trackName: "AI, GenAI & Agentic Systems",
    hackathonName: "Axcentra x All India Hackathon",
    category: "GREAT",
    input: {
      trackId: "ai_genai",
      psTitle: "BioMedSense: Multi-Agent Clinical Trial Protocol & Drug Target Verification System",
      solutionDescription: "An AI-powered clinical intelligence system that parses 500+ page clinical trial protocol PDFs and biomedical ontologies with sub-second semantic retrieval, hybrid sparse-dense re-ranking, and deterministic hallucination guardrails.",
      techStack: "Python 3.11, FastAPI, PyTorch, LlamaIndex, pgvector on PostgreSQL, BGE-M3 hybrid embeddings, Cohere ReRank v3, vLLM inference server, Next.js 15 dashboard, Docker.",
      architectureDetails: "Documents ingested via hierarchical chunking (512 token chunks with 64 overlap + parent-document metadata). Retrieval fuses BM25 sparse search and dense vector cosine similarity via Reciprocal Rank Fusion (RRF). Queries pass through a cross-encoder re-ranker before entering a 3-stage agent loop (Researcher -> Drafter -> Auditor) in LangGraph. Ground-truth citation engine maps every claim to source PubMed/clinical trial SHA-256 hashes, rejecting responses with confidence < 0.92 to prevent hallucinations.",
      repoUrl: "https://github.com/hackermate/biomedsense-ai",
      demoUrl: "https://biomedsense-demo.vercel.app",
    },
  },
  {
    trackName: "AI, GenAI & Agentic Systems",
    hackathonName: "Axcentra x All India Hackathon",
    category: "BAD_OFF_TOPIC",
    input: {
      trackId: "ai_genai",
      psTitle: "Super AI Fortune Teller",
      solutionDescription: "An AI that asks for your birthdate and tells your future zodiac horoscope using ChatGPT.",
      techStack: "Streamlit, OpenAI API",
      architectureDetails: "User enters birth date, sends prompt to ChatGPT, shows the fortune text on screen.",
    },
  },

  // ── 3. SIH TRACK: Smart India Hackathon 2026 (SIH Internal Round) ──
  {
    trackName: "Smart India Hackathon (SIH)",
    hackathonName: "Smart India Hackathon 2026 (SIH Internal Round)",
    category: "GREAT",
    input: {
      trackId: "sih",
      psTitle: "JalDrishti: IoT Acoustic Telemetry & Satellite GIS Water Pipeline Anomaly Detection",
      solutionDescription: "Problem Statement ID 1729 (Ministry of Jal Shakti): Municipal water networks lose 38% of drinking water to undetected subterranean pipeline bursts. JalDrishti deploys non-invasive acoustic vibration telemetry paired with satellite GIS mapping to detect underground leaks within 15 meters in real-time.",
      techStack: "ESP32 Acoustic Vibration Sensors (I2S MEMS), LoRaWAN Gateway, Next.js 15 Web Dashboard, Python FastAPI, TimescaleDB (Postgres time-series), XGBoost anomaly classifier, Mapbox GL JS.",
      architectureDetails: "Slide 1: Problem Statement 1729 & Ministry alignment. Slide 2: Pipeline acoustic wave transient physics. Slide 3: Telemetry pipeline: ESP32 -> LoRaWAN -> MQTT Broker -> TimescaleDB -> FastAPI -> Next.js GIS UI. Slide 4: 36h bench execution roadmap with hardware bench-test and synthetic leak test rig. Slide 5: Quantified impact: 42M liters saved, ₹3.2 Cr annual municipal loss prevention, 85% reduction in repair response time. Slide 6: IEEE citations on pipe acoustic transients, Jal Jeevan Mission open dataset integration.",
      repoUrl: "https://github.com/hackermate/jaldrishti-sih",
      demoUrl: "https://jaldrishti-sih.in",
    },
  },
  {
    trackName: "Smart India Hackathon (SIH)",
    hackathonName: "Smart India Hackathon 2026 (SIH Internal Round)",
    category: "BAD_OFF_TOPIC",
    input: {
      trackId: "sih",
      psTitle: "Meme Sharing App",
      solutionDescription: "An app for college students to share funny engineering memes during exam weeks.",
      techStack: "React, Firebase",
      architectureDetails: "Images are uploaded to firebase storage and listed in a feed.",
    },
  },
];

async function runMatrix() {
  console.log("================================================================================");
  console.log("🧪 RUNNING 6-WAY EVALUATOR MATRIX (3 Tracks x [Great vs Bad/Off-Topic])");
  console.log("================================================================================\n");

  const results: any[] = [];

  for (const tc of testCases) {
    console.log(`⏳ Evaluating: [${tc.trackName}] | Hackathon: "${tc.hackathonName}" | Category: ${tc.category}`);
    const evalRes = await runTrackAwareEvaluation(tc.input, true);
    console.log(`   👉 Score: ${evalRes.totalScore}/100 | Grade: ${evalRes.grade} | Engine: ${evalRes.usedAiEngine ? "Gemini AI" : "Heuristic"}\n`);

    results.push({
      track: tc.trackName,
      hackathon: tc.hackathonName,
      category: tc.category,
      title: tc.input.psTitle,
      totalScore: evalRes.totalScore,
      grade: evalRes.grade,
      subScores: evalRes.subScores,
      usedAi: evalRes.usedAiEngine,
      strengths: evalRes.strengths,
      redFlags: evalRes.redFlags,
      architectureSuggestions: evalRes.architectureSuggestions,
      recommendedRoles: evalRes.recommendedRoles,
    });
  }

  const outputPath = path.resolve(__dirname, "../evaluator_matrix_results.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`✅ Completed 6-way evaluation matrix. Results saved to: ${outputPath}`);
}

runMatrix().catch((err) => {
  console.error("Matrix execution failed:", err);
  process.exit(1);
});
