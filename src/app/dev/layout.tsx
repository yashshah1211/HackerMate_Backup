import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Development-only screen gallery for the V2 visual review loop.
 * Renders V2 views with fixture data inside a mock shell — no real
 * accounts, no database writes. Always 404s in production builds.
 */
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
