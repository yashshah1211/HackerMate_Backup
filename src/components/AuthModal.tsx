"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ModernOAuthSignIn } from "@/components/ui/modern-animated-sign-in";
import { X } from "lucide-react";

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
  subtitle = "Connect with Google or GitHub in 1 tap to join teams and live hackathons.",
  nextUrl,
}: AuthModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 w-8 h-8 rounded-full bg-zinc-900/90 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-lg"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 21st.dev Dual-Pane Animated Sign In */}
        <ModernOAuthSignIn
          title={title}
          subtitle={subtitle}
          nextUrl={nextUrl}
          className="min-h-[480px]"
        />
      </div>
    </div>
  );
}
