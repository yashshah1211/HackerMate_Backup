import Link from "next/link";
import { Bot, Building2, Users, Award, ShieldCheck, ArrowRight, MessageSquareCode } from "lucide-react";

export const metadata = {
  title: "Partner & Organizer Solutions | HackerMate",
  description: "Official team-building operating system, Discord Team Finder Bot, and co-branded portals for hackathon organizers.",
};

export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-indigo-500 selection:text-white pb-20">
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-30">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600 rounded-full blur-[128px]" />
        <div className="absolute top-1/3 right-0 w-96 h-96 bg-emerald-600 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-12">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
            <Building2 className="w-3.5 h-3.5" /> For Hackathon Organizers & Tech Fests
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
            Supercharge Your Hackathon Team Formation
          </h1>
          <p className="text-slate-400 text-lg sm:text-xl">
            Empower your solo developers to form balanced, high-skill teams in seconds with HackerMate&apos;s Discord Bot and custom event hubs.
          </p>
        </div>

        {/* Hero Banner: Discord Bot Integration */}
        <div className="mt-16 bg-gradient-to-br from-indigo-950/80 via-slate-900 to-slate-950 border border-indigo-500/20 rounded-3xl p-8 sm:p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Bot className="w-72 h-72 text-indigo-400" />
          </div>

          <div className="max-w-2xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-xs font-medium">
              <Bot className="w-4 h-4" /> HackerMate Discord Bot (New Prototype)
            </div>
            <h2 className="text-3xl font-bold text-white tracking-tight">
              Zero-Spam Team Matching Inside Your Hackathon Discord
            </h2>
            <p className="text-slate-300 leading-relaxed">
              Eliminate noisy <code className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300 text-sm">#looking-for-team</code> channels. The HackerMate Discord bot handles slash commands like <code className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300 text-sm">/find-team</code> and <code className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300 text-sm">/create-team</code>, posting rich interactive cards that link solo devs straight to compatible teams on HackerMate.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <MessageSquareCode className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Slash Command Matching</h4>
                  <p className="text-xs text-slate-400">Users search open teams by role or tech stack directly in chat.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <Users className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-white">1-Click HMAC Invite Links</h4>
                  <p className="text-xs text-slate-400">Instant friction-free team joins without manual approval bottlenecks.</p>
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-wrap gap-4 items-center">
              <a
                href="https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:scale-105"
              >
                <Bot className="w-5 h-5" /> Add Bot to Your Discord
              </a>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-slate-200 border border-slate-700 transition-all"
              >
                Request Organizer Access <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Feature Grid for Organizers */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all">
            <Users className="w-8 h-8 text-indigo-400 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Automated Matchmaking</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Jaccard similarity scoring pairs participants based on complementary frontend, backend, AI/ML, and design skills.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 transition-all">
            <ShieldCheck className="w-8 h-8 text-emerald-400 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Co-branded Event Portals</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Get a custom URL (<code className="text-indigo-300 text-xs">/partners/your-hackathon</code>) with custom banners, logo, and submission tracking.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/40 transition-all">
            <Award className="w-8 h-8 text-amber-400 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Verified Certificates</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Issue cryptographic PDF certificates for winners and participants with public verification URLs.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center bg-slate-900/90 border border-slate-800 rounded-2xl p-8 max-w-2xl mx-auto">
          <h3 className="text-2xl font-bold text-white mb-2">Hosting a Hackathon Soon?</h3>
          <p className="text-slate-400 text-sm mb-6">
            Partner with HackerMate to increase participant completion rates and streamline team management.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 font-bold text-white shadow-xl shadow-indigo-500/20 transition-all"
          >
            Get Started as a Partner <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
