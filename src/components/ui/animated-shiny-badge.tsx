"use client";

import React, { type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedShinyBadgeProps extends ComponentPropsWithoutRef<"div"> {
  shimmerWidth?: number;
}

export function AnimatedShinyBadge({
  children,
  className,
  shimmerWidth = 100,
  ...props
}: AnimatedShinyBadgeProps) {
  return (
    <div
      style={
        {
          "--shimmer-width": `${shimmerWidth}px`,
        } as React.CSSProperties
      }
      className={cn(
        "group relative mx-auto flex max-w-fit items-center justify-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-900/60 px-3.5 py-1.5 text-xs text-zinc-300 backdrop-blur-md transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-900/90 shadow-[0_0_15px_-3px_rgba(0,0,0,0.4)]",
        className
      )}
      {...props}
    >
      {/* Subtle glowing pill background on hover */}
      <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-[#B4F461]/0 via-[#B4F461]/10 to-[#22D3EE]/0 opacity-0 blur-sm transition-opacity duration-500 group-hover:opacity-100" />
      {children}
    </div>
  );
}
