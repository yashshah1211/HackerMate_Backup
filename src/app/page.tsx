import type { Metadata } from "next";
import { getLandingData } from "@/lib/getLandingData";
import { LandingPageClient } from "./LandingPageClient";

// Revalidate landing page data every 60 seconds (ISR)
export const revalidate = 60;

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const initialData = await getLandingData();

  return <LandingPageClient initialData={initialData} />;
}
