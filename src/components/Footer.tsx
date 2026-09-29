"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail } from "lucide-react";
import { HMMark } from "@/components/shell/HMMark";
import { cn } from "@/lib/utils";

const PRODUCT = [
  { href: "/developers", label: "Builders" },
  { href: "/teams", label: "Teams" },
  { href: "/hackathons", label: "Hackathons" },
  { href: "/hackathons/sih", label: "SIH team builder" },
];

const COMPANY = [
  { href: "/contact", label: "Contact" },
  { href: "/faq", label: "FAQ" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
];

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function Column({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <p className="caps-label text-ink-3">{title}</p>
      <ul className="mt-2">
        {links.map((l) => (
          <li key={l.href}>
            {/* 32px rows keep list links comfortable to tap. */}
            <Link href={l.href} className="inline-flex min-h-8 items-center text-[14px] text-ink-2 transition-colors hover:text-ink">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Footer() {
  // The landing ends on its own full-bleed sign-off; other pages need breathing room.
  const landing = usePathname() === "/";
  return (
    <footer className={cn("relative z-20 w-full border-t border-line bg-canvas", !landing && "mt-16 md:mt-24")}>
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-10 px-5 py-12 md:grid-cols-12 md:px-8 md:py-14">
        <div className="md:col-span-6">
          <Link href="/" className="inline-flex items-center gap-2 rounded-md" aria-label="HackerMate home">
            <HMMark size={28} className="rounded-[7px]" />
            <span className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink [font-variation-settings:'wdth'_90]">HackerMate</span>
          </Link>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-ink-3">
            The team operating system for hackathon builders. Find teammates, form a team with every skill covered, and build together until you
            submit.
          </p>
          <div className="mt-5 flex items-center gap-1">
            <a
              href="mailto:contacthackermate@gmail.com"
              aria-label="Email HackerMate"
              className="inline-flex size-9 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            >
              <Mail className="size-[18px]" />
            </a>
            <a
              href="https://www.instagram.com/hackermate.in?igsh=dnRndWdtcmNrdXBw&utm_source=ig_contact_invite"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="HackerMate on Instagram"
              className="inline-flex size-9 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            >
              <InstagramIcon className="size-[18px]" />
            </a>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-8 md:col-span-6">
          <Column title="Product" links={PRODUCT} />
          <Column title="Company" links={COMPANY} />
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-2 px-5 py-5 font-mono text-[12px] text-ink-3 md:px-8">
          <span>© {new Date().getFullYear()} HackerMate</span>
          <span>Built for hackathon builders.</span>
        </div>
      </div>
    </footer>
  );
}
