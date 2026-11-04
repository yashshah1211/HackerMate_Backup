import { eventDate, reconciledOrganizerWindow, retainBuildInventory } from "./sourceEvidence";
import type { SourceIdentity } from "./sourceEvidence";
export { identifySource } from "./sourceEvidence";
export type { SourceIdentity } from "./sourceEvidence";
import { array, integer, object, text, validateSourceObservation, SOURCE_MAX_AGE_MS, UNSTOP_ORGANIZER_DATE_BASIS, type SourceFacts, type SourceMetadata } from "./source";

export type Observation = SourceMetadata;
export const PARSER_VERSION = "aggregator-10";
const plain = (v: unknown, limit = 1000) => (text(v) || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().slice(0, limit);
const timestamp = (v: unknown): string | null => { const s = text(v); return s && eventDate(s) !== null ? s : null; };

export function nextData(html: string): Record<string, unknown> {
  const match = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  return match ? object(JSON.parse(match[1])) : {};
}

function action(value: unknown): string | null {
  try { const u = new URL(String(value || "")); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
}
function invalidDates(values: unknown[]): string[] { return values.some(v => v != null && v !== "" && timestamp(v) === null) ? ["invalid_published_date"] : []; }

function base(identity: SourceIdentity): SourceFacts {
  return { name: "", description: "", website_url: identity.canonical_url, college: null, start_date: null, end_date: null,
    registration_start: null, registration_end: null, registration_status: "unknown", min_team_size: null, max_team_size: null,
    mode: null, location: null, prize_pool: null, currency: null, eligibility: null, rounds_info: [] };
}
function registration(f: SourceFacts, status: unknown, now: number): void {
  const s = String(status || "").toUpperCase();
  const start = eventDate(f.registration_start), end = eventDate(f.registration_end, true);
  if (["FINISHED", "CLOSED", "CANCELLED", "ENDED"].includes(s)) f.registration_status = "closed";
  else if (end !== null && now >= end) f.registration_status = "closed";
  else if (s && !["OPEN", "STARTED", "LIVE", "ONGOING"].includes(s)) f.registration_status = "unknown";
  else if (start !== null && end !== null && start < end) f.registration_status = now < start ? "not-yet-open" : "open";
}
function finish(identity: SourceIdentity, f: SourceFacts, category: Observation["category"], rawStatus: unknown, now: number, hash: string, evidence: Record<string, unknown>, issues: string[]): Observation {
  if (!f.name) throw new Error("Missing source event name");
  const publishedStatus = String(rawStatus || "").toUpperCase();
  if (publishedStatus && !["UPCOMING", "ONGOING", "LIVE", "STARTED", "ENDED", "COMPLETED", "FINISHED"].includes(publishedStatus)) issues.push("unrecognized_or_cancelled_event_status");
  const start = eventDate(f.start_date), end = eventDate(f.end_date, true);
  if (f.start_date?.length === 10 || f.end_date?.length === 10) issues.push("date_only_event_window");
  if (start !== null && end !== null && end <= start) issues.push("event_window_contradiction");
  const rs = eventDate(f.registration_start), re = eventDate(f.registration_end, true);
  if (rs !== null && re !== null && rs >= re) issues.push("registration_window_contradiction");
  if (f.min_team_size && f.max_team_size && f.min_team_size > f.max_team_size) issues.push("team_size_contradiction");
  let event_status: Observation["event_status"] = "unknown";
  if (["ENDED", "COMPLETED", "FINISHED"].includes(String(rawStatus).toUpperCase()) || end !== null && now >= end) event_status = "ended";
  else if (start !== null && now < start) event_status = "upcoming";
  else if (start !== null && end !== null && now >= start && now < end) event_status = "ongoing";
  f.description = `${f.name}${f.college ? `, organized by ${f.college}` : ""}. ${f.mode ? `${f.mode === "in-person" ? "In-person" : f.mode === "hybrid" ? "Hybrid" : "Online"} event. ` : ""}See the official event page for the complete rules, eligibility and current registration information.`;
  const observation: Observation = { version: 1, ...identity, checked_at: new Date(now).toISOString(), expires_at: new Date(now + SOURCE_MAX_AGE_MS).toISOString(),
    check_status: issues.length ? "unresolved" : "ok", category, event_status, source_hash: hash, parser_version: PARSER_VERSION, facts: f, evidence: { ...evidence, published_event_status: publishedStatus || "not published" }, issues };
  const validation = validateSourceObservation(observation, identity);
  if (validation.errors.length) {
    observation.check_status = "unresolved";
    observation.issues = [...new Set([...issues, ...validation.errors])];
  }
  return observation;
}

export function parseUnstop(identity: SourceIdentity, payload: unknown, now: number, hash: string): Observation {
  const data = object(object(payload).data), c = object(data.competition || data), reg = object(c.regnRequirements), f = base(identity), issues: string[] = [];
  issues.push(...invalidDates([reg.start_regn_dt,reg.end_regn_dt]));
  if (String(c.id) !== identity.provider_id) throw new Error("Provider identity mismatch");
  f.name = plain(c.title, 200); f.college = plain(object(c.organisation).name, 200) || null;
  // The provider's competition window can span registration/assessments, not the actual build.
  const inventory = retainBuildInventory(c.rounds);
  const organizer = typeof c.details === "string" && c.details.length <= 20000 ? c.details : null;
  const window = reconciledOrganizerWindow(inventory, organizer, issues, now);
  if (window) { f.start_date = window.start; f.end_date = window.end; }
  f.registration_start = timestamp(reg.start_regn_dt); f.registration_end = timestamp(reg.end_regn_dt);
  f.min_team_size = integer(reg.min_team_size); f.max_team_size = integer(reg.max_team_size);
  f.mode = ["online", "offline", "hybrid"].includes(String(c.region)) ? c.region === "offline" ? "in-person" : String(c.region) : null;
  f.location = array(c.locations).filter(v => typeof v === "string").join(", ") || text(c.address);
  const eligibility = reg.eligibility;
  f.eligibility = typeof eligibility === "string" ? plain(eligibility, 1000) : null;
  // Individual awards are not a total prize pool. Preserve tier labels rather than promoting the first award as the total.
  const awards = array(c.prizes).map(object).filter(p => typeof p.cash === "number" && Number.isFinite(p.cash) && p.cash >= 0);
  f.prize_pool = awards.slice(0, 20).map((p,i) => `${plain(p.name || p.title, 100) || `Award ${i + 1}`}: ${p.cash}${text(p.currencyCode) ? ` ${text(p.currencyCode)}` : " (currency not specified)"}`).join("; ") || null;
  f.rounds_info = array(c.rounds).slice(0, 20).flatMap((r, i) => array(object(r).details).slice(0, 20).map(v => {
    const round = object(v); return { round_number: i + 1, name: plain(round.title, 100) || `Stage ${i + 1}`, start_date: timestamp(round.start_date), end_date: timestamp(round.end_date) };
  }));
  // Taxonomy plus an organizer's explicit description, not title/URL keywords or a listing bucket.
  const body = plain(c.details, 20000), declared = c.type === "hackathons" && /\bhackathon\b/i.test(body);
  const claims = body.replace(/&(?:ndash|mdash);/gi, "-");
  const modes = [...claims.matchAll(/\bMode\s*:\s*(offline|online|hybrid)\b/gi)].map(m => m[1].toLowerCase() === "offline" ? "in-person" : m[1].toLowerCase());
  if (modes.some(mode => f.mode !== null && mode !== f.mode) || new Set(modes).size > 1) { f.mode = null; issues.push("mode_contradiction"); }
  const teams = [...claims.matchAll(/\bTeam Size\s*:\s*(\d+)\s*[-–—]\s*(\d+)\b/gi)];
  if (teams.some(m => f.min_team_size !== null && Number(m[1]) !== f.min_team_size || f.max_team_size !== null && Number(m[2]) !== f.max_team_size)) {
    f.min_team_size = null; f.max_team_size = null; issues.push("team_size_contradiction");
  }
  const contradictoryFormat = /\b(?:workshops?|bootcamps?|case study|case challenge|coding contest|capture the flag)\b/i.test(body);
  const category = declared && !contradictoryFormat ? "hackathon" : "unknown";
  if (!["LIVE", "FINISHED", "ENDED", "COMPLETED"].includes(String(c.status).toUpperCase())) issues.push("not_publicly_live");
  if (/CANCELLED|CANCELED/i.test(String(c.event_status))) issues.push("unrecognized_or_cancelled_event_status");
  registration(f, reg.reg_status, now);
  return finish(identity, f, category, null, now, hash, {
    event_dates: f.start_date && f.end_date ? "complete reconciled public build-stage inventory; explicit activity and stage-bound statements; competition window ignored" : "actual event dates unverified; competition window ignored; unresolved stage relationships held",
    event_date_basis: f.start_date && f.end_date ? UNSTOP_ORGANIZER_DATE_BASIS : "unverified",
    organizer_text: organizer,
    schedule_reasons: window ? [] : issues.length ? [...new Set(issues)] : inventory?.length ? ["mixed_or_unsupported_build_stages"] : ["missing_build_stages"],
    build_inventory: inventory,
    competition_window: "not an actual event schedule; never used for lifecycle",
    registration: "competition.regnRequirements", publication_status: String(c.status || "not published"),
    published_registration_status: String(reg.reg_status || "not published"), team_size: "competition.regnRequirements.min_team_size/max_team_size; labeled contradictions held",
    mode: "competition.region; labeled organizer contradictions held", category: "competition.type plus organizer details", stages: "competition.rounds[].details[]; generic dates are stage-only",
  }, issues);
}

export function parseDevfolio(identity: SourceIdentity, html: string, now: number, hash: string): Observation {
  const pp = object(object(nextData(html).props).pageProps), h = object(pp.hackathon), settings = object(h.settings), f = base(identity);
  if (text(h.slug) !== identity.slug || !text(h.uuid) || identity.provider_id !== identity.slug && identity.provider_id !== h.uuid) throw new Error("Provider identity mismatch");
  const resolved = { ...identity, provider_id: String(h.uuid) };
  f.name = plain(h.name, 200); f.start_date = timestamp(h.starts_at); f.end_date = timestamp(h.ends_at);
  f.registration_url = action(settings.external_apply_url);
  f.registration_start = timestamp(settings.reg_starts_at); f.registration_end = timestamp(settings.reg_ends_at);
  f.min_team_size = integer(h.team_min); f.max_team_size = integer(h.team_max);
  f.mode = settings.is_hybrid === true ? "hybrid" : h.is_online === true ? "online" : h.is_online === false ? "in-person" : null;
  f.location = text(h.location) || text(h.city); f.prize_pool = typeof pp.aggregatePrizeValue === "number" && Number.isFinite(pp.aggregatePrizeValue) ? String(pp.aggregatePrizeValue) : text(pp.aggregatePrizeValue); f.currency = text(pp.aggregatePrizeCurrency);
  registration(f, settings.registration_status, now);
  return finish(resolved, f, h.type === "HACKATHON" ? "hackathon" : "other", h.event_status, now, hash,
    { event_dates: "pageProps.hackathon.starts_at/ends_at", registration: "hackathon.settings.reg_starts_at/reg_ends_at", team_size: "hackathon.team_min/team_max", category: "hackathon.type" }, invalidDates([h.starts_at,h.ends_at,settings.reg_starts_at,settings.reg_ends_at]));
}

export function parseHack2skill(identity: SourceIdentity, payload: unknown, now: number, hash: string): Observation {
  const root = object(payload), h = object(root.data), tags = object(h.tags), f = base(identity);
  if (root.success !== true || !text(h.title)) throw new Error("Invalid public event detail response");
  if (h._id !== undefined && h._id !== identity.provider_id) throw new Error("Provider identity mismatch");
  f.registration_url = action(h.customEventUrl);
  f.name = plain(h.title, 200); f.registration_start = timestamp(h.registrationStart); f.registration_end = timestamp(h.registrationEnd);
  // submissionStart/End and registrationStart/End are NOT event timestamps.
  f.start_date = timestamp(h.startDate); f.end_date = timestamp(h.endDate);
  const team = object(tags.teamSize); f.min_team_size = integer(team.min); f.max_team_size = integer(team.max);
  const mode = object(tags.mode).value; f.mode = mode === "VIRTUAL" ? "online" : mode === "IN_PERSON" ? "in-person" : mode === "HYBRID" ? "hybrid" : null;
  f.location = text(h.venue); f.college = text(h.organizerName);
  registration(f, h.registrationStatus, now);
  if (h.isRegistrationOverride === true && f.registration_status !== "closed") f.registration_status = "unknown";
  const category = h.type === "HACKATHON" ? "hackathon" : h.type === "EVENT" ? "other" : "unknown";
  return finish(identity, f, category, h.eventStatus, now, hash, { event_dates: "event.startDate/endDate only when published", registration: "event.registrationStart/registrationEnd", team_size: "event.tags.teamSize", category: "event.type (EVENT is not hackathon proof)" }, invalidDates([h.startDate,h.endDate,h.registrationStart,h.registrationEnd]));
}
