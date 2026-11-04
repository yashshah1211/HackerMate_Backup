/* eslint-disable @typescript-eslint/no-require-imports -- Scheduled read-only script. */
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");
function canonicalUrl(raw) {
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) return null;
    return u.hostname.toLowerCase().replace(/^www\./, "") + (u.pathname.replace(/\/+$/, "") || "/");
  } catch { return null; }
}
const hostAllowed = {
  unstop: h => h === "unstop.com" || h === "www.unstop.com",
  devfolio: h => h === "devfolio.co" || h.endsWith(".devfolio.co"),
  hack2skill: h => h === "hack2skill.com" || h === "www.hack2skill.com",
};
function selectCandidates(events, oldLeadUrls, at = new Date()) {
  const known = new Set(oldLeadUrls.map(canonicalUrl).filter(Boolean));
  const now = at.getTime(), out = [];
  for (const event of events) {
    if (event.status !== "approved" || event.archived || event.type !== "external" || event.organizer_id) continue;
    const url = canonicalUrl(event.website_url), evidence = event.source_metadata;
    if (!url || known.has(url) || evidence?.version !== 1 || evidence.check_status !== "ok" ||
      evidence.category !== "hackathon" || evidence.event_status === "ended" ||
      !["open", "not-yet-open"].includes(evidence.facts?.registration_status) ||
      canonicalUrl(evidence.canonical_url) !== url || !/^[0-9a-f]{64}$/.test(evidence.source_hash || "")) continue;
    let host;
    try { host = new URL(event.website_url).hostname.toLowerCase(); } catch { continue; }
    if (!hostAllowed[evidence.provider]?.(host)) continue;
    const checked = Date.parse(evidence.checked_at || ""), expires = Date.parse(evidence.expires_at || "");
    if (!Number.isFinite(checked) || !Number.isFinite(expires) || checked > now + 60000 ||
      now - checked >= 26 * 3600000 || expires <= now || expires - checked > 26 * 3600000) continue;
    known.add(url);
    out.push({
      name: String(event.name || "").slice(0, 180),
      source_url: event.website_url,
      listed_host: event.college || null,
      provider: evidence.provider,
      registration_claim: evidence.facts.registration_status,
      checked_at: evidence.checked_at,
      review_status: "requires_manual_organizer_and_contact_verification",
    });
  }
  return out.sort((a, b) => b.checked_at.localeCompare(a.checked_at));
}
async function readAll(client, table, fields, configure = query => query) {
  const rows = [];
  for (let offset = 0; offset <= 20000; offset += 200) {
    const { data, error } = await configure(client.from(table).select(fields).order("id").range(offset, offset + 199));
    if (error || !Array.isArray(data)) throw new Error("Failed read of " + table + "; no partial candidate export");
    rows.push(...data);
    if (data.length < 200) return rows;
  }
  throw new Error("Read cap reached; refusing partial CRM deduplication");
}
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Existing Supabase credentials unavailable");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const [events, leads] = await Promise.all([
    readAll(client, "hackathons", "id,name,website_url,college,source_metadata,type,status,archived,organizer_id",
      query => query.eq("status", "approved").eq("archived", false)),
    readAll(client, "organizer_leads", "id,unstop_url"),
  ]);
  const list = selectCandidates(events, leads.map(x => x.unstop_url));
  const output = {
    generated_at: new Date().toISOString(),
    status: "READ_ONLY_MANUAL_REVIEW_ONLY",
    catalog_rows_scanned: events.length,
    crm_rows_deduplicated: leads.length,
    candidate_count: list.length,
    candidates: list.slice(0, 100),
    omitted_by_cap: Math.max(0, list.length - 100),
    notice: "No organizer contact verified, no email sent, and no production DB writes performed.",
  };
  const file = path.resolve(process.env.LEAD_CANDIDATE_OUTPUT || "artifacts/organizer-lead-candidates.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(output, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ candidate_count: list.length, catalog_rows_scanned: events.length, read_only: true }));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { canonicalUrl, selectCandidates };
