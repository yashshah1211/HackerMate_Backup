"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface HeroBackgroundProps {
  className?: string;
}

export function HeroBackground({ className }: HeroBackgroundProps) {
  return (
    <div className={cn("fixed inset-0 w-full h-full pointer-events-none overflow-hidden select-none z-0", className)}>
      {/* Subtle radial ambient top center glow (restrained lime / neutral) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] sm:w-[1200px] h-[550px] bg-[radial-gradient(ellipse_at_center,rgba(180,244,97,0.05)_0%,rgba(39,39,42,0.06)_45%,transparent_75%)] blur-[90px]" />

      {/* Mid-page subtle ambient glow */}
      <div className="absolute top-[45%] left-1/2 -translate-x-1/2 w-[600px] sm:w-[900px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(180,244,97,0.025)_0%,transparent_70%)] blur-[120px]" />

      {/* Bottom CTA ambient glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] sm:w-[1100px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(180,244,97,0.035)_0%,transparent_75%)] blur-[100px]" />

      {/* Full-bleed engineering dot-matrix grid covering entire page */}
      <div
        className="absolute inset-0 w-full h-full bg-[radial-gradient(#3f3f46_1px,transparent_1px)] [background-size:28px_28px] opacity-45"
      />
    </div>
  );
}
