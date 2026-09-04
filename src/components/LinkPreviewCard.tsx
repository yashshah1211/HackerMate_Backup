"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState } from "react";

type LinkMetadata = {
  url: string;
  domain: string;
  title: string;
  description: string | null;
  image: string | null;
  siteName: string;
  favicon: string;
};

const linkCache = new Map<string, LinkMetadata>();

export default function LinkPreviewCard({ url, isMine }: { url: string; isMine?: boolean }) {
  const [data, setData] = useState<LinkMetadata | null>(linkCache.get(url) || null);
  const [loading, setLoading] = useState<boolean>(!linkCache.has(url));
  const [imgError, setImgError] = useState<boolean>(false);

  useEffect(() => {
    if (linkCache.has(url)) {
      setData(linkCache.get(url)!);
      setLoading(false);
      return;
    }

    let active = true;
    async function fetchPreview() {
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error("Failed to fetch preview");
        const json: LinkMetadata = await res.json();
        if (active) {
          linkCache.set(url, json);
          setData(json);
          setLoading(false);
        }
      } catch {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchPreview();
    return () => {
      active = false;
    };
  }, [url]);

  if (loading) {
    return (
      <div className="mt-2 w-full max-w-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-2.5 animate-pulse">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3.5 h-3.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <div className="w-20 h-2.5 bg-zinc-200 dark:bg-zinc-700 rounded" />
        </div>
        <div className="w-3/4 h-3 bg-zinc-200 dark:bg-zinc-700 rounded mb-1.5" />
        <div className="w-1/2 h-2 bg-zinc-200 dark:bg-zinc-700 rounded" />
      </div>
    );
  }

  if (!data || (!data.title && !data.description && !data.image)) {
    return null;
  }

  const showImage = Boolean(data.image && !imgError);

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 block w-full max-w-sm overflow-hidden rounded-xl border transition-all duration-150 group text-left ${
        isMine
          ? "bg-zinc-900/10 dark:bg-zinc-900/80 border-blue-400/30 hover:border-blue-400/60 dark:border-blue-500/30"
          : "bg-white/80 dark:bg-zinc-900/90 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-sm"
      }`}
    >
      {showImage && (
        <div className="relative w-full h-32 overflow-hidden bg-zinc-100 dark:bg-zinc-950">
          <img
            src={data.image!}
            alt={data.title || "Preview image"}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      )}

      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
          {data.favicon && (
            <img
              src={data.favicon}
              alt=""
              className="w-3.5 h-3.5 rounded-sm shrink-0"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          )}
          <span className="truncate">{data.siteName || data.domain}</span>
          <svg
            className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>

        <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {data.title}
        </h4>

        {data.description && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-relaxed">
            {data.description}
          </p>
        )}
      </div>
    </a>
  );
}
