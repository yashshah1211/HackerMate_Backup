import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import OrganizerDashboard from "@/components/partners/OrganizerDashboard";
import OrganizerAccessState from "@/components/partners/OrganizerAccessState";
import { organizerPageRequest, resolveOrganizerWorkspace } from "@/lib/partners/workspace";
import { workspaceHref, workspaceParams } from "@/lib/partners/workspaceClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organizer workspace", robots: { index: false, follow: false } };

export default async function OrganizerPage({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await (searchParams || Promise.resolve({})))) {
    if (Array.isArray(value)) value.forEach(item => query.append(key, item));
    else if (typeof value === "string") query.set(key, value);
  }
  const path = workspaceHref(slug, workspaceParams(query, true), {});
  const result = await resolveOrganizerWorkspace(await organizerPageRequest(path), slug);
  if (result.kind === "unauthenticated") redirect(`/login?next=${encodeURIComponent(path)}`);
  if (result.kind === "missing") notFound();
  if (result.kind === "authorized") return <OrganizerDashboard identity={result.identity} />;
  return <OrganizerAccessState kind={result.kind} />;
}
