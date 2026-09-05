"use client";

import { useState } from "react";
import {
  X,
  Share2,
  Check,
  Award,
  Shield,
  Layers,
  Users,
  Code2,
  Calendar,
  ExternalLink,
  QrCode,
} from "lucide-react";

interface BuilderPassportProps {
  isOpen: boolean;
  onClose: () => void;
  profile: {
    id: string;
    full_name: string;
    headline?: string | null;
    college?: string | null;
    branch?: string | null;
    grad_year?: string | number | null;
    avatar_url?: string | null;
    skills?: string[] | null;
    created_at?: string;
    gender?: string | null;
  };
  stats?: {
    teamsCount?: number;
    hackathonsCount?: number;
    connectionsCount?: number;
    topPitchScore?: number | null;
    topPitchGrade?: string | null;
  };
}

export default function BuilderPassportModal({
  isOpen,
  onClose,
  profile,
  stats = {},
}: BuilderPassportProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const siteUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://hackermate.in";
  const passportUrl = `${siteUrl}/profile/${profile.id}?passport=true`;

  const shareText = `🚀 Check out my official Builder Passport on HackerMate for SIH & tech hackathons!\n\nSkills: ${(profile.skills || []).slice(0, 4).join(", ")}\nExplore my verified portfolio & connect with me: ${passportUrl}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(passportUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(passportUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShareTwitter = () => {
    const text = `Check out my verified HackerMate Builder Passport! Ready to build for SIH 2026 🚀 ${passportUrl}`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const joinedYear = profile.created_at
    ? new Date(profile.created_at).getFullYear()
    : 2026;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl animate-scale-in text-left">
        {/* Top Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors z-20 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Digital Passport Card */}
        <div className="p-6 sm:p-8 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black relative overflow-hidden">
          {/* Subtle Ambient Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* Passport Header Bar */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-6 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center font-black text-violet-400 text-sm">
                HM
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-violet-400 font-bold block">
                  HACKERMATE PASSPORT
                </span>
                <span className="text-xs text-zinc-400 font-mono">
                  VERIFIED BUILDER ID #{profile.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
              <Shield className="w-3 h-3" />
              <span>VERIFIED</span>
            </div>
          </div>

          {/* Builder Identity Profile Row */}
          <div className="flex items-start gap-4 mb-6 relative z-10">
            <div className="relative">
              <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-zinc-800 border-2 border-violet-500/40 overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-2xl text-violet-300 shadow-lg">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  profile.full_name.charAt(0).toUpperCase()
                )}
              </div>
              <span className="absolute -bottom-1.5 -right-1.5 bg-zinc-900 border border-zinc-700 px-1.5 py-0.5 rounded text-[9px] font-mono text-zinc-300">
                CLASS OF {profile.grad_year || "2026"}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-white tracking-tight truncate">
                {profile.full_name}
              </h2>
              <p className="text-xs text-violet-300 font-medium mt-0.5 line-clamp-1">
                {profile.headline || "Full-Stack Software Builder"}
              </p>
              <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
                🏫 {profile.college || "Engineering College"}
                {profile.branch ? ` • ${profile.branch}` : ""}
              </p>
              <p className="text-[10px] text-zinc-500 font-mono mt-1">
                Builder since {joinedYear}
              </p>
            </div>
          </div>

          {/* Verified Stats Row */}
          <div className="grid grid-cols-3 gap-2.5 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 mb-6 relative z-10 text-center">
            <div>
              <span className="text-[9px] font-mono uppercase text-zinc-400 block mb-0.5">
                Teams Built
              </span>
              <span className="text-base font-extrabold text-white">
                {stats.teamsCount ?? 1}
              </span>
            </div>
            <div className="border-x border-zinc-800">
              <span className="text-[9px] font-mono uppercase text-zinc-400 block mb-0.5">
                Hackathons
              </span>
              <span className="text-base font-extrabold text-emerald-400">
                {stats.hackathonsCount ?? 1}
              </span>
            </div>
            <div>
              <span className="text-[9px] font-mono uppercase text-zinc-400 block mb-0.5">
                AI Pitch Score
              </span>
              <span className="text-base font-extrabold text-amber-400">
                {stats.topPitchScore ? `${stats.topPitchScore}/100` : "Verified"}
              </span>
            </div>
          </div>

          {/* Core Verified Stack */}
          <div className="mb-6 relative z-10">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold block mb-2">
              Verified Tech Stack
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(profile.skills || ["React", "TypeScript", "Node.js", "AI/ML"]).slice(0, 8).map((skill, idx) => (
                <span
                  key={idx}
                  className="text-xs px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 font-mono font-medium hover:border-violet-500/40 transition-colors"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Holographic Security Strip */}
          <div className="p-2.5 rounded-xl bg-violet-950/20 border border-violet-500/20 flex items-center justify-between text-[10px] font-mono text-zinc-400 relative z-10">
            <div className="flex items-center gap-2">
              <Code2 className="w-3.5 h-3.5 text-violet-400" />
              <span>HackerMate Official Teammate Network</span>
            </div>
            <span className="text-violet-400 font-bold">SIH 2026 READY</span>
          </div>
        </div>

        {/* Social Sharing Actions Footer */}
        <div className="p-6 bg-zinc-900 border-t border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white uppercase font-mono tracking-wider">
              Share Your Builder Passport
            </span>
            <button
              onClick={handleCopyLink}
              className="text-xs text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Link Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleShareLinkedIn}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#0A66C2] hover:bg-[#004182] text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <span>LinkedIn</span>
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <span>WhatsApp</span>
            </button>
            <button
              onClick={handleShareTwitter}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors cursor-pointer border border-zinc-700 shadow-xs"
            >
              <span>Twitter / X</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
