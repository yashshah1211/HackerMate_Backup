import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { legacyOrganizerDestination, organizerPageRequest } from "@/lib/partners/workspace";

export const dynamic = "force-dynamic";

export default async function OrganizerRouteLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await organizerPageRequest(`/hackathons/${encodeURIComponent(id)}/organizer`);
  const destination = await legacyOrganizerDestination(request, id);
  if (destination) redirect(destination);
  return children;
}
