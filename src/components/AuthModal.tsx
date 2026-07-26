"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  nextUrl?: string;
};

export default function AuthModal({
  isOpen,
  onClose,
  title = "Sign In to HackerMate",
  subtitle = "Sign in with Google or GitHub in 1 tap to apply, join teams, and chat with teammates.",
  nextUrl,
}: AuthModalProps) {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "github" | null>(null);

  if (!isOpen) return null;

  const handleOAuthSignIn = async (provider: "google" | "github") => {
    setLoadingProvider(provider);
    const targetUrl = nextUrl || (typeof window !== "undefined" ? window.location.href : "/dashboard");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
    const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(targetUrl)}`;

    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Lime Gradient Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#B4F461] via-emerald-400 to-teal-500" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer"
        >
          ✕
        </button>

        {/* Logo Badge */}
        <div className="w-12 h-12 rounded-2xl bg-[#B4F461]/10 border border-[#B4F461]/30 flex items-center justify-center text-[#B4F461] text-2xl mx-auto mb-4 font-bold shadow-lg shadow-[#B4F461]/10">
          🚀
        </div>

        <h3 className="text-xl font-bold text-white mb-1.5">{title}</h3>
        <p className="text-xs text-zinc-400 leading-relaxed mb-6 max-w-xs mx-auto">
          {subtitle}
        </p>

        {/* OAuth Buttons Container */}
        <div className="space-y-3 mb-4">
          {/* 1-Tap Google Button */}
          <button
            onClick={() => handleOAuthSignIn("google")}
            disabled={!!loadingProvider}
            className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 text-black font-bold text-xs flex items-center justify-center gap-3 transition cursor-pointer shadow-lg shadow-white/10 disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{loadingProvider === "google" ? "Connecting to Google..." : "Continue with Google (1-Tap)"}</span>
          </button>

          {/* 1-Tap GitHub Button */}
          <button
            onClick={() => handleOAuthSignIn("github")}
            disabled={!!loadingProvider}
            className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-white font-bold text-xs flex items-center justify-center gap-3 border border-zinc-700 transition cursor-pointer shadow-lg disabled:opacity-50"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>{loadingProvider === "github" ? "Connecting to GitHub..." : "Continue with GitHub"}</span>
          </button>
        </div>

        <p className="text-[10px] font-mono text-zinc-500">
          No passwords required • Takes 5 seconds
        </p>
      </div>
    </div>
  );
}
