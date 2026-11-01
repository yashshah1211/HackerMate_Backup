import { descriptionText } from "./description";
import { eventDate, eventState, registrationState } from "./lifecycle";
export { eventDate, eventState } from "./lifecycle";
/** Deterministic discovery from listed event metadata; no inferred eligibility or exchange rates. */
export type DiscoveryEvent = {
  id: string; name: string; description: string | null; tags: string[] | null;
  start_date: string | null; end_date: string | null; registration_end?: string | null; registration_start?: string | null; registration_status?: string | null;
  created_at?: string | null; location: string | null; mode: string | null;
  prize_pool: string | null; currency?: string | null; website_url: string | null;
  type: string | null; organizer_id?: string | null; college?: string | null;
  min_team_size?: number | null; max_team_size?: number | null;
};
export type EventState = "upcoming" | "ongoing" | "ended" | "unknown";
export type DiscoveryTab = "recommended" | "upcoming" | "ongoing" | "saved" | "past" | "all";
export type DiscoverySort = "relevant" | "date" | "recent" | "prize-inr" | "prize-usd";
export type DiscoverySettings = {
  tab: DiscoveryTab; q: string; mode: string; platform: string; topic: string;
  sort: DiscoverySort; from: string; to: string; participation: string; registration: string;
};
const norm = (value: string) => value.trim().toLowerCase();
const GENERIC = new Set(["coding", "hackathon", "hackathons", "unstop", "devfolio", "hack2skill", "competition"]);
export function listedTags(tags: string[] | null | undefined): string[] {
  const unique = new Map<string, string>();
  for (const tag of tags || []) if (typeof tag === "string" && tag.trim() && !unique.has(norm(tag))) unique.set(norm(tag), tag.trim());
  return [...unique.values()];
}
export function eventTopics(event: Pick<DiscoveryEvent, "tags">): string[] {
  return listedTags(event.tags).filter(tag => !GENERIC.has(norm(tag)));
}
export function plainEventText(value: string | null | undefined): string {
  return descriptionText(value || "");
}
export function eventFormat(mode: string | null): string {
  const value = norm(mode || "");
  if (value.includes("hybrid")) return "hybrid";
  if (["online", "virtual", "remote"].includes(value)) return "online";
  if (["offline", "in-person", "in person", "inperson", "on-site", "onsite"].includes(value)) return "in-person";
  return "";
}
export function eventPlatform(event: Pick<DiscoveryEvent, "type" | "website_url">): string {
  if (norm(event.type || "") === "native") return "native";
  try {
    const url = new URL(event.website_url || "");
    if (!["http:", "https:"].includes(url.protocol)) return "other";
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    for (const [domain, label] of [["unstop.com", "unstop"], ["devfolio.co", "devfolio"], ["hack2skill.com", "hack2skill"]]) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return label;
    }
  } catch { /* Unknown links remain external; URL substrings are not platform evidence. */ }
  return "other";
}
export function knownLocation(location: string | null | undefined): string | null {
  const value = (location || "").trim();
  return !value || /^(?:venue in india|india|tba|tbd|n\/a|not specified|to be announced|venue tbd|online|virtual)$/i.test(value) ? null : value;
}
export type CashPrize = { amount: number; currency: "INR" | "USD" };
export function cashPrize(prize: string | null | undefined, currency?: string | null): CashPrize | null {
  const text = plainEventText(prize).replace(/&#(?:8377|x20b9);/gi, "₹");
  const match = text.match(/^(?:(₹|\$|INR|USD|Rs\.?)\s*)?((?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3}|\d+)(?:\.\d{1,2})?)\s*(k|m|million|lakhs?|lacs?|crores?|cr)?\s*(₹|\$|INR|USD|Rs\.?)?$/i);
  if (!match) return null; // Bundled perks, credits, ranges and reward valuations are not known cash.
  const unit = (value?: string | null) => /^(?:INR|₹|Rs\.?)$/i.test((value || "").trim()) ? "INR"
    : /^(?:USD|\$)$/i.test((value || "").trim()) ? "USD" : null;
  const prefix = unit(match[1]), suffix = unit(match[4]), declared = unit(currency);
  const actual = prefix || suffix || declared;
  if (!actual || (currency?.trim() && !declared) || (prefix && suffix && prefix !== suffix) || (declared && actual !== declared)) return null;
  const magnitude = (match[3] || "").toLowerCase();
  const multiplier = magnitude === "k" ? 1000 : /^(m|million)$/.test(magnitude) ? 1000000
    : /^(lakh|lac)s?$/.test(magnitude) ? 100000 : /^(crore|cr)s?$/.test(magnitude) ? 10000000 : 1;
  const amount = Number(match[2].replace(/,/g, "")) * multiplier;
  return Number.isFinite(amount) && amount <= Number.MAX_SAFE_INTEGER ? { amount, currency: actual } : null;
}
export function prizeLabel(event: Pick<DiscoveryEvent, "prize_pool" | "currency">): string {
  const prize = cashPrize(event.prize_pool, event.currency);
  if (prize) return new Intl.NumberFormat("en-IN", { style: "currency", currency: prize.currency, maximumFractionDigits: 2 }).format(prize.amount);
  const text = plainEventText(event.prize_pool);
  if (/^[\d,.\s]+$/.test(text)) return `${text} (currency not specified)`;
  return text || "Prize not specified";
}
export function skillEvidence(event: DiscoveryEvent, skills: string[]): string[] {
  const mine = new Set(listedTags(skills).map(norm).filter(skill => !GENERIC.has(skill)));
  return eventTopics(event).filter(tag => mine.has(norm(tag)));
}
export function discoveryReason(event: DiscoveryEvent, skills: string[], now: number): string {
  const shared = skillEvidence(event, skills);
  if (shared.length) return `Tags match your listed skills: ${shared.slice(0, 2).join(", ")}${shared.length > 2 ? ` and ${shared.length - 2} more` : ""}`;
  if (!eventTopics(event).length) return "Explore this event · specific topic tags not listed";
  if (!listedTags(skills).length) return "Explore this event · add profile skills to personalize the order";
  return eventState(event, now) === "ongoing" ? "Ongoing event · check official registration availability" : "Explore beyond your listed skills";
}
const tabs = ["recommended", "upcoming", "ongoing", "saved", "past", "all"];
const sorts = ["relevant", "date", "recent", "prize-inr", "prize-usd"];
export function readDiscoverySettings(params: Pick<URLSearchParams, "getAll">): DiscoverySettings {
  const get = (key: string) => { const values = params.getAll(key); return values.length === 1 ? values[0].trim() : ""; };
  const tab = (tabs.includes(get("tab")) ? get("tab") : "recommended") as DiscoveryTab;
  const choice = (key: string, options: string[]) => options.includes(get(key)) ? get(key) : "";
  const date = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(get(key)) && eventDate(get(key)) !== null ? get(key) : "";
  const requestedSort = get("sort") === "prize" ? "prize-inr" : get("sort");
  const queryValues = params.getAll("q");
  return { tab, q: (queryValues.length === 1 ? queryValues[0] : "").slice(0, 200), mode: choice("mode", ["online", "in-person", "hybrid"]),
    platform: choice("platform", ["native", "unstop", "devfolio", "hack2skill", "other"]), topic: norm(get("topic")),
    sort: (sorts.includes(requestedSort) ? requestedSort : tab === "recommended" ? "relevant" : "date") as DiscoverySort,
    from: date("from"), to: date("to"), participation: choice("participation", ["solo", "team"]),
    registration: choice("registration", ["not-closed", "recorded", "open", "closed", "unknown", "not-yet-open", "all"]) };
}
/** Preserve unrelated query values while writing validated, shareable discovery settings. */
export function discoveryQuery(params: URLSearchParams, patch: Partial<DiscoverySettings>): string {
  const settings = { ...readDiscoverySettings(params), ...patch };
  if (patch.tab && !params.has("sort") && !patch.sort) settings.sort = patch.tab === "recommended" ? "relevant" : "date";
  const defaults = readDiscoverySettings(new URLSearchParams(`tab=${settings.tab}`));
  defaults.tab = "recommended";
  const output = new URLSearchParams(params);
  for (const [key, value] of Object.entries(settings)) {
    output.delete(key);
    if (value && value !== defaults[key as keyof DiscoverySettings]) output.set(key, value);
  }
  // Re-read to prevent invalid settings from UI/callers entering a shared link.
  const valid = readDiscoverySettings(output);
  for (const key of Object.keys(settings) as (keyof DiscoverySettings)[]) {
    output.delete(key);
    if (valid[key] && valid[key] !== defaults[key]) output.set(key, valid[key]);
  }
  return output.toString();
}
export function discoverEvents(events: DiscoveryEvent[], settings: DiscoverySettings, skills: string[], saved: Set<string>, now: number): DiscoveryEvent[] {
  const terms = norm(settings.q).split(/\s+/).filter(Boolean), from = eventDate(settings.from), to = eventDate(settings.to, true);
  const selected = events.filter(event => {
    const state = eventState(event, now);
    if (settings.tab !== "all" && (settings.tab === "saved" ? !saved.has(event.id) : settings.tab === "recommended" ? state === "ended"
      : settings.tab === "past" ? state !== "ended" : state !== settings.tab)) return false;
    if (settings.mode && eventFormat(event.mode) !== settings.mode) return false;
    if (settings.platform && eventPlatform(event) !== settings.platform) return false;
    if (settings.topic && !eventTopics(event).some(tag => norm(tag) === settings.topic)) return false;
    const searchable = norm([event.name, plainEventText(event.description), ...(listedTags(event.tags)), event.college, knownLocation(event.location)].filter(Boolean).join(" "));
    if (!terms.every(term => searchable.includes(term))) return false;
    const start = eventDate(event.start_date);
    if ((from !== null || to !== null) && (start === null || (from !== null && start < from) || (to !== null && start >= to))) return false;
    if (settings.participation) {
      const min = event.min_team_size, max = event.max_team_size;
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || !min || !max || min < 1 || max < min) return false;
      if (settings.participation === "solo" ? min !== 1 : max < 2) return false;
    }
    const registration = registrationState(event, now);
    const active = !["saved", "past", "all"].includes(settings.tab);
    if (active && !settings.registration && registration === "closed") return false;
    if (["open", "closed", "unknown", "not-yet-open"].includes(settings.registration) && registration !== settings.registration) return false;
    const deadline = eventDate(event.registration_end, true);
    if (settings.registration === "recorded" && deadline === null) return false;
    if (settings.registration === "not-closed" && deadline !== null && now >= deadline) return false;
    return true;
  });
  const compareId = (a: DiscoveryEvent, b: DiscoveryEvent) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const knownCompare = (a: number | null, b: number | null, descending = false) => a === b ? 0 : a === null ? 1 : b === null ? -1 : descending ? b - a : a - b;
  const byDate = (a: DiscoveryEvent, b: DiscoveryEvent) => {
    if (settings.tab === "past") return knownCompare(eventDate(a.end_date, true), eventDate(b.end_date, true), true);
    const group = (event: DiscoveryEvent) => ({ upcoming: 0, ongoing: 1, unknown: 3, ended: 2 }[eventState(event, now)]);
    return group(a) - group(b) || knownCompare(eventDate(a.start_date), eventDate(b.start_date));
  };
  return selected.sort((a, b) => {
    const active = !["saved", "past", "all"].includes(settings.tab);
    const rank = (event: DiscoveryEvent) => ({ open: 0, unknown: 1, "not-yet-open": 2, closed: 3 }[registrationState(event, now)]);
    let comparison = active && settings.registration !== "recorded" ? rank(a) - rank(b) : 0;
    if (comparison) return comparison;
    if (settings.sort === "relevant") {
      const closed = (event: DiscoveryEvent) => { const deadline = eventDate(event.registration_end, true); return deadline !== null && now >= deadline ? 1 : 0; };
      comparison = closed(a) - closed(b) || skillEvidence(b, skills).length - skillEvidence(a, skills).length;
    } else if (settings.sort === "recent") comparison = knownCompare(eventDate(a.created_at), eventDate(b.created_at), true);
    else if (settings.sort.startsWith("prize-")) {
      const currency = settings.sort === "prize-inr" ? "INR" : "USD";
      const amount = (event: DiscoveryEvent) => { const prize = cashPrize(event.prize_pool, event.currency); return prize?.currency === currency ? prize.amount : null; };
      comparison = knownCompare(amount(a), amount(b), true);
    }
    return comparison || byDate(a, b) || compareId(a, b);
  });
}
