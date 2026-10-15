import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";

export type CountMetric = {
  source: string;
} & (
  | { status: "verified"; value: number }
  | { status: "failed" | "unavailable"; value: null; reason: string }
);

type PeriodCounts = { total: CountMetric; last24h: CountMetric; last7d: CountMetric };

export interface AnalyticsSummary {
  generatedAt: string;
  windows: { last24h: string; last7d: string; until: string };
  databaseStatus: "complete" | "partial" | "unavailable";
  counts: {
    registeredProfiles: PeriodCounts;
    teams: PeriodCounts;
    evaluationRecords: PeriodCounts;
  };
  unavailable: {
    label: string;
    status: "unmeasured" | "unavailable";
    value: null;
    reason: string;
  }[];
}

const groups = [
  { key: "registeredProfiles", table: "profiles", label: "Registered profiles" },
  { key: "teams", table: "teams", label: "Teams" },
  { key: "evaluationRecords", table: "team_ppt_evaluations", label: "Evaluation records" },
] as const;
const periods = ["total", "last24h", "last7d"] as const;

// These are deliberately not inferred from account or activity counts. A client
// GA measurement ID alone cannot retrieve measured traffic for this report.
function unavailableMetrics(): AnalyticsSummary["unavailable"] {
  return [
    ...["Pageviews", "Unique visitors", "Active users", "Top pages", "Referrers", "Devices"].map(label => ({
      label, status: "unmeasured" as const, value: null,
      reason: "No verified traffic data source is connected to this report.",
    })),
    { label: "Traffic growth / conversion rates", status: "unavailable", value: null,
      reason: "Cannot be derived from the current database counts." },
    { label: "New connections", status: "unavailable", value: null,
      reason: "The connections relation was absent from the audited schema; no verified replacement is used." },
  ];
}

async function exactCount(
  client: SupabaseClient, table: string, until: string, since?: string,
): Promise<CountMetric> {
  const source = `${table}: exact retained-row count; created_at <= ${until}${since ? ` and >= ${since}` : ""}`;
  try {
    let query = client.from(table).select("id", { count: "exact", head: true }).lte("created_at", until);
    if (since) query = query.gte("created_at", since);
    const { count, error } = await query;
    if (error) return { status: "failed", value: null, source, reason: "Database count query failed." };
    if (count === null || !Number.isSafeInteger(count) || count < 0) {
      return { status: "failed", value: null, source, reason: "Database query returned no valid exact count." };
    }
    return { status: "verified", value: count, source };
  } catch {
    return { status: "failed", value: null, source, reason: "Database count query did not complete." };
  }
}

export async function fetchPlatformAnalytics(): Promise<AnalyticsSummary> {
  const now = Date.now();
  const until = new Date(now).toISOString();
  const windows = {
    last24h: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    last7d: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    until,
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let client: SupabaseClient | undefined;
  let initializationFailure = false;
  if (url && key) {
    try {
      client = createClient(url, key);
    } catch {
      initializationFailure = true;
    }
  }

  const rows = await Promise.all(groups.map(async ({ table }) => {
    const values = await Promise.all(periods.map(period => {
      if (!client) {
        return {
          status: initializationFailure ? "failed" as const : "unavailable" as const,
          value: null, source: table,
          reason: initializationFailure ? "Database client initialization failed." : "Database credentials are not configured.",
        };
      }
      return exactCount(client, table, until, period === "total" ? undefined : windows[period]);
    }));
    return { total: values[0], last24h: values[1], last7d: values[2] };
  }));
  const verified = rows.flatMap(row => Object.values(row)).filter(metric => metric.status === "verified").length;
  return {
    generatedAt: until,
    windows,
    databaseStatus: verified === 9 ? "complete" : verified === 0 ? "unavailable" : "partial",
    counts: { registeredProfiles: rows[0], teams: rows[1], evaluationRecords: rows[2] },
    unavailable: unavailableMetrics(),
  };
}

export function formatCount(metric: CountMetric): string {
  if (metric.status === "verified") return String(metric.value);
  return metric.status === "failed" ? "Query failed" : "Unavailable";
}

const coverage = (data: AnalyticsSummary) => ({
  complete: "Database counts: all queries verified",
  partial: "Database counts: incomplete - some queries failed or unavailable",
  unavailable: "Database counts: unavailable - no verified counts",
})[data.databaseStatus];

const notes = [
  "Counts cover currently retained rows, queried independently (not a transaction snapshot).",
  "Registered profiles are accounts, not unique visitors or active users.",
  "Evaluation records include pending, completed and failed attempts.",
  "24h and 7d count records by creation time; these are not growth or conversion rates.",
];

export function generateAnalyticsPdfBuffer(data: AnalyticsSummary, dateStr: string): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  doc.setFillColor(9, 9, 11);
  doc.rect(0, 0, 595, 842, "F");
  doc.setFillColor(24, 24, 27);
  doc.roundedRect(40, 40, 515, 85, 8, 8, "F");
  doc.setTextColor(180, 244, 97);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PLATFORM DATABASE DIGEST", 60, 64);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text("HackerMate Daily Executive Digest", 60, 88);
  doc.setTextColor(161, 161, 170);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Date: ${dateStr} | Generated: ${data.generatedAt}`, 60, 108);
  doc.text(coverage(data), 40, 145);

  const metrics = [
    { label: "REGISTERED PROFILES", metric: data.counts.registeredProfiles.total },
    { label: "NEW PROFILES (24H)", metric: data.counts.registeredProfiles.last24h },
    { label: "NEW TEAMS (24H)", metric: data.counts.teams.last24h },
    { label: "EVAL RECORDS (24H)", metric: data.counts.evaluationRecords.last24h },
  ];
  metrics.forEach(({ label, metric }, i) => {
    const x = 40 + i * 131.5;
    doc.setFillColor(24, 24, 27);
    doc.roundedRect(x, 160, 120, 65, 6, 6, "F");
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(8);
    doc.text(label, x + 10, 180);
    doc.setTextColor(180, 244, 97);
    doc.setFontSize(metric.status === "verified" ? 20 : 12);
    doc.text(formatCount(metric), x + 10, 207);
  });

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Database record counts", 40, 252);
  doc.setFillColor(24, 24, 27);
  doc.roundedRect(40, 265, 515, 110, 6, 6, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Retained rows", 55, 285);
  ["All time", "Last 24h", "Last 7d"].forEach((label, i) => doc.text(label, 300 + i * 85, 285));
  groups.forEach(({ key, label }, i) => {
    const y = 310 + i * 23;
    doc.text(label, 55, y);
    periods.forEach((period, j) => doc.text(formatCount(data.counts[key][period]), 300 + j * 85, y));
  });

  doc.setTextColor(161, 161, 170);
  doc.setFontSize(8);
  notes.forEach((note, i) => doc.text(note, 40, 395 + i * 13));
  doc.text(`Sources: profiles, teams, team_ppt_evaluations; successful exact counts only.`, 40, 450);
  doc.text(`24h from: ${data.windows.last24h} | 7d from: ${data.windows.last7d}`, 40, 463);
  doc.text(`Both windows end at: ${data.windows.until} (UTC, inclusive bounds).`, 40, 476);
  doc.text("Query failed = failed read; Unavailable = no usable data source/configuration.", 40, 489);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("Unmeasured and unavailable metrics", 40, 518);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let y = 542;
  data.unavailable.forEach(metric => {
    doc.setTextColor(228, 228, 231);
    doc.text(`${metric.label}: ${metric.status === "unmeasured" ? "Unmeasured" : "Unavailable"}`, 40, y);
    doc.setTextColor(161, 161, 170);
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(metric.reason, 500);
    doc.text(lines, 40, y + 12);
    y += 18 + lines.length * 9;
    doc.setFontSize(9);
  });
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.text(`HackerMate Automated Daily Platform Digest | ${dateStr}`, 40, 820);
  return Buffer.from(doc.output("arraybuffer"));
}

export function generateEmailHtml(data: AnalyticsSummary, dateStr: string): string {
  return `
    <div style="font-family: sans-serif; background-color: #09090b; color: #f4f4f5; padding: 32px; border-radius: 12px; max-width: 600px; margin: 0 auto;">
      <span style="color: #B4F461; font-size: 11px; font-weight: bold;">PLATFORM DATABASE DIGEST</span>
      <h1 style="color: #ffffff; font-size: 22px;">HackerMate Daily Executive Report</h1>
      <p style="color: #a1a1aa;">${dateStr} | Generated: ${data.generatedAt}</p>
      <p>${coverage(data)}</p>
      <table style="background-color: #18181b; width: 100%; text-align: left; padding: 16px; border-radius: 8px;">
        <thead><tr><th>Retained rows</th><th>All time</th><th>Last 24h</th><th>Last 7d</th></tr></thead>
        <tbody>${groups.map(({ key, label }) => `<tr><td>${label}</td>${periods.map(period => `<td>${formatCount(data.counts[key][period])}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
      <p>Sources: profiles, teams, team_ppt_evaluations; successful exact counts only.</p>
      ${notes.map(note => `<p style="color: #a1a1aa; font-size: 12px;">${note}</p>`).join("")}
      <p style="font-size: 12px;">24h from ${data.windows.last24h}; 7d from ${data.windows.last7d}; both end at ${data.windows.until} (UTC, inclusive bounds).</p>
      <p>Query failed = failed read; Unavailable = no usable data source/configuration.</p>
      <h3>Unmeasured and unavailable metrics</h3>
      ${data.unavailable.map(metric => `<p>${metric.label}: <strong>${metric.status === "unmeasured" ? "Unmeasured" : "Unavailable"}</strong>. ${metric.reason}</p>`).join("")}
      <p style="color: #71717a; font-size: 11px;">The formatted HackerMate Daily Platform Digest PDF is attached.</p>
    </div>`;
}
