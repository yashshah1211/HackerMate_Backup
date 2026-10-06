import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAccess } from "@/lib/partners/requirePartnerAccess";
import { organizerFailure, parseOrganizerQuery, privateAccessResponse, privateJson, readOrganizerSection } from "@/lib/partners/organizer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const access = await requirePartnerAccess(req, { partnerSlug: slug }, { detailedErrors: true });
    if (access instanceof NextResponse) return privateAccessResponse(access);
    const query = parseOrganizerQuery(req.nextUrl.searchParams);
    const data = await readOrganizerSection(access, query);
    return privateJson({ eventId: access.hackathonId, ...data, retrievedAt: new Date().toISOString() });
  } catch (error) {
    return organizerFailure(error);
  }
}
