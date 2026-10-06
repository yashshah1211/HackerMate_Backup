import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAccess } from "@/lib/partners/requirePartnerAccess";
import { PARTICIPANT_CSV_HEADER, participantCsvRow } from "@/lib/partners/csv";
import { EXPORT_BYTES, EXPORT_LIMIT, EXPORT_PAGE_SIZE, OrganizerApiError, PRIVATE_HEADERS,
  organizerFailure, parseExportQuery, privateAccessResponse, readParticipants } from "@/lib/partners/organizer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const access = await requirePartnerAccess(req, { partnerSlug: slug }, { detailedErrors: true });
    if (access instanceof NextResponse) return privateAccessResponse(access);
    const filters = parseExportQuery(req.nextUrl.searchParams);
    const signal = AbortSignal.timeout(25_000);
    const chunks = [PARTICIPANT_CSV_HEADER], seen = new Set<string>();
    let bytes = Buffer.byteLength(PARTICIPANT_CSV_HEADER), total: number | undefined;
    for (let offset = 0; total === undefined || offset < total; offset += EXPORT_PAGE_SIZE) {
      const result = await readParticipants(access, filters, offset, EXPORT_PAGE_SIZE, signal);
      if (result.total > EXPORT_LIMIT) throw new OrganizerApiError(413, "Export exceeds 10,000 participants. Narrow the filters.");
      if (total !== undefined && result.total !== total) throw new OrganizerApiError(409, "Participants changed during export. Retry the export.");
      total = result.total;
      for (const row of result.rows) {
        if (seen.has(row.user_id)) throw new OrganizerApiError(409, "Participants changed during export. Retry the export.");
        seen.add(row.user_id);
        const textLength = (row.full_name?.length ?? 0) + (row.college?.length ?? 0)
          + row.skills.reduce((sum, skill) => sum + skill.length + 2, 0)
          + row.event_teams.reduce((sum, team) => sum + team.team_name.length + 2, 0);
        if (textLength > EXPORT_BYTES) throw new OrganizerApiError(413, "Export exceeds 8 MiB. Narrow the filters.");
        const csv = participantCsvRow(row);
        bytes += Buffer.byteLength(csv);
        if (bytes > EXPORT_BYTES) throw new OrganizerApiError(413, "Export exceeds 8 MiB. Narrow the filters.");
        chunks.push(csv);
      }
    }
    // Recheck through the same caller-bound RPC before releasing buffered CSV.
    // Errors/revocations/changing totals never produce an empty or partial file.
    const final = await readParticipants(access, filters, 0, 1, signal);
    if (final.total !== total || seen.size !== total) throw new OrganizerApiError(409, "Participants changed during export. Retry the export.");
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(chunks.join(""), { headers: {
      ...PRIVATE_HEADERS, "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="partner-participants-filtered-${date}.csv"`,
      "X-Export-Scope": "all-matching-filters", "X-Export-Row-Count": String(total),
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return organizerFailure(error);
  }
}
