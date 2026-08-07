"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

export type PartnerSlide = {
  id: string;
  tag: string;
  title: string;
  description: string;
  ctaText: string;
  href: string;
  gradient: string;
  logoType: "aethos" | "gamnexis" | "axcentra" | "morrow" | "orvix";
};

const PARTNER_SLIDES: PartnerSlide[] = [
  {
    id: "aethos",
    tag: "FEATURED PARTNER HACKATHON",
    title: "HackerMate × ÆTHOS — Day Zero",
    description: "Build next-gen AI, Web3, & Open Innovation solutions! Official national hackathon by Alpha Forge. Connect with compatible builders, form squads, & build.",
    ctaText: "Explore ÆTHOS Portal",
    href: "/partners/aethos",
    gradient: "from-[#F59E0B] via-red-500 to-[#EF4444]",
    logoType: "aethos",
  },
  {
    id: "orvix",
    tag: "FEATURED NATIONAL ONLINE HACKATHON",
    title: "HackerMate × Orvix Hackathon 2026",
    description: "Build AI, Web, Mobile, Web3 & Open Innovation solutions! National online hackathon by NIMBLUX. Find compatible teammates & join recruiting squads.",
    ctaText: "Explore Orvix Hackathon Portal",
    href: "/partners/orvix",
    gradient: "from-[#8B5CF6] via-purple-500 to-[#06B6D4]",
    logoType: "orvix",
  },
  {
    id: "morrow",
    tag: "FEATURED OPEN-SOURCE HACKATHON",
    title: "HackerMate × Morrow 1.0 — Makers Need More",
    description: "Build & ship open-source solutions at the speed of thought! Join the global open-source hackathon by MnM. Connect with teammates and build together.",
    ctaText: "Explore Morrow 1.0 Portal",
    href: "/partners/morrow",
    gradient: "from-[#6366F1] via-emerald-500 to-[#10B981]",
    logoType: "morrow",
  },
  {
    id: "gamnexis",
    tag: "FEATURED GAMEDEV & AI HACKATHON",
    title: "HackerMate × Gamnexis — Puzzle Masters 2026",
    description: "Build an addictive puzzle game in this national-level GameDev & AI innovation challenge. Connect with teammates, join recruiting teams, and compete.",
    ctaText: "Explore Gamnexis Portal",
    href: "/partners/gamnexis",
    gradient: "from-[#0284C7] via-sky-500 to-[#B4F461]",
    logoType: "gamnexis",
  },
  {
    id: "axcentra",
    tag: "FEATURED PARTNER PORTAL",
    title: "HackerMate × Axcentra Partner Portal",
    description: "Discover exclusive team tracks, connect with Axcentra mentors, and build solutions directly for our enterprise partners.",
    ctaText: "Explore Axcentra Portal",
    href: "/partners/axcentra",
    gradient: "from-[#B4F461] via-blue-500 to-indigo-600",
    logoType: "axcentra",
  },
];

export default function PartnerBannerCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % PARTNER_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [isPaused]);

  const currentSlide = PARTNER_SLIDES[currentIndex];

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      setCurrentIndex((prev) => (prev + 1) % PARTNER_SLIDES.length);
    } else if (isRightSwipe) {
      setCurrentIndex((prev) => (prev - 1 + PARTNER_SLIDES.length) % PARTNER_SLIDES.length);
    }

    touchStartX.current = null;
    touchEndX.current = null;
    setIsPaused(false);
  };

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 p-6 md:p-10 shadow-xl transition-all mb-10 group cursor-pointer"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background Animated Gradient Orb */}
      <div
        className={`absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-20 dark:opacity-30 pointer-events-none transition-all duration-1000 bg-gradient-to-br ${currentSlide.gradient}`}
      />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div className="space-y-4 max-w-2xl">
          {/* Badge & Partner Logo */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3.5 py-1 rounded-full text-[10px] md:text-xs font-mono font-extrabold uppercase bg-emerald-100 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20 tracking-wider">
              ⚡ {currentSlide.tag}
            </span>

            {/* Custom Partner Logo Badges */}
            <div className="flex items-center gap-2 pl-1 border-l border-zinc-200 dark:border-zinc-800">
              {currentSlide.logoType === "aethos" ? (
                <div className="flex items-center gap-2">
                  <img
                    src="/partners/aethos-logo.jpg"
                    alt="ÆTHOS Day Zero Logo"
                    className="h-8 md:h-9 w-auto object-contain rounded-lg shadow-sm border border-amber-500/30"
                  />
                  <img
                    src="/partners/alpha-forge-logo.jpg"
                    alt="Alpha Forge Logo"
                    className="h-8 md:h-9 w-auto object-contain rounded-lg shadow-sm border border-amber-500/30"
                  />
                  <span className="font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 text-lg md:text-xl font-mono">
                    ÆTHOS
                  </span>
                </div>
              ) : currentSlide.logoType === "orvix" ? (
                <div className="flex items-center gap-2">
                  <img
                    src="/partners/orvix-logo-cropped.png"
                    alt="Orvix Hackathon Logo"
                    className="h-8 md:h-9 w-auto object-contain rounded-lg shadow-sm"
                  />
                  <span className="font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-violet-400 to-cyan-400 text-lg md:text-xl font-mono">
                    ORVIX
                  </span>
                </div>
              ) : currentSlide.logoType === "morrow" ? (
                <div className="flex items-center gap-2">
                  <img
                    src="/partners/morrow-icon.png"
                    alt="Morrow 1.0 Logo"
                    className="h-8 md:h-9 w-auto object-contain rounded-lg shadow-sm"
                  />
                  <span className="font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-emerald-400 to-teal-400 text-lg md:text-xl font-mono">
                    MORROW 1.0
                  </span>
                </div>
              ) : currentSlide.logoType === "gamnexis" ? (
                <div className="flex items-center gap-2">
                  <img
                    src="/partners/gamnexis-logo.jpg"
                    alt="Gamnexis Logo"
                    className="h-8 md:h-9 w-auto object-contain rounded-lg shadow-sm"
                  />
                  <span className="font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-emerald-400 text-lg md:text-xl font-mono">
                    GAMNEXIS
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <img
                    src="/partners/axcentra-icon-only-transparent.png"
                    alt="Axcentra Logo"
                    className="h-8 md:h-9 w-auto object-contain rounded-lg shadow-sm"
                  />
                  <span className="font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-indigo-400 text-lg md:text-xl font-mono">
                    AXCENTRA
                  </span>
                </div>
              )}
            </div>
          </div>

          <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white leading-tight">
            {currentSlide.title}
          </h2>

          <p className="text-xs md:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed font-sans max-w-xl">
            {currentSlide.description}
          </p>

          <div className="pt-2 flex items-center gap-4">
            <Link
              href={currentSlide.href}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs md:text-sm transition-all shadow-lg shadow-emerald-500/20 hover:scale-[1.02] flex items-center gap-2 cursor-pointer"
            >
              {currentSlide.ctaText} →
            </Link>

            <span className="text-[11px] text-zinc-600 dark:text-zinc-300 font-mono font-medium hidden sm:inline">
              Co-branded Team Builder Portal
            </span>
          </div>
        </div>

        {/* Carousel Navigation Indicators */}
        <div className="flex md:flex-col items-center gap-2 self-center md:self-auto shrink-0 bg-zinc-100 dark:bg-zinc-900/80 p-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800/80">
          {PARTNER_SLIDES.map((slide, idx) => (
            <button
              key={slide.id}
              onClick={() => setCurrentIndex(idx)}
              className={`h-2.5 rounded-full transition-all cursor-pointer ${
                currentIndex === idx
                  ? "w-8 bg-emerald-500"
                  : "w-2.5 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600"
              }`}
              title={`Go to ${slide.title}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
