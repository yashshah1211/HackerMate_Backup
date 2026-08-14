"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Upload, Layers, Cpu, Palette, Users, FileText, CheckCircle2 } from "lucide-react";

export default function StandalonePPTEvaluatorPage() {
  const [userTeams, setUserTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUserTeams() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("team_members")
        .select("teams(id, name, description)")
        .eq("user_id", user.id);

      const formatted = (data as any[])?.map((d) => d.teams).filter(Boolean) || [];
      setUserTeams(formatted);
      setLoading(false);
    }

    loadUserTeams();
  }, []);

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-20">
      {/* Hero */}
      <div className="text-center max-w-3xl mx-auto mb-12 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-mono mb-4">
          <span>SMART INDIA HACKATHON 2026</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
          Instant AI Pitch Deck Evaluator
        </h1>
        <p className="text-zinc-400 text-sm sm:text-base mt-4 leading-relaxed">
          Benchmark your 6-slide presentation deck against the official SIH 2026 rubric. Get instant scores for Novelty, Technical Architecture, UI/UX, and Squad Balance with slide-by-slide jury feedback.
        </p>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
        <div className="card p-5 border-zinc-800 bg-zinc-950/40">
          <Layers className="w-6 h-6 text-violet-400 mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">Problem & Novelty (25 pts)</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Evaluates differentiation, uniqueness, and problem statement alignment.
          </p>
        </div>
        <div className="card p-5 border-zinc-800 bg-zinc-950/40">
          <Cpu className="w-6 h-6 text-cyan-400 mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">Technical Architecture (35 pts)</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Checks data pipeline, database choices, models, and technical risk mitigation.
          </p>
        </div>
        <div className="card p-5 border-zinc-800 bg-zinc-950/40">
          <Palette className="w-6 h-6 text-emerald-400 mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">UI/UX & Impact (25 pts)</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Reviews prototype links, slide visual density, and quantified metrics.
          </p>
        </div>
        <div className="card p-5 border-zinc-800 bg-zinc-950/40">
          <Users className="w-6 h-6 text-amber-400 mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">Team & Rules (15 pts)</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Ensures 6-member squad size, female builder requirement, and 6-slide max limit.
          </p>
        </div>
      </div>

      {/* Select Team or Go to Workspace */}
      <div className="card p-8 border-violet-500/20 bg-zinc-950/80 max-w-2xl mx-auto text-center">
        <h2 className="text-xl font-bold text-white mb-2">Select Your Team to Run Evaluation</h2>
        <p className="text-xs text-zinc-400 mb-6">
          Pitch evaluations are saved directly to your team workspace so teammates can collaborate on revisions.
        </p>

        {loading ? (
          <div className="py-6 text-xs text-zinc-500 font-mono">Loading teams...</div>
        ) : userTeams.length > 0 ? (
          <div className="space-y-3">
            {userTeams.map((team) => (
              <Link
                key={team.id}
                href={`/teams/${team.id}/workspace?tab=ppt`}
                className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:border-violet-500/40 hover:bg-zinc-900 transition-all group"
              >
                <div className="text-left">
                  <div className="text-sm font-bold text-white group-hover:text-violet-400 transition-colors">
                    {team.name}
                  </div>
                  <div className="text-xs text-zinc-500 line-clamp-1">
                    {team.description || "Open workspace pitch diagnostic"}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-violet-400 group-hover:translate-x-1 transition-transform">
                  <span>Evaluate Deck</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-zinc-400">
              You haven&apos;t joined or created a team yet. Create or join a team on HackerMate to evaluate your pitch deck.
            </p>
            <Link
              href="/teams"
              className="btn btn-primary inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg"
            >
              <span>Explore Teams →</span>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
