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
  logoType: "gamnexis" | "axcentra";
};

const PARTNER_SLIDES: PartnerSlide[] = [
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

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % PARTNER_SLIDES.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + PARTNER_SLIDES.length) % PARTNER_SLIDES.length);
  };

  const currentSlide = PARTNER_SLIDES[currentIndex];

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-zinc-200/90 dark:border-zinc-900/60 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-md p-8 md:p-10 mb-8 shadow-xl dark:shadow-2xl group transition-all duration-300"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Ambient Radial Glow Effect */}
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-500/10 dark:bg-blue-600/15 blur-3xl pointer-events-none group-hover:bg-blue-500/20 dark:group-hover:bg-blue-600/25 transition-all duration-500" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-[#B4F461]/20 dark:bg-[#B4F461]/10 blur-3xl pointer-events-none group-hover:bg-[#B4F461]/30 dark:group-hover:bg-[#B4F461]/20 transition-all duration-500" />

      {/* Top Accent Gradient Line */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${currentSlide.gradient} transition-all duration-500`}
      />

      {/* Navigation Arrow Controls (Prime Video Style) */}
      <button
        onClick={handlePrev}
        aria-label="Previous Slide"
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-zinc-900/60 dark:bg-zinc-800/80 hover:bg-zinc-900 dark:hover:bg-zinc-700 text-white border border-zinc-200/20 dark:border-zinc-700/50 shadow-xl backdrop-blur-md transition-all duration-200 opacity-80 hover:opacity-100 hover:scale-110 cursor-pointer"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>

      <button
        onClick={handleNext}
        aria-label="Next Slide"
        className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-zinc-900/60 dark:bg-zinc-800/80 hover:bg-zinc-900 dark:hover:bg-zinc-700 text-white border border-zinc-200/20 dark:border-zinc-700/50 shadow-xl backdrop-blur-md transition-all duration-200 opacity-80 hover:opacity-100 hover:scale-110 cursor-pointer"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>

      {/* Main Slide Content */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 relative z-10 px-4 md:px-6">
        {/* Left Column: Text & CTA */}
        <div className="max-w-xl">
          {/* Co-Branded Tag Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 mb-4 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-600 dark:bg-sky-400 animate-pulse" />
            <span>{currentSlide.tag}</span>
          </div>

          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight leading-tight transition-all duration-300">
            {currentSlide.title}
          </h1>

          <p className="text-xs md:text-sm text-zinc-600 dark:text-zinc-400 mt-2.5 leading-relaxed font-sans min-h-[40px]">
            {currentSlide.description}
          </p>

          {/* CTA Button */}
          <div className="mt-6 flex items-center gap-4">
            <Link
              href={currentSlide.href}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-bold text-zinc-950 dark:text-zinc-950 bg-[#B4F461] hover:bg-[#a3e64f] shadow-lg shadow-[#B4F461]/25 hover:shadow-[#B4F461]/40 border border-[#B4F461]/40 transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] group/btn cursor-pointer"
            >
              <span className="text-zinc-950 dark:text-zinc-950">{currentSlide.ctaText}</span>
              <svg
                className="w-4 h-4 text-zinc-950 dark:text-zinc-950 transition-transform duration-200 group-hover/btn:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Right Column: Logo Lockup */}
        <div className="w-full md:w-auto flex items-center justify-center md:justify-end self-center">
          <div className="flex items-center gap-5 px-6 py-4 rounded-2xl bg-zinc-100/90 dark:bg-zinc-900/60 border border-zinc-200/90 dark:border-zinc-800/80 backdrop-blur-xl shadow-md dark:shadow-xl hover:border-zinc-300 dark:hover:border-zinc-700/80 transition-colors">
            {/* HackerMate Official Logo */}
            <div className="flex items-center">
              <Logo className="h-7 md:h-8 shrink-0 text-zinc-900 dark:text-white" />
            </div>

            {/* Separator Cross */}
            <div className="flex items-center justify-center text-zinc-400 dark:text-zinc-600 font-light text-xl px-1">
              ×
            </div>

            {/* Partner Specific Logo */}
            <div className="flex items-center">
              {currentSlide.logoType === "gamnexis" ? (
                <div className="flex items-center gap-3">
                  <img
                    src="/partners/gamnexis-logo.jpg"
                    alt="Gamnexis Logo"
                    className="h-8 md:h-9 w-auto object-contain rounded-lg shadow-sm"
                  />
                  <span className="font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-400 text-lg md:text-xl font-mono">
                    GAMNEXIS
                  </span>
                </div>
              ) : (
                <div>
                  <img
                    src="/partners/axcentra-full-logo-transparent.png"
                    alt="Axcentra"
                    className="h-9 md:h-10 w-auto object-contain block dark:hidden"
                  />
                  <div className="hidden dark:flex items-center gap-2.5">
                    <img
                      src="/partners/axcentra-icon-only-transparent.png"
                      alt="Axcentra"
                      className="h-7 md:h-8 w-auto object-contain"
                    />
                    <span className="font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400 text-lg md:text-xl font-mono">
                      AXCENTRA
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Center Slide Dots Indicator */}
      <div className="flex items-center justify-center gap-2 mt-6 relative z-10">
        {PARTNER_SLIDES.map((slide, idx) => (
          <button
            key={slide.id}
            onClick={() => setCurrentIndex(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            className={`h-2.5 transition-all duration-300 cursor-pointer ${
              idx === currentIndex
                ? "w-7 bg-[#B4F461] rounded-full shadow-md"
                : "w-2.5 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 rounded-full"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
