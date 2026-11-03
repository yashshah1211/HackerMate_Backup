import type { Provider } from "./source";
export type SourceIdentity = { provider: Provider; provider_id: string; canonical_url: string; slug?: string };
export const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
export const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export const integer = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= 10000 ? v : null;

export function identifySource(value: unknown): SourceIdentity | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value || "");
    if (u.protocol !== "https:" || u.port || u.username || u.password || u.hash) return null;
    const path = u.pathname.replace(/\/+$/, "");
    if (u.hostname === "unstop.com") {
      const id = path.match(/-(\d+)$/)?.[1] || path.match(/^\/o\/(\d+)$/)?.[1];
      return id && /^\/(?:hackathons|competitions|o)\//.test(path) ? { provider: "unstop", provider_id: id, canonical_url: u.origin + path } : null;
    }
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*\.devfolio\.co$/.test(u.hostname) && !path) {
      return { provider: "devfolio", provider_id: u.hostname.split(".")[0], slug: u.hostname.split(".")[0], canonical_url: u.origin };
    }
    if (u.hostname === "hack2skill.com" && /^\/event\/[a-zA-Z0-9_-]+$/.test(path)) {
      const slug = path.split("/").at(-1)!;
      return { provider: "hack2skill", provider_id: slug, slug, canonical_url: u.origin + path };
    }
  } catch { /* Invalid source identities remain unresolved, never fuzzy-name merged. */ }
  return null;
}

/** Calendar-only dates cover the full day in India; timestamps retain their explicit timezone. */
export function eventDate(value: unknown, endOfDay = false): number | null {
  if (typeof value !== "string" || !value || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const day = value.slice(0, 10), check = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== day) return null;
  if (value.length === 10) return Date.parse(`${day}T00:00:00+05:30`) + (endOfDay ? 86400000 : 0);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

const timestamp = (v: unknown): string | null => { const s = text(v); return s && eventDate(s) !== null ? s : null; };
function invalidDates(values: unknown[]): string[] { return values.some(v => v != null && v !== "" && timestamp(v) === null) ? ["invalid_published_date"] : []; }

// Deliberately limited statement grammar, not a general prose classifier. Both the activity
// label and the complete assertion must identify building in THIS stage. Extra clauses,
// adjacent activities, negations, questions and unfamiliar formats remain unverified.
const BUILD_TITLE = /^(?:(?:actual|final|offline) )?(?:hackathon )?(?:build|building|coding|solution development)(?: (?:phase|period|round|stage))?[.!:]?$/i;
const BUILD_STATEMENTS = [
  /^the (?:actual|final) hackathon (?:build|building|coding|solution development)(?: (?:phase|period))? takes place (?:in|during) this (?:stage|round)[.!]?$/i,
  /^this (?:stage|round) is the (?:actual|final) hackathon (?:build|building|coding|solution development) (?:phase|period)[.!]?$/i,
];
function stageText(value: unknown, limit: number): string | null {
  const raw = text(value);
  if (!raw || raw.length > limit) return null; // Never classify a truncated prefix.
  const stripped = raw.replace(/<\/?(?:p|b|strong|em|i)\s*>|<br\s*\/?>/gi, " ");
  // Only simple emphasis/paragraph markup is understood; hidden/deleted/link content is not evidence.
  return /[<>]/.test(stripped) ? null : stripped.replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}
function explicitBuildStage(stage: Record<string, unknown>, round: Record<string, unknown>): boolean {
  for (const flag of ["is_hidden", "is_inactive"]) if (stage[flag] !== undefined && stage[flag] !== 0) return false;
  if (stage.entity_type !== undefined && stage.entity_type !== round.entity_type) return false;
  if (stage.status !== undefined && stage.status !== round.status) return false;
  const title = stageText(stage.title, 200), description = stageText(stage.display_text, 4000);
  if (!title || !BUILD_TITLE.test(title) || !description || !BUILD_STATEMENTS.some(pattern => pattern.test(description))) return false;
  // Optional parent labels must not contradict the detail that supplies the dated window.
  if (round.title !== undefined && !BUILD_TITLE.test(stageText(round.title, 200) || "")) return false;
  return round.display_text === undefined || BUILD_STATEMENTS.some(pattern => pattern.test(stageText(round.display_text, 4000) || ""));
}
type StageEntry = { stage: Record<string, unknown>; round: Record<string, unknown> };
type StageWindow = { start: string; end: string; from: number; until: number };
function stageWindow(stage: Record<string, unknown>): StageWindow | null {
  const start = timestamp(stage.start_date), end = timestamp(stage.end_date);
  if (!start || !end) return null;
  const from = eventDate(start)!, until = eventDate(end, true)!;
  return from < until ? { start, end, from, until } : null;
}
// A complete exclusion statement is evidence of a separate activity. A label or keyword
// alone never makes an unknown/mixed stage safe to omit from the inventory.
function explicitlyUnrelated({ stage, round }: StageEntry): boolean {
  const activity = stageText(stage.title, 200)?.toLowerCase();
  if (!activity || !["judging", "registration", "presentations", "orientation"].includes(activity)) return false;
  const statement = `this stage is for ${activity} only. no building takes place in this stage.`;
  if (stageText(stage.display_text, 4000)?.toLowerCase() !== statement) return false;
  if (round.title !== undefined && stageText(round.title, 200)?.toLowerCase() !== activity) return false;
  if (round.display_text !== undefined && stageText(round.display_text, 4000)?.toLowerCase() !== statement) return false;
  for (const flag of ["is_hidden", "is_inactive"]) if (stage[flag] !== undefined && stage[flag] !== 0) return false;
  if (stage.entity_type !== undefined && stage.entity_type !== round.entity_type) return false;
  if (stage.status !== undefined && stage.status !== round.status) return false;
  const dates = [stage.start_date, stage.end_date];
  if (invalidDates(dates).length) return false;
  return !dates.every(v => timestamp(v)) || stageWindow(stage) !== null;
}
export function reconciledBuildWindow(value: unknown, issues: string[]): StageWindow | null {
  const inventory: StageEntry[] = [];
  let incomplete = !Array.isArray(value);
  for (const raw of array(value)) {
    const round = object(raw);
    // Explicitly private/disabled rounds cannot supply public event timing. Unknown
    // visibility, status, types and malformed inventory remain potentially relevant.
    if (round.is_hidden === 1 || round.is_inactive === 1 || round.status === "DRAFT") continue;
    if (!Array.isArray(round.details) || !round.details.length) { incomplete = true; continue; }
    for (const detail of round.details) inventory.push({ stage: object(detail), round });
  }
  const publicEnabled = (round: Record<string, unknown>) => round.is_hidden === 0 && round.is_inactive === 0
    && ["LIVE", "STARTED", "UPCOMING", "FINISHED"].some(status => round.status === status);
  const builds = inventory.filter(({ stage, round }) => publicEnabled(round)
    && round.entity_type === "App\\Model\\OfflineRound" && explicitBuildStage(stage, round));
  if (!builds.length) return null;
  const buildSet = new Set(builds);
  if (incomplete || inventory.some(entry => !buildSet.has(entry) && !(publicEnabled(entry.round) && explicitlyUnrelated(entry)))) {
    issues.push("event_schedule_requires_reconciliation"); return null;
  }
  const windows = builds.map(({ stage }) => stageWindow(stage));
  if (windows.some(window => !window)) {
    issues.push("incomplete_or_contradictory_build_window");
    if (builds.some(({ stage }) => invalidDates([stage.start_date, stage.end_date]).length)) issues.push("invalid_published_date");
    if (builds.some(({ stage }) => timestamp(stage.start_date) && timestamp(stage.end_date) && !stageWindow(stage))) issues.push("event_window_contradiction");
    return null;
  }
  const complete = windows as StageWindow[], first = complete[0], last = complete[complete.length - 1];
  const groups = new Map<Record<string, unknown>, StageWindow[]>();
  builds.forEach((entry, i) => { const group = groups.get(entry.round) || []; group.push(complete[i]); groups.set(entry.round, group); });
  // Parent timing, when supplied, must be complete and agree with its own children.
  for (const [round, children] of groups) {
    if (round.start_date !== undefined || round.end_date !== undefined) {
      const parent = stageWindow(round);
      if (!parent || parent.from !== children[0].from || parent.until !== children[children.length - 1].until) {
        issues.push("event_schedule_requires_reconciliation"); return null;
      }
    }
  }
  if (complete.every(window => window.from === first.from && window.until === first.until)) return first;
  // Distinct build windows need an explicit common build parent defining the whole
  // period. Never infer an envelope from independent rounds or bridge unknown gaps.
  const parent = builds[0].round, whole = stageWindow(parent);
  if (builds.some(entry => entry.round !== parent) || !whole || !explicitBuildStage(parent, parent)
    || whole.from !== first.from || whole.until !== last.until
    || complete.some((window, i) => i > 0 && window.from !== complete[i - 1].until)) {
    issues.push("ambiguous_hackathon_build_stages"); return null;
  }
  return { ...first, end: last.end, until: last.until };
}

/** Persist only the inventory fields used by reconciliation. Never truncate an inventory
 * into apparently complete proof. Oversize/unsupported inventories require a new review. */
export function retainBuildInventory(value: unknown): unknown[] | null {
  if (!Array.isArray(value) || value.length > 40) return null;
  const keys = ["entity_type", "status", "is_hidden", "is_inactive", "title", "display_text", "start_date", "end_date"];
  let details = 0;
  const pick = (raw: unknown): Record<string, unknown> | null => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const v = object(raw)[key];
      if (v === undefined) continue;
      if (v !== null && typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") return null;
      if (typeof v === "string" && v.length > 65536) return null;
      result[key] = v;
    }
    return result;
  };
  const inventory: unknown[] = [];
  for (const raw of value) {
    const round = pick(raw), children = object(raw).details;
    if (!round) return null;
    if (children == null) { inventory.push({ ...round, ...(children === null ? { details: null } : {}) }); continue; }
    if (!Array.isArray(children) || (details += children.length) > 200) return null;
    const retained = children.map(pick);
    if (retained.some(v => v === null)) return null;
    inventory.push({ ...round, details: retained });
  }
  return JSON.stringify(inventory).length <= 65536 ? inventory : null;
}

/** Requires URL evidence and a stable provider-specific ID; slugs are not UUIDs. */
export function validatedSourceIdentity(value: unknown, expected?: unknown): SourceIdentity | null {
  const m = object(value), canonical = identifySource(m.canonical_url);
  if (!canonical || m.provider !== canonical.provider || typeof m.provider_id !== "string"
    || !/^[a-zA-Z0-9_-]{1,200}$/.test(m.provider_id)) return null;
  if (canonical.provider === "unstop" && m.provider_id !== canonical.provider_id) return null;
  if (canonical.provider === "hack2skill" && !/^[0-9a-f]{24}$/.test(m.provider_id)) return null;
  if (m.slug !== undefined && m.slug !== canonical.slug) return null;
  if (expected !== undefined && expected !== null) {
    const match = typeof expected === "string" ? identifySource(expected) : validatedSourceIdentity(expected);
    if (!match || match.provider !== canonical.provider) return null;
    if (canonical.provider === "unstop" ? match.provider_id !== m.provider_id : match.canonical_url !== canonical.canonical_url) return null;
    if (typeof expected !== "string" && match.provider_id !== m.provider_id) return null;
  }
  return { ...canonical, provider_id: m.provider_id };
}

export function windowState(start: string | null, end: string | null, now: number): "upcoming" | "ongoing" | "ended" | "unknown" {
  const from = eventDate(start), until = eventDate(end, true);
  if (from === null || until === null || from >= until) return "unknown";
  return now < from ? "upcoming" : now >= until ? "ended" : "ongoing";
}
