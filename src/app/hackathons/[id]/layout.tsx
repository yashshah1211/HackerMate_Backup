import type { Metadata } from "next";
import type { ReactNode } from "react";
import { publicHackathonMetadata } from "@/lib/hackathons/publicMetadata";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return publicHackathonMetadata((await params).id);
}

export default function HackathonLayout({ children }: { children: ReactNode }) {
  return children;
}
