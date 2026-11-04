import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatabaseActivityData } from "./databaseActivityReport";

/**
 * Aggregate-only founder intelligence. Never put user emails, private messages,
 * feedback bodies, or organizer contact addresses into the email or PDF.
 */
export type FounderMetrics = {
  builders: number | null;
  onboardedNow: number | null;
  teams: number | null;
  joins: number | null;
  saves: number | null;
  invites: number | null;
  connections: number | null;
  messages: number | null;
  hackathons: number | null;
  leads: number | null;
  feedback: number | null;
  previousBuilders: number | null;
  previousSaves: number | null;
};

type MetricKey = keyof FounderMetrics;
export type BriefSection = { label: string; headline: string; detail: string };
export type FounderBrief = {
  date: string;
  window: string;
  windowHours: number;
  headline: string;
  subhead: string;
  metrics: FounderMetrics;
  sections: BriefSection[];
  attention: string[];
  nextSteps: string[];
  events: string[];
  caveats: string[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function countText(value: number | null, noun: string, plural?: string): string {
  return value === null ? "Unavailable " + noun : value + " " + (value === 1 ? noun : (plural || noun + "s"));
}
function fmtDate(iso: string): string {
  const at = new Date(iso);
  return Number.isFinite(at.getTime()) ? new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(at) + " IST" : "Time unavailable";
}
function prettyDate(iso: string): string {
  const at = new Date(iso);
  return Number.isFinite(at.getTime()) ? new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric",
  }).format(at) : "Date unavailable";
}

/** Every query independently fails as unavailable, never silently as zero. */
export async function fetchFounderMetrics(
  client: SupabaseClient, window: DatabaseActivityData["timeWindow"],
): Promise<FounderMetrics> {
  const from = Date.parse(window.since), until = Date.parse(window.until);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) {
    throw new Error("Cannot build founder report for an invalid time window.");
  }
  const previousFrom = new Date(from - (until - from)).toISOString();
  const plans: { key: MetricKey; table: string; field: string; since: string; before: string; onboarding?: boolean }[] = [
    { key: "builders", table: "profiles", field: "created_at", since: window.since, before: window.until },
    { key: "onboardedNow", table: "profiles", field: "created_at", since: window.since, before: window.until, onboarding: true },
    { key: "teams", table: "teams", field: "created_at", since: window.since, before: window.until },
    { key: "joins", table: "team_members", field: "created_at", since: window.since, before: window.until },
    { key: "saves", table: "saved_hackathons", field: "created_at", since: window.since, before: window.until },
    { key: "invites", table: "team_invites", field: "created_at", since: window.since, before: window.until },
    { key: "connections", table: "friend_requests", field: "created_at", since: window.since, before: window.until },
    { key: "messages", table: "messages", field: "created_at", since: window.since, before: window.until },
    { key: "hackathons", table: "hackathons", field: "created_at", since: window.since, before: window.until },
    { key: "leads", table: "organizer_leads", field: "created_at", since: window.since, before: window.until },
    { key: "feedback", table: "feedback", field: "created_at", since: window.since, before: window.until },
    { key: "previousBuilders", table: "profiles", field: "created_at", since: previousFrom, before: window.since },
    { key: "previousSaves", table: "saved_hackathons", field: "created_at", since: previousFrom, before: window.since },
  ];
  const results = await Promise.all(plans.map(async plan => {
    try {
      let query = client.from(plan.table).select("id", { count: "exact", head: true })
        .gte(plan.field, plan.since).lt(plan.field, plan.before);
      if (plan.onboarding) query = query.eq("onboarding_completed", true);
      const response = await query;
      if (response.error || !finite(response.count)) {
        console.warn("[Founder Brief] Count unavailable:", plan.key);
        return { key: plan.key, value: null };
      }
      return { key: plan.key, value: response.count };
    } catch {
      console.warn("[Founder Brief] Count query unavailable:", plan.key);
      return { key: plan.key, value: null };
    }
  }));
  return Object.fromEntries(results.map(r => [r.key, r.value])) as FounderMetrics;
}

export function buildFounderBrief(data: Pick<DatabaseActivityData, "timeWindow" | "hackathons">, m: FounderMetrics): FounderBrief {
  const since = Date.parse(data.timeWindow.since), until = Date.parse(data.timeWindow.until);
  if (!Number.isFinite(since) || !Number.isFinite(until) || until <= since) throw new Error("Invalid report window");
  const hours = (until - since) / 3600000;
  const quietParticipation = [m.teams, m.joins, m.saves, m.invites, m.messages]
    .every(n => n === 0);
  const missing = Object.entries(m).filter(([key, value]) => !key.startsWith("previous") && value === null).map(([key]) => key);
  const buildersKnown = m.builders !== null;
  const headline = missing.length
    ? "Some activity signals need verification."
    : m.builders && quietParticipation
      ? countText(m.builders, "builder") + " joined; team and save activity stayed quiet."
      : m.builders && (m.teams || m.joins || m.saves || m.invites || m.messages)
        ? "New builders arrived alongside visible product activity."
        : m.hackathons && m.hackathons > 0
          ? "Hackathon discovery moved forward in a quiet product window."
          : "A quiet window across the tracked HackerMate signals.";
  const subhead = missing.length
    ? "Unavailable counts are not treated as zero. Review the data coverage note below."
    : "An observation, not a verdict: short windows cannot explain why activity changed.";

  const sections: BriefSection[] = [
    {
      label: "PEOPLE",
      headline: countText(m.builders, "new builder"),
      detail: m.onboardedNow === null || !buildersKnown
        ? "Onboarding completion for these accounts is unavailable."
        : m.onboardedNow + " of the new accounts currently show completed onboarding. This is their present status, not proof of when they finished.",
    },
    {
      label: "COLLABORATION",
      headline: countText(m.teams, "new team") + " | " + countText(m.joins, "team join"),
      detail: "Invites: " + (m.invites ?? "unavailable") + ". Connections: " + (m.connections ?? "unavailable") +
        ". Messages: " + (m.messages ?? "unavailable") + ". These are recorded actions, not unique active users.",
    },
    {
      label: "HACKATHON DISCOVERY",
      headline: countText(m.hackathons, "new listing") + " | " + countText(m.saves, "event save"),
      detail: "New listings measure catalog additions; saves suggest interest, not completed registrations. External registration availability requires independent source verification.",
    },
    {
      label: "ORGANIZER PIPELINE",
      headline: countText(m.leads, "new organizer lead record"),
      detail: "CRM records are prospects, not verified contacts, conversations, accepted email sends, or partnership commitments.",
    },
  ];

  const attention: string[] = [];
  if (missing.length) attention.push("Data gap: " + missing.join(", ") + " could not be counted. Avoid comparing unavailable values.");
  if (m.builders !== null && m.builders >= 3 && quietParticipation)
    attention.push("Builder registrations happened without recorded team joins, invites, event saves, or messages. Inspect the first-session journey before calling this a trend.");
  if (m.hackathons !== null && m.hackathons > 0 && m.saves === 0)
    attention.push("The catalog gained listings but no event saves were recorded. Check whether the newest listings are relevant and easy to act on.");
  if (m.feedback !== null && m.feedback > 0)
    attention.push("New product feedback is available for review in the admin workspace. Don't infer sentiment from the count alone.");
  if (hours > 36) attention.push("This report covers more than 36 hours because it starts at the last accepted report checkpoint; it is not a standard 24-hour day.");
  if (!attention.length) attention.push("No specific intervention is supported by these counts alone. Keep watching the builder-to-team journey.");

  const nextSteps: string[] = [];
  if (m.builders !== null && m.builders > 0 && quietParticipation)
    nextSteps.push("Walk through signup to Find a Team and Save a Hackathon with a test account. Note confusing steps, not hypothetical conversion rates.");
  if (m.hackathons !== null && m.hackathons > 0)
    nextSteps.push("Spot-check a few new hackathon pages for real registration links, deadlines, and clear next actions.");
  if (m.leads !== null && m.leads > 0)
    nextSteps.push("Review new organizer lead records for legitimate contact evidence before drafting any outreach.");
  if (m.feedback !== null && m.feedback > 0)
    nextSteps.push("Read the newest user feedback and decide whether one issue deserves follow-up.");
  if (!nextSteps.length)
    nextSteps.push("Review the experience from discovery to joining a team; choose one concrete improvement to test.");
  const events = data.hackathons.map(e => String(e.name || "").trim())
    .filter(Boolean).slice(0, 4).map(s => s.length > 78 ? s.slice(0, 75) + "..." : s);
  const caveats = [
    "Window: " + fmtDate(data.timeWindow.since) + " to " + fmtDate(data.timeWindow.until) + ".",
    "Numbers represent recorded database activity, not necessarily real people active, external registrations, or email delivery.",
    "Onboarding-completed counts are a current-state check of accounts created during this window.",
  ];
  if (hours <= 36 && m.previousBuilders !== null && m.builders !== null) {
    const delta = m.builders - m.previousBuilders;
    caveats.push("New builders vs the immediately preceding equal-length window: " +
      (delta >= 0 ? "+" : "") + delta + ". This is descriptive, not a trend by itself.");
  }
  if (missing.length) caveats.push("Unavailable metrics: " + missing.join(", ") + ".");
  return { date: prettyDate(data.timeWindow.until), window: fmtDate(data.timeWindow.since) + " - " + fmtDate(data.timeWindow.until),
    windowHours: hours, headline, subhead, metrics: m, sections, attention: attention.slice(0, 4),
    nextSteps: nextSteps.slice(0, 3), events, caveats };
}
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/** Inline email HTML: Outlook/Gmail friendly and no third-party assets. */
export function founderBriefEmailHtml(brief: FounderBrief): string {
  const e = escapeHtml;
  const pill = (label: string, value: string) =>
    '<td style="padding:13px 14px;border:1px solid #2e3540;border-radius:10px;background:#131b22;width:33%;vertical-align:top">' +
    '<div style="font:600 10px Arial,sans-serif;color:#97a5b5;letter-spacing:1px">' + e(label) + '</div>' +
    '<div style="font:bold 23px Arial,sans-serif;color:#b4f461;padding-top:6px">' + e(value) + '</div></td>';
  const section = (item: BriefSection) =>
    '<tr><td style="padding:17px 0;border-bottom:1px solid #e9edf0">' +
    '<div style="font:bold 10px Arial,sans-serif;letter-spacing:1.6px;color:#557151">' + e(item.label) + '</div>' +
    '<div style="font:bold 17px Arial,sans-serif;color:#142019;padding-top:6px">' + e(item.headline) + '</div>' +
    '<p style="font:14px/1.65 Arial,sans-serif;color:#475260;margin:7px 0 0">' + e(item.detail) + '</p></td></tr>';
  const bullets = (items: string[]) => items.map(item =>
    '<tr><td style="padding:7px 0;font:14px/1.6 Arial,sans-serif;color:#283442">' +
    '<span style="color:#488e3e;font-weight:bold;padding-right:9px">&bull;</span>' + e(item) + '</td></tr>').join("");
  return '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>HackerMate Daily Founder Brief</title></head>' +
    '<body style="background:#eef0ef;margin:0;padding:24px 10px;color:#18231d">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;margin:auto;background:#fff;border-collapse:separate;border-spacing:0;border-radius:16px;overflow:hidden">' +
    '<tr><td style="padding:30px;background:#0b1211;border-top:5px solid #b4f461">' +
    '<div style="font:bold 13px Arial,sans-serif;letter-spacing:2px;color:#b4f461">HACKERMATE / FOUNDER BRIEF</div>' +
    '<div style="font:13px Arial,sans-serif;color:#c2ccd0;padding-top:8px">' + e(brief.date) + '</div>' +
    '<h1 style="font:bold 29px/1.2 Arial,sans-serif;letter-spacing:-.7px;color:#fff;margin:20px 0 10px">' + e(brief.headline) + '</h1>' +
    '<p style="font:14px/1.65 Arial,sans-serif;color:#b9c7c2;margin:0 0 24px">' + e(brief.subhead) + '</p>' +
    '<table role="presentation" cellpadding="0" cellspacing="6" style="width:100%"><tr>' +
    pill("BUILDERS", brief.metrics.builders === null ? "N/A" : "+" + brief.metrics.builders) +
    pill("TEAMS", brief.metrics.teams === null ? "N/A" : "+" + brief.metrics.teams) +
    pill("EVENT SAVES", brief.metrics.saves === null ? "N/A" : "" + brief.metrics.saves) +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:25px 30px 12px">' +
    '<div style="font:bold 11px Arial,sans-serif;color:#758178;letter-spacing:1.5px">WHAT ACTUALLY MOVED</div>' +
    '<table role="presentation" style="width:100%;border-collapse:collapse">' + brief.sections.map(section).join("") + '</table>' +
    '<h2 style="font:bold 19px Arial,sans-serif;margin:27px 0 10px;color:#142019">Worth your attention</h2>' +
    '<table role="presentation" style="width:100%;border-collapse:collapse">' + bullets(brief.attention) + '</table>' +
    '<h2 style="font:bold 19px Arial,sans-serif;margin:27px 0 10px;color:#142019">What to do next</h2>' +
    '<table role="presentation" style="width:100%;border-collapse:collapse">' + bullets(brief.nextSteps) + '</table>' +
    '<p style="margin:24px 0"><a href="https://www.hackermate.in/admin" style="display:inline-block;background:#b4f461;color:#111b12;font:bold 14px Arial,sans-serif;padding:13px 18px;border-radius:8px;text-decoration:none">Open HackerMate admin</a></p>' +
    '<p style="font:12px/1.5 Arial,sans-serif;color:#778078;margin:18px 0 5px">Reporting window: ' + e(brief.window) + '</p>' +
    '<p style="font:12px/1.5 Arial,sans-serif;color:#778078;margin:0 0 20px">Counts are activity evidence, not proof of event registration, email delivery or user intent. Detailed source notes are in the attached PDF.</p>' +
    '</td></tr></table></body></html>';
}
