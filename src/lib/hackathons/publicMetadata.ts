import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { loadPublicEvent } from "./publicBrowsing";
import { plainEventText } from "./discovery";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function plainText(value: unknown): string {
  if (typeof value !== "string") return "";
  // Clean Markdown before decoding entities so escaped angle brackets remain literal text.
  return plainEventText(value.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/(^|\n)[ \t]{0,3}(?:#{1,6}\s+|>\s?)/g, "$1")
    .replace(/[*_`~|]/g, "")).replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
}

function concise(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

/** Anonymous, uncached public read. Never attach cookies or a service-role key. */
export async function publicHackathonMetadata(id: string): Promise<Metadata> {
  const unavailable: Metadata = {
    title: "Hackathon unavailable",
    description: "Browse public hackathons and find your next team on HackerMate.",
    robots: { index: false, follow: false },
    alternates: { canonical: null },
    openGraph: null,
    twitter: null,
  };
  if (!UUID.test(id)) return unavailable;
  try {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(5000) }) },
    });
    const event = await loadPublicEvent(client, id);
    const name = plainText(event?.name);
    if (!event || event.id.toLowerCase() !== id.toLowerCase() || !name) return unavailable;
    const title = `${concise(name, 100)} | HackerMate`;
    const description = concise(plainText(event.description) || `Explore ${concise(name, 80)} on HackerMate. Discover event details and find teammates.`, 160);
    const url = new URL(`/hackathons/${event.id.toLowerCase()}`, process.env.NEXT_PUBLIC_SITE_URL || "https://hackermate.in").toString();
    return {
      title: { absolute: title }, description,
      alternates: { canonical: url },
      openGraph: { title, description, url, siteName: "HackerMate", type: "website", locale: "en_US",
        images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "HackerMate — Team Operating System" }] },
      twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
    };
  } catch {
    // Treat missing, denied, malformed and failed public reads identically; do not log event payloads.
    return unavailable;
  }
}
