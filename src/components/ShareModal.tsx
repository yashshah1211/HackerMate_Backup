"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, MessageCircle, Send, Share2, Trophy, Users } from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { Button, Dialog, LinkedinIcon, Tape } from "@/components/system";

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

/** Plain "X" wordmark glyph (lucide has no brand icon for it). */
function XGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-4">
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.2h1.7L7.4 4.7H5.58l11.09 14.5Z" />
    </svg>
  );
}

function PlatformLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex h-11 min-w-0 items-center gap-2.5 rounded-md border border-line-strong bg-raised px-3 text-[13px] font-medium text-ink transition-colors hover:border-ink-4 hover:bg-hover [&_svg]:size-4 [&_svg]:shrink-0"
    >
      <span className="text-ink-3">{icon}</span>
      <span className="truncate">{label}</span>
    </a>
  );
}

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
      console.error("[ShareModal] Copy failed:", err);
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
      } catch {
        // User cancelled or share failed silently
      }
    }
  };

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Dialog open={isOpen} onClose={onClose} title={title} description={subtitle}>
      <div className="space-y-5">
        {/* Preview */}
        {type === "team" && (
          <div className="rounded-md border border-line bg-sunken p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Tape tone="accent" icon={<Users />}>
                Team recruiting
              </Tape>
              <span className="caps-label text-ink-3">HackerMate</span>
            </div>
            <p className="truncate text-[14px] font-semibold text-ink">{metadata?.teamName || "Team"}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">
              {metadata?.hackathonName ? `Building for ${metadata.hackathonName}` : "Recruiting teammates on HackerMate"}
            </p>
          </div>
        )}

        {type === "badge" && (
          <div className="rounded-md border border-line bg-sunken p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <Tape tone="info" icon={<Trophy />}>
                {metadata?.rankTitle || "Verified Achievement"}
              </Tape>
            </div>
            <p className="text-[14px] font-semibold text-ink">{metadata?.badgeTitle || "Verified Achievement"}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">Verified by {metadata?.issuerName || "HackerMate Partner Network"}</p>
          </div>
        )}

        {/* Native Mobile Share Button (if supported) */}
        {canNativeShare && (
          <Button variant="inverse" className="w-full" icon={<Share2 />} onClick={handleNativeShare}>
            Open device share sheet
          </Button>
        )}

        <div>
          <p className="mb-2 caps-label text-ink-3">Share to</p>
          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            <PlatformLink href={whatsappUrl} icon={<MessageCircle />} label="WhatsApp" />
            <PlatformLink href={linkedinUrl} icon={<LinkedinIcon />} label="LinkedIn" />
            <PlatformLink href={twitterUrl} icon={<XGlyph />} label="X / Twitter" />
            <PlatformLink href={telegramUrl} icon={<Send />} label="Telegram" />
          </div>
        </div>

        {/* Copy Link */}
        <div>
          <p className="mb-2 caps-label text-ink-3">Link</p>
          <div className="flex items-center gap-2 rounded-md bg-sunken p-1 ring-1 ring-inset ring-line-strong">
            <input
              type="text"
              readOnly
              value={shareUrl}
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 truncate bg-transparent px-2 font-mono text-[12px] text-ink-2 outline-none"
            />
            <Button
              variant={copied ? "secondary" : "primary"}
              icon={copied ? <Check className="text-ok" /> : <Copy />}
              onClick={handleCopyLink}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
