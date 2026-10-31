import { eventDate } from "./lifecycle";

export const REGISTRATION_FIELDS = ["registration_start", "registration_end", "registration_status"] as const;
type Field = typeof REGISTRATION_FIELDS[number];
type Values = Record<Field, string | null>;
type Snapshot = Values & { version: 1; source_url: string; platform: string };
export function sourceDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (eventDate(value) === null) { console.warn("Scraper ignored an invalid or timezone-ambiguous date:", value); return null; }
  return value;
}
export function ingestionSnapshot(source_url: string, platform: string, values: Values): Snapshot {
  return { version: 1, source_url, platform, ...values };
}

/** Legacy/unowned fields require review. Only the same source can refresh its unchanged snapshot. */
export function deadlineRefresh(row: Record<string, unknown>, source: Snapshot): { values: Partial<Values>; feedback: Record<string, unknown> } | null {
  const feedback = row.ai_feedback;
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) return null;
  const prior = (feedback as Record<string, unknown>).lifecycle_ingestion as Snapshot | undefined;
  if (!prior || prior.version !== 1 || prior.source_url !== source.source_url || prior.platform !== source.platform) return null;
  const values: Partial<Values> = {};
  const next = { ...prior };
  for (const field of REGISTRATION_FIELDS) {
    const stored = row[field] ?? null, previous = prior[field];
    const equal = (a: unknown, b: unknown) => a === b || (field !== "registration_status" && typeof a === "string" && typeof b === "string" && eventDate(a) !== null && eventDate(a) === eventDate(b));
    // Missing provider metadata cannot erase an existing deadline or an explicit closure.
    if (source[field] == null || !equal(stored, previous) || equal(stored, source[field])) continue;
    values[field] = source[field]; next[field] = source[field];
  }
  if (!Object.keys(values).length) return null;
  return { values, feedback: { ...(feedback as Record<string, unknown>), lifecycle_ingestion: next } };
}

export function registrationInstant(value: string | null, end = false): string | null {
  const time = eventDate(value, end);
  return time === null ? null : new Date(time).toISOString();
}
