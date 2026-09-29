"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const controlClass =
  "inline-flex size-10 items-center justify-center rounded-md bg-overlay text-ink-2 ring-1 ring-inset ring-line-strong transition-colors hover:text-ink hover:ring-ink-4 [&_svg]:size-[18px]";

export default function ImageLightbox({ src, alt = "Media attachment", onClose }: ImageLightboxProps) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [onClose]);

  // Portalled to <body> so no transformed ancestor (tab fades, etc.) can trap the fixed layer.
  return createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[100] flex animate-hm-fade items-center justify-center bg-canvas/95 p-4"
    >
      {/* Top action bar */}
      <div
        className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          download
          className={controlClass}
          title="Open original"
          aria-label="Open original"
        >
          <ExternalLink aria-hidden />
        </a>

        <button
          type="button"
          onClick={() => setZoomed(!zoomed)}
          aria-label={zoomed ? "Zoom out" : "Zoom in"}
          className={controlClass}
          title={zoomed ? "Zoom out" : "Zoom in"}
        >
          {zoomed ? <ZoomOut aria-hidden /> : <ZoomIn aria-hidden />}
        </button>

        <button type="button" onClick={onClose} aria-label="Close image lightbox" className={controlClass} title="Close (Esc)">
          <X aria-hidden />
        </button>
      </div>

      {/* Image container */}
      <div
        className={cn("relative flex max-h-full max-w-full items-center justify-center", zoomed ? "cursor-zoom-out" : "cursor-zoom-in")}
        onClick={(e) => {
          e.stopPropagation();
          setZoomed(!zoomed);
        }}
      >
        <img
          src={src}
          alt={alt}
          className={cn(
            "max-h-[90vh] max-w-[90vw] select-none rounded-md object-contain ring-1 ring-line transition-transform duration-200",
            zoomed ? "scale-150" : "scale-100",
          )}
        />
      </div>
    </div>,
    document.body,
  );
}
