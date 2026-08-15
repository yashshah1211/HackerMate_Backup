"use client";

import React from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface Avatar {
  imageUrl?: string | null;
  name?: string | null;
  skills?: string[] | null;
}

interface AvatarCirclesProps {
  className?: string;
  numPeople?: number;
  avatarUrls?: Avatar[];
}

export function AvatarCircles({
  numPeople = 104,
  className,
  avatarUrls = [],
}: AvatarCirclesProps) {
  const displayAvatars = avatarUrls.slice(0, 4);

  return (
    <div className={cn("z-10 flex -space-x-3 rtl:space-x-reverse items-center", className)}>
      {displayAvatars.map((url, index) => {
        const initials = url.name
          ? url.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)
          : `B${index + 1}`;

        return (
          <div
            key={index}
            className="relative h-8 w-8 rounded-full border-2 border-zinc-950 bg-zinc-900 overflow-hidden shadow-md flex items-center justify-center text-[10px] font-mono font-bold text-zinc-300 transition-transform duration-200 hover:scale-110 hover:z-20 hover:border-[#B4F461]"
            title={url.name || "HackerMate Builder"}
          >
            {url.imageUrl ? (
              <img
                className="h-full w-full object-cover"
                src={url.imageUrl}
                width={32}
                height={32}
                alt={url.name || `Builder avatar ${index + 1}`}
                onError={(e) => {
                  // Fallback to initials if image fails to load
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span className="text-zinc-400">{initials}</span>
            )}
          </div>
        );
      })}
      {(numPeople > 0 || displayAvatars.length === 0) && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-zinc-950 bg-zinc-900 text-center text-[10px] font-semibold text-zinc-300 font-mono shadow-md hover:scale-105 transition-transform">
          +{numPeople}
        </div>
      )}
    </div>
  );
}
