import { dateLabel } from "@/lib/hackathons/lifecycle";
import { hasEventScheduleEvidence, sourceFresh, sourceMetadata } from "@/lib/hackathons/source";

/** Pure rendering; the parent owns the same ticking clock as its status badges. */
export default function SourceInformation({ event, now, compact = false }: {
  event: { type?: string | null; source_metadata?: unknown; website_url?: string | null }; now: number; compact?: boolean;
}) {
  if (event.type === "native") return null;
  const source = sourceMetadata(event.source_metadata, event.website_url);
  if (!source) return <p className="mt-2 text-xs text-ink-3">Imported listing · source details not verified. Check the official page.</p>;
  const fresh = sourceFresh(source, now);
  return <div className="mt-2 space-y-1 text-xs leading-relaxed text-ink-3">
    <p>{source.provider} · {fresh ? "Source checked" : "Source check unavailable or expired"}: {dateLabel(source.checked_at)}.
      {" "}{source.category === "hackathon" ? "Hackathon category confirmed by source." : "Hackathon category unverified; excluded from active discovery."}</p>
    {source.provider === "unstop" && !hasEventScheduleEvidence(source) && <p>Actual event dates unverified. Registration timing is assessed separately.</p>}
    {source.evidence_only && <p>Registration evidence is shown separately. Organizer-managed event details are preserved.</p>}
    {Array.isArray(source.issues) && source.issues.some(issue => ["mode_contradiction", "team_size_contradiction"].includes(issue)) && <p>Source facts conflict. Confirm mode and team size on the official page.</p>}
    {!compact && <>
      <p>Evidence expires: {dateLabel(source.expires_at)}. Provider availability may change between checks.</p>
      {source.facts.eligibility && <p>Published eligibility: {source.facts.eligibility}</p>}
      <p>Source ID: {source.provider_id}</p>
    </>}
  </div>;
}
