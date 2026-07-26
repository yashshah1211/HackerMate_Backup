"use client";

import { useState } from "react";
import { useNotification } from "@/context/NotificationContext";

type ShareModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  shareUrl: string;
  shareText: string;
  type: "team" | "badge" | "profile";
  metadata?: {
    teamName?: string;
    hackathonName?: string;
    badgeTitle?: string;
    rankTitle?: string;
    issuerName?: string;
  };
};

export default function ShareModal({
  isOpen,
  onClose,
  title,
  subtitle,
  shareUrl,
  shareText,
  type,
  metadata,
}: ShareModalProps) {
  const { showToast } = useNotification();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const fullShareText = `${shareText}\n\n${shareUrl}`;

  // Platform specific URLs
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(fullShareText)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast("Link copied to clipboard!", "success");
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      showToast("Failed to copy link", "error");
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
          url: shareUrl,
        });
        showToast("Shared successfully!", "success");
      } catch (err) {
        // User cancelled or share failed silently
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Gradient Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#B4F461] via-blue-500 to-indigo-600" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>{title}</span>
            </h3>
            {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Visual Preview Card */}
        <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80 mb-5 relative">
          {type === "team" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#B4F461] font-bold">
                  🚀 Team Recruiting
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">HackerMate Match</span>
              </div>
              <h4 className="text-sm font-bold text-white mb-1">
                {metadata?.teamName || "Team"}
              </h4>
              <p className="text-xs text-zinc-400">
                {metadata?.hackathonName ? `Building for ${metadata.hackathonName}` : "Recruiting teammates on HackerMate"}
              </p>
            </div>
          )}

          {type === "badge" && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xl">🏆</span>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold">
                  {metadata?.rankTitle || "Verified Achievement"}
                </span>
              </div>
              <h4 className="text-sm font-bold text-white mb-1">
                {metadata?.badgeTitle || "Verified Achievement"}
              </h4>
              <p className="text-xs text-zinc-400">
                Verified by {metadata?.issuerName || "HackerMate x Axcentra"}
              </p>
            </div>
          )}
        </div>

        {/* Native Mobile Share Button (if supported) */}
        {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
          <button
            onClick={handleNativeShare}
            className="w-full mb-4 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition cursor-pointer"
          >
            <span>📱 Open Device Share Sheet</span>
          </button>
        )}

        {/* 1-Tap Share Platform Grid */}
        <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-2.5">
          Share to Social Platforms:
        </p>
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          {/* WhatsApp */}
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 flex items-center gap-2.5 text-xs font-bold transition cursor-pointer"
          >
            <span className="text-lg">💬</span>
            <span>WhatsApp</span>
          </a>

          {/* LinkedIn */}
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noreferrer"
            className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 flex items-center gap-2.5 text-xs font-bold transition cursor-pointer"
          >
            <span className="text-lg">💼</span>
            <span>LinkedIn</span>
          </a>

          {/* Twitter / X */}
          <a
            href={twitterUrl}
            target="_blank"
            rel="noreferrer"
            className="p-3 rounded-xl bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-800 text-zinc-200 hover:text-white flex items-center gap-2.5 text-xs font-bold transition cursor-pointer"
          >
            <span className="text-lg">𝕏</span>
            <span>Twitter / X</span>
          </a>

          {/* Telegram */}
          <a
            href={telegramUrl}
            target="_blank"
            rel="noreferrer"
            className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 flex items-center gap-2.5 text-xs font-bold transition cursor-pointer"
          >
            <span className="text-lg">✈️</span>
            <span>Telegram</span>
          </a>
        </div>

        {/* Copy Link Input Bar */}
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-zinc-950 border border-zinc-800">
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="flex-1 bg-transparent px-3 text-xs text-zinc-300 outline-none font-mono truncate"
          />
          <button
            onClick={handleCopyLink}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              copied
                ? "bg-emerald-500 text-black"
                : "bg-[#B4F461] hover:bg-[#a3e64f] text-black"
            }`}
          >
            {copied ? "Copied! ✓" : "Copy Link"}
          </button>
        </div>
      </div>
    </div>
  );
}
