import { EVENT_FIELDS, hasEventScheduleEvidence, object, sourceFresh, validateSourceObservation } from "./source";
import { windowState } from "./sourceEvidence";

/** Coverage describes checked/catalog records, never market-wide availability.
 * Every unverified record has one primary reason; additional conflicts are counted separately. */
export function summarizeSourceCoverage(values: { source_metadata?: unknown; website_url?: string | null }[], now: number) {
  const result = { records: values.length, verified_event_schedules: 0, verified_ongoing: 0,
    held_conflicts: 0, unverified_schedule_reasons: {} as Record<string, number>,
    by_provider: {} as Record<string, { records: number; verified_event_schedules: number; verified_ongoing: number }>,
    meaning: "Currently confirmed by source evidence; missing coverage does not imply no real-world hackathons." };
  for (const value of values) {
    const raw = object(value.source_metadata), validated = validateSourceObservation(value.source_metadata, value.website_url), m = validated.metadata;
    const provider = ["unstop", "devfolio", "hack2skill"].includes(String(raw.provider)) ? String(raw.provider) : "unknown";
    const bucket = result.by_provider[provider] ||= { records: 0, verified_event_schedules: 0, verified_ongoing: 0 };
    bucket.records++;
    const evidence = object(raw.evidence), issues = [...(Array.isArray(raw.issues) ? raw.issues : []), ...validated.errors];
    const conflict = issues.some(issue => /contradict|conflict|collision|reconciliation|ambiguous/.test(String(issue)));
    if (conflict) result.held_conflicts++;
    if (m?.category === "hackathon" && sourceFresh(m, now, EVENT_FIELDS) && hasEventScheduleEvidence(m) && validated.schedule) {
      result.verified_event_schedules++; bucket.verified_event_schedules++;
      if (windowState(validated.schedule.start, validated.schedule.end, now) === "ongoing") { result.verified_ongoing++; bucket.verified_ongoing++; }
      continue;
    }
    const reason = value.source_metadata == null ? "not_checked"
      : conflict ? "held_conflict"
      : validated.errors.length ? "invalid_evidence"
      : raw.check_status === "failed" || raw.check_status === "checking" ? "source_check_unavailable"
      : m && m.check_status === "ok" && !sourceFresh(m, now) ? "stale_evidence"
      : m?.protected_fields?.some(field => EVENT_FIELDS.includes(field)) ? "protected_event_fields"
      : issues.includes("date_only_event_window") ? "date_only_ambiguity"
      : issues.includes("build_inventory_unavailable_or_oversized") ? "incomplete_inventory"
      : Array.isArray(evidence.schedule_reasons) && typeof evidence.schedule_reasons[0] === "string" ? evidence.schedule_reasons[0]
      : m?.category !== "hackathon" ? "category_unverified"
      : "missing_event_dates";
    result.unverified_schedule_reasons[reason] = (result.unverified_schedule_reasons[reason] || 0) + 1;
  }
  return result;
}
