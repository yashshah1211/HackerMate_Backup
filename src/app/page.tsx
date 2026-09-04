import { getLandingData } from "@/lib/getLandingData";
import { LandingPageClient } from "./LandingPageClient";

// Revalidate landing page data every 60 seconds (ISR)
export const revalidate = 60;

export default async function HomePage() {
  const initialData = await getLandingData();

  return <LandingPageClient initialData={initialData} />;
}