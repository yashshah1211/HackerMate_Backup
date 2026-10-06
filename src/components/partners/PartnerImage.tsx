"use client";

import { useState } from "react";

/** A failed logo restores text identity; failed optional artwork disappears. */
export default function PartnerImage({ src, alt, className, fallback }: {
  src: string; alt: string; className?: string; fallback?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback ? <span className={className} aria-hidden="true">{fallback}</span> : null;
  // Partner artwork can use trusted external hosts and existing local assets.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} referrerPolicy="no-referrer" />;
}
