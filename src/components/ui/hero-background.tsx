"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface HeroBackgroundProps {
  className?: string;
}

export function HeroBackground({ className }: HeroBackgroundProps) {
  return (
    <div className={cn("absolute inset-0 w-full h-full pointer-events-none overflow-hidden select-none", className)}>
      {/* Subtle radial ambient center glow (restrained lime ~5% / neutral) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] sm:w-[1200px] h-[550px] bg-[radial-gradient(ellipse_at_center,rgba(180,244,97,0.05)_0%,rgba(39,39,42,0.06)_45%,transparent_75%)] blur-[90px]" />

      {/* Full-bleed engineering dot-matrix grid with smooth radial vignette mask */}
      <div
        className="absolute inset-0 w-full h-full bg-[radial-gradient(#3f3f46_1px,transparent_1px)] [background-size:28px_28px] opacity-45 [mask-image:radial-gradient(ellipse_80%_65%_at_50%_35%,#000_40%,transparent_100%)]"
      />

      {/* Top subtle horizon accent line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-[1px] bg-gradient-to-r from-transparent via-zinc-800/80 to-transparent" />
    </div>
  );
}
