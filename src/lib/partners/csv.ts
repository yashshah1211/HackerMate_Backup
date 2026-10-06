import type { OrganizerParticipant } from "./organizer";

// Quote every cell and neutralize formula prefixes even behind whitespace or
// control characters. A leading apostrophe remains readable in spreadsheets.
export function csvCell(value: string): string {
  let start = 0;
  while (start < value.length && (/\s/u.test(value[start]) || value.charCodeAt(start) < 32 || value.charCodeAt(start) === 127)) start++;
  const safe = ["=", "+", "-", "@"].includes(value[start]) || ["\t", "\r", "\n"].includes(value[0])
    ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
export const PARTICIPANT_CSV_HEADER = "\uFEFF" + [
  "Participant name", "College", "Declared skills", "Recorded HackerMate status",
  "Looking for team", "Event-linked teams", "HackerMate joined at",
].map(csvCell).join(",") + "\r\n";

export function participantCsvRow(row: OrganizerParticipant): string {
  // Explicit fields only. Never enumerate an RPC/database object into CSV.
  return [row.full_name ?? "", row.college ?? "", row.skills.join("; "), row.status,
    row.looking_for_team ? "Yes" : "No", row.event_teams.map(team => team.team_name).join("; "), row.created_at,
  ].map(csvCell).join(",") + "\r\n";
}
