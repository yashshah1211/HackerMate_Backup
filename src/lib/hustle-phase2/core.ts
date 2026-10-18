import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const EVENT_ID = "0da43cba-90dc-449c-a126-a2fc8be8a379";
export const BASE = "/partners/hustle-carnival/phase-2";
export const API = "/api/partners/hustle-carnival/phase-2";
export const OPENS = "2026-10-23T04:30:00.000Z";
export const CLOSES = "2026-10-23T17:30:00.000Z";
export const MAX_CSV_BYTES = 512 * 1024;
export const MAX_TEAMS = 500;
export const FIELDS = ["team_id", "team_name", "leader_name", "leader_email", "leader_whatsapp", "optional_second_member_name"] as const;
export type Field = typeof FIELDS[number];
export type Mapping = Record<string, Field>;
export type TeamInput = { external_team_id: string; team_name: string; leader_name: string; leader_email: string; leader_whatsapp: string | null; second_member_name: string | null };
export type Issue = { row: number; field: string; message: string };
export type Preview = { digest: string; rows: TeamInput[]; issues: Issue[]; total: number };

export function windowState(now: number): "before" | "open" | "closed" {
  return now < Date.parse(OPENS) ? "before" : now < Date.parse(CLOSES) ? "open" : "closed";
}
export function tokenHash(token: string): string | null {
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}
export function newToken() { const token = randomBytes(32).toString("base64url"); return { token, hash: tokenHash(token)! }; }

/** Strict RFC4180-style parser: quotes/CRLF supported, malformed quotes rejected. */
export function parseCsv(source: string): string[][] {
  if (Buffer.byteLength(source, "utf8") > MAX_CSV_BYTES) throw new Error("CSV exceeds 512 KiB.");
  const input = source.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false; let closed = false;
  const cell = () => { row.push(value); value = ""; closed = false; if (row.length > 6) throw new Error("At most six columns are supported; resolve extra roster columns explicitly."); };
  const line = () => { cell(); if (row.some(v => v !== "")) rows.push(row); row = []; if (rows.length > MAX_TEAMS + 1) throw new Error("At most 500 teams per file."); };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) { if (c === '"') { if (input[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } } else value += c; }
    else if (c === ",") cell();
    else if (c === "\r" || c === "\n") { if (c === "\r" && input[i + 1] === "\n") i++; line(); }
    else if (c === '"' && value === "" && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error("Malformed CSV quoting."); value += c; }
    if (value.length > 400) throw new Error("A CSV value is too long.");
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  if (row.length || value || closed) line();
  if (rows.length < 2) throw new Error("Include a header and at least one team.");
  return rows;
}

export function previewCsv(source: string, mapping: Mapping): Preview {
  const [rawHeaders, ...records] = parseCsv(source);
  const headers = rawHeaders.map(h => h.trim());
  if (headers.some(h => !h || h.length > 80) || new Set(headers).size !== headers.length) throw new Error("Headers must be unique and nonempty.");
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) throw new Error("Explicit header mapping is required.");
  if (Object.keys(mapping).length !== headers.length || headers.some(h => !Object.hasOwn(mapping, h) || !FIELDS.includes(mapping[h]))) throw new Error("Map every header to a supported field. Unknown columns cannot be ignored.");
  const mapped = headers.map(h => mapping[h]);
  if (new Set(mapped).size !== mapped.length || FIELDS.slice(0, 4).some(f => !mapped.includes(f))) throw new Error("Map team ID, team name, leader name and leader email exactly once.");
  const issues: Issue[] = []; const rows: TeamInput[] = []; const ids = new Set<string>(); const emails = new Set<string>(); const phones = new Set<string>();
  records.forEach((record, index) => {
    const row = index + 2; const start = issues.length;
    const issue = (field: string, message: string) => issues.push({ row, field, message });
    if (record.length !== headers.length) { issue("row", "Column count differs from the header."); return; }
    const data = Object.fromEntries(mapped.map((field, i) => [field, record[i].trim().normalize("NFC")])) as Record<Field, string>;
    for (const field of mapped) {
      if (/[\x00-\x1f\x7f]/.test(data[field]) || (field !== "leader_whatsapp" && /^[=+@-]/.test(data[field]))) issue(field, "Unsafe control character or spreadsheet formula prefix.");
    }
    const id = data.team_id.toUpperCase(); const email = data.leader_email.toLowerCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(id)) issue("team_id", "Use 1–64 letters, digits, hyphens or underscores.");
    for (const field of ["team_name", "leader_name"] as const) if (!data[field] || data[field].length > 120) issue(field, "Required; maximum 120 characters.");
    if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email) || email.startsWith(".") || email.includes("..")) issue("leader_email", "A valid leader email is required.");
    const phone = data.leader_whatsapp?.replace(/[ ()-]/g, "") || null;
    if (phone && !/^\+[1-9][0-9]{7,14}$/.test(phone)) issue("leader_whatsapp", "Use international format, e.g. +countrycode followed by digits.");
    const second = data.optional_second_member_name || null;
    if (second && (second.length > 120 || second.toLowerCase() === data.leader_name.toLowerCase())) issue("optional_second_member_name", "Use a distinct second member, maximum 120 characters, or leave empty.");
    if (ids.has(id)) issue("team_id", "Duplicate team identifier in this file.");
    if (emails.has(email)) issue("leader_email", "Leader email belongs to multiple teams.");
    if (phone && phones.has(phone)) issue("leader_whatsapp", "Leader phone belongs to multiple teams.");
    ids.add(id); emails.add(email); if (phone) phones.add(phone);
    if (issues.length === start) rows.push({ external_team_id: id, team_name: data.team_name, leader_name: data.leader_name, leader_email: email, leader_whatsapp: phone, second_member_name: second });
  });
  const digest = createHash("sha256").update(JSON.stringify({ source, mapping: headers.map(h => [h, mapping[h]]) })).digest("hex");
  return { digest, rows, issues, total: records.length };
}
export function receipt(secret: string, actor: string, digest: string, expires: number): string {
  return `${expires}.${createHmac("sha256", secret).update(`hustle-p2-preview:${actor}:${digest}:${expires}`).digest("hex")}`;
}
export function verifyReceipt(value: unknown, secret: string, actor: string, digest: string, now = Date.now()): boolean {
  if (typeof value !== "string" || !/^\d{13}\.[a-f0-9]{64}$/.test(value)) return false;
  const expires = Number(value.split(".")[0]);
  return expires > now && expires <= now + 15 * 60_000 && timingSafeEqual(Buffer.from(value), Buffer.from(receipt(secret, actor, digest, expires)));
}
export function escapeHtml(value: unknown): string { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
