import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedProfile, type AuthCookieUpdate } from "@/lib/admin/requireAdmin";
import { requirePartnerAccess } from "@/lib/partners/requirePartnerAccess";
import { csvCell } from "@/lib/partners/csv";
import { BASE, CLOSES, EVENT_ID, MAX_CSV_BYTES, newToken, parseCsv, previewCsv, receipt, tokenHash, verifyReceipt, type Mapping, type TeamInput } from "./core";

// Two independent, server-only switches; unset means OFF. Release approval is
// configuration only after this patch and its operational gates are approved.
// Read both on every request, never cache approval at module initialization.
export function enabled(): boolean {
  if (process.env.HUSTLE_PHASE2_ENABLED !== "true") return false;
  const PRODUCTION_RELEASE_APPROVED = process.env.HUSTLE_PHASE2_RELEASE_APPROVED === "true";
  try { const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (process.env.NODE_ENV === "production") {
      return PRODUCTION_RELEASE_APPROVED && process.env.VERCEL_ENV === "production"
        && process.env.HUSTLE_PHASE2_LOCAL_FIXTURE !== "true"
        && url.protocol === "https:" && url.hostname === "rhryjrbebfrrfhtyyzbs.supabase.co"
        && !url.port && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash
        && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() && !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    }
    // Never allow a hosted Preview to use the disposable local fixture bypass.
    return !process.env.VERCEL_ENV && ["development", "test"].includes(process.env.NODE_ENV || "")
      && process.env.HUSTLE_PHASE2_LOCAL_FIXTURE === "true"
      && url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch { return false; }
}
export const COOKIE = "hm_hustle_p2";
export const PRIVATE_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" };
export function secure(response: Response): Response { for (const [k, v] of Object.entries(PRIVATE_HEADERS)) response.headers.set(k, v); return response; }
export async function withAuthCookies(operation: (onCookies: (cookies: AuthCookieUpdate[]) => void) => Promise<Response>): Promise<Response> {
  const updates = new Map<string, AuthCookieUpdate>();
  const result = await operation(cookies => cookies.forEach(cookie => updates.set(cookie.name, cookie)));
  if (!updates.size) return result;
  const response = new NextResponse(result.body, { status: result.status, headers: result.headers });
  updates.forEach(cookie => response.cookies.set(cookie.name, cookie.value, cookie.options));
  return secure(response);
}
export function json(body: unknown, status = 200) { return secure(NextResponse.json(body, { status })); }
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, "Round 2 is unavailable. Please try again later.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await database().rpc(name, args);
  if (error) {
    // Preserve diagnostic code/message, omit PII-bearing detail/hint payloads.
    console.error("[hustle-phase2] Database error", { operation: name, code: error.code, message: error.message });
    if (["23505", "23514", "P0001", "22023", "22P02"].includes(error.code)) throw new HttpError(409, "The operation conflicts with the current shortlist. Refresh and review the batch.");
    if (error.code === "42501") throw new HttpError(403, "Access denied.");
    throw new HttpError(503, "Round 2 is unavailable. Please try again later.");
  }
  if (data === null && name !== "hustle_phase2_inspect") throw new HttpError(503, "Round 2 is unavailable. Please try again later.");
  return data as T;
}
async function requireActiveSession(client: ReturnType<typeof database>) {
  // Use only the verified caller's client. No session IDs/rows reach this server.
  const { data, error } = await client.rpc("hustle_phase2_has_active_session");
  if (error) {
    console.error("[hustle-phase2] Session verification failed", { code: error.code });
    throw new HttpError(503, "Unable to verify access.");
  }
  if (data !== true) throw new HttpError(403, "A current signed-in session is required.");
}
export async function authorize(req: NextRequest, admin: boolean, onCookies?: (cookies: AuthCookieUpdate[]) => void) {
  if (admin) {
    const auth = await requireVerifiedProfile(req, { unauthenticatedStatus: 401, lookupFailureStatus: 500, onCookies });
    if (auth instanceof NextResponse) throw new HttpError(auth.status, "Authorized administrator access required.");
    if (!auth.isAdmin) throw new HttpError(403, "Authorized administrator access required.");
    await requireActiveSession(auth.supabaseUserClient);
    return { actor: auth.user.id, isAdmin: true, client: auth.supabaseUserClient };
  }
  const auth = await requirePartnerAccess(req, { hackathonId: EVENT_ID }, { detailedErrors: true, onCookies });
  if (auth instanceof NextResponse) throw new HttpError(auth.status, "Authorized event organizer access required.");
  await requireActiveSession(auth.supabaseUserClient);
  const { data, error } = await auth.supabaseUserClient.rpc("has_partner_admin_access");
  if (error) { console.error("[hustle-phase2] Admin access lookup failed", { code: error.code, message: error.message }); throw new HttpError(503, "Unable to verify access."); }
  return { actor: auth.userId, isAdmin: data === true, client: auth.supabaseUserClient };
}
function exactKeys(data: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new HttpError(400, "Unknown request fields are not accepted.");
}
export function sameOrigin(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin || req.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Same-origin request required.");
}
async function body(req: NextRequest, max = MAX_CSV_BYTES * 2 + 8192): Promise<string> {
  if (Number(req.headers.get("content-length")) > max) throw new HttpError(413, "Upload is too large.");
  const reader = req.body?.getReader(); if (!reader) throw new HttpError(400, "Request body required.");
  const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > max) { await reader.cancel(); throw new HttpError(413, "Upload is too large."); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
async function payload(req: NextRequest): Promise<Record<string, unknown>> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(415, "JSON required.");
  try { const data = JSON.parse(await body(req)); if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(); return data; }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "Invalid JSON."); }
}
export type Team = TeamInput & { id: string; batch_id: string; decision: "pending" | "confirmed" | "declined"; decided_at: string | null; invite_status: "not_created" | "ready" | "revoked" };
export type Snapshot = { teams: Team[]; batches: { id: string; source_digest: string; row_count: number; activated_at: string | null }[]; counts: { shortlisted: number; confirmed: number; declined: number; pending: number }; };
export type Invitation = { team_name: string; leader_name: string; second_member_name: string | null; decision: string; window: "before" | "open" | "closed" };
export async function inspect(token: string): Promise<Invitation | null> { const hash = tokenHash(token); return hash ? rpc("hustle_phase2_inspect", { p_hash: hash }) : null; }
export async function snapshot(client: ReturnType<typeof database>): Promise<Snapshot> {
  const { data, error } = await client.rpc("hustle_phase2_snapshot");
  if (error) { console.error("[hustle-phase2] Snapshot failed", { code: error.code, message: error.message }); throw new HttpError(error.code === "42501" ? 403 : 503, "Unable to load the shortlist."); }
  if (!data) throw new HttpError(503, "Unable to load the shortlist.");
  return data as Snapshot;
}
async function limit(key: string, max: number) { if (!await rpc<boolean>("hustle_phase2_limit", { p_key: key, p_max: max })) throw new HttpError(429, "Too many requests. Try again in a minute."); }
function uuid(value: unknown): string { if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, "Invalid identifier."); return value; }

export function handleApi(req: NextRequest, action: string): Promise<Response> {
  return withAuthCookies(onCookies => handleApiRequest(req, action, onCookies));
}
async function handleApiRequest(req: NextRequest, action: string, onCookies: (cookies: AuthCookieUpdate[]) => void): Promise<Response> {
  try {
    if (!enabled()) return json({ error: "Round 2 registration is not available yet." }, 503);
    if (req.nextUrl.search) throw new HttpError(400, "Query parameters are not accepted.");
    if (req.method === "POST") sameOrigin(req);
    if (req.method === "GET" && ["organizer", "export"].includes(action)) {
      const auth = await authorize(req, false, onCookies); const data = await snapshot(auth.client);
      if (action === "organizer") return json({ ...data, isAdmin: auth.isAdmin });
      const fields = ["Team ID", "Team", "Leader", "Leader email", "Leader WhatsApp", "Second member", "Response", "Responded at"];
      const csv = [fields, ...data.teams.map(t => [t.external_team_id, t.team_name, t.leader_name, t.leader_email, t.leader_whatsapp || "", t.second_member_name || "", t.decision, t.decided_at || ""])].map(row => row.map(csvCell).join(",")).join("\r\n");
      return secure(new Response("\uFEFF" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="hustle-round2-shortlist.csv"' } }));
    }
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
    if (action === "session") {
      await limit("public", 300);
      if (!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new HttpError(415, "Form required.");
      const form = new URLSearchParams(await body(req, 1024)); const token = form.get("token") || "";
      if (!await inspect(token)) throw new HttpError(404, "Invitation is invalid or unavailable.");
      const response = NextResponse.redirect(new URL(BASE, req.url), 303);
      response.cookies.set(COOKIE, token, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "strict", path: "/", maxAge: Math.max(0, Math.min(1200, Math.floor((Date.parse(CLOSES) - Date.now()) / 1000))) });
      return secure(response);
    }
    if (action === "respond") {
      await limit("public", 300);
      const hash = tokenHash(req.cookies.get(COOKIE)?.value || "");
      if (!hash) throw new HttpError(404, "Invitation is invalid or unavailable.");
      await limit(hash, 12);
      const data = await payload(req);
      if (Object.keys(data).length !== 1 || !["confirmed", "declined"].includes(String(data.decision))) throw new HttpError(400, "Choose confirm or decline.");
      const result = await rpc<{ status: string; decision?: string }>("hustle_phase2_respond", { p_hash: hash, p_decision: data.decision });
      if (result.status !== "ok") throw new HttpError(result.status === "invalid" ? 404 : 409, result.status === "conflict" ? "A different response is already recorded. Contact the organizer." : "Registration is unavailable or outside the registration window.");
      return json(result);
    }
    const auth = await authorize(req, true, onCookies); await limit(`admin:${auth.actor}`, 30); const data = await payload(req);
    if (action === "columns") {
      exactKeys(data, ["csv"]);
      if (typeof data.csv !== "string") throw new HttpError(400, "CSV required.");
      try { return json({ headers: parseCsv(data.csv)[0].map(h => h.trim()) }); }
      catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid CSV."); }
    }
    if (action === "import") {
      exactKeys(data, ["mode", "csv", "mapping", "receipt"]);
      if (typeof data.csv !== "string" || !["preview", "commit"].includes(String(data.mode))) throw new HttpError(400, "CSV and preview/commit mode required.");
      let preview; try { preview = previewCsv(data.csv, data.mapping as Mapping); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid CSV."); }
      const existing = await snapshot(auth.client);
      for (const row of preview.rows) if (existing.teams.some(t => t.external_team_id === row.external_team_id || t.leader_email === row.leader_email || (row.leader_whatsapp && t.leader_whatsapp === row.leader_whatsapp))) preview.issues.push({ row: preview.rows.indexOf(row) + 2, field: "team_id", message: "Team or leader contact already exists in the shortlist. Existing data will not be overwritten." });
      if (existing.teams.length + preview.total > 500) preview.issues.push({ row: 0, field: "file", message: "Pilot limit is 500 shortlisted teams." });
      const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      if (data.mode === "preview") return json({ ...preview, receipt: preview.issues.length ? null : receipt(secret, auth.actor, preview.digest, Date.now() + 15 * 60_000) });
      if (preview.issues.length || !verifyReceipt(data.receipt, secret, auth.actor, preview.digest)) throw new HttpError(409, "Review a valid dry run of this exact file and mapping before import.");
      const result = await rpc("hustle_phase2_import", { p_actor: auth.actor, p_digest: preview.digest, p_rows: preview.rows });
      return json(result, 201);
    }
    if (action === "activate") {
      exactKeys(data, ["batchId", "digest", "confirm"]);
      if (data.confirm !== "ACTIVATE" || !/^[a-f0-9]{64}$/.test(String(data.digest))) throw new HttpError(400, "Explicit activation confirmation and source digest required.");
      return json(await rpc("hustle_phase2_activate", { p_actor: auth.actor, p_batch: uuid(data.batchId), p_digest: data.digest }));
    }
    if (action === "invite") {
      exactKeys(data, ["teamId"]);
      const { token, hash } = newToken();
      await rpc("hustle_phase2_invite", { p_actor: auth.actor, p_team: uuid(data.teamId), p_hash: hash });
      // Fragments never travel in HTTP request URLs or normal access logs.
      return json({ url: `${req.nextUrl.origin}${BASE}/invite#${token}`, notice: "Shown once. No message has been sent." }, 201);
    }
    if (action === "revoke") {
      exactKeys(data, ["teamId"]);
      return json(await rpc("hustle_phase2_revoke", { p_actor: auth.actor, p_team: uuid(data.teamId) }));
    }
    throw new HttpError(404, "Unknown operation.");
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error("[hustle-phase2] Unexpected operation failure", { action, type: error instanceof Error ? error.name : "unknown" });
    return json({ error: "Round 2 is unavailable. Please try again later." }, 503);
  }
}
