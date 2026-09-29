"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/system";
import { cn } from "@/lib/utils";

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

  // Own bubbles sit on bg-selected, so the card drops to canvas there to stay distinct.
  const surface = isMine ? "bg-canvas" : "bg-raised";

  if (loading) {
    return (
      <div className={cn("mt-2 w-full max-w-sm rounded-md p-2.5 ring-1 ring-inset ring-line", surface)} aria-busy="true" aria-label="Loading link preview">
        <div className="mb-2 flex items-center gap-2">
          <Skeleton className="size-3.5 rounded-full" />
          <Skeleton className="h-2.5 w-20" />
        </div>
        <Skeleton className="mb-1.5 h-3 w-3/4" />
        <Skeleton className="h-2 w-1/2" />
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
      className={cn(
        "group mt-2 block w-full max-w-sm overflow-hidden rounded-md text-left ring-1 ring-inset ring-line transition-[box-shadow] duration-150 hover:ring-line-strong",
        surface,
      )}
    >
      {showImage && (
        <div className="relative h-32 w-full overflow-hidden border-b border-line bg-sunken">
          <img
            src={data.image!}
            alt={data.title || "Preview image"}
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="p-3">
        <div className="mb-1 flex min-w-0 items-center gap-1.5 text-[11.5px] font-medium text-ink-3">
          {data.favicon && (
            <img
              src={data.favicon}
              alt=""
              className="size-3.5 shrink-0 rounded-[3px]"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          )}
          <span className="truncate">{data.siteName || data.domain}</span>
          <ExternalLink className="ml-auto size-3 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </div>

        <h4 className="line-clamp-1 text-[13px] font-semibold text-ink [overflow-wrap:anywhere] decoration-line-strong underline-offset-4 group-hover:underline">
          {data.title}
        </h4>

        {data.description && (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-3 [overflow-wrap:anywhere]">{data.description}</p>
        )}
      </div>
    </a>
  );
}
