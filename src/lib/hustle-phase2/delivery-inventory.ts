/** Pure metadata validator. No bodies, recipients, tokens or credentials are retained. */
export const INVENTORY_BUDGET_MS = 12_000;
const MAX_PAGES = 50; // Secondary resource bound; the elapsed deadline is authoritative.
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const TERMINAL = new Set(["delivered", "bounced", "canceled", "failed", "sent", "opened", "clicked", "complained", "suppressed"]);
type Metadata = { id: string; subject: string; created_at: string; scheduled_at: string | null; last_event: string | null };
export type Inventory = { records: number; pages: number; elapsedMs: number; earliestCreatedAt: string | null; latestCreatedAt: string | null; hasMore: boolean; pendingHustle: number; complete: boolean };
export class InventoryStop extends Error {
  constructor(message: string, public evidence: Inventory) { super(message); }
}
/**
 * Full traversal only: update/reschedule semantics do not prove a created_at cutoff.
 * Even an ancient email rescheduled into a future day must be inspected.
 * Callers must not concurrently create/reschedule campaign messages during this scan.
 */
export async function inspectScheduleInventory(
  page: (after: string | null, timeoutMs: number) => Promise<unknown>, now = () => Date.now(),
  budgetMs = INVENTORY_BUDGET_MS, requestMs = 2_000,
): Promise<Inventory> {
  if (!Number.isInteger(budgetMs) || budgetMs < 1 || budgetMs > 45_000 || !Number.isInteger(requestMs) || requestMs < 1 || requestMs > 3_000) throw Error("Invalid inventory resource budget.");
  const start = now(), deadline = start + budgetMs;
  const evidence: Inventory = { records: 0, pages: 0, elapsedMs: 0, earliestCreatedAt: null, latestCreatedAt: null, hasMore: true, pendingHustle: 0, complete: false };
  const stop = (message: string): never => { evidence.elapsedMs = now() - start; throw new InventoryStop(message, { ...evidence }); };
  const seen = new Set<string>(); let cursor: string | null = null, previous = Infinity;
  let head: string[] = [];
  const remaining = () => { const ms = deadline - now(); if (ms <= 125) stop("Inventory deadline exceeded."); return Math.min(requestMs, ms - 125); };
  const read = async (after: string | null) => {
    let raw: unknown;
    try { raw = await page(after, remaining()); } catch { return stop("Inventory transport unresolved."); }
    evidence.elapsedMs = now() - start;
    if (now() >= deadline) stop("Inventory deadline exceeded.");
    const result = raw as { data?: unknown; has_more?: unknown } | null;
    if (!result || !Array.isArray(result.data) || result.data.length > 100 || typeof result.has_more !== "boolean"
      || (!result.data.length && result.has_more)) stop("Inventory page malformed.");
    return { data: result!.data as Metadata[], has_more: result!.has_more as boolean };
  };
  const validate = (email: Metadata, order: number) => {
    if (!email || !UUID.test(email.id) || typeof email.subject !== "string" || typeof email.created_at !== "string"
      || !(email.last_event === null || typeof email.last_event === "string")
      || !Number.isFinite(Date.parse(email.created_at)) || Date.parse(email.created_at) > order
      || Date.parse(email.created_at) > start + 60_000
      || !(email.scheduled_at === null || (typeof email.scheduled_at === "string" && Number.isFinite(Date.parse(email.scheduled_at))))) stop("Inventory chronology or metadata malformed.");
    if (/hustle/i.test(email.subject)) {
      if (!TERMINAL.has(email.last_event || "") || (email.scheduled_at !== null && Date.parse(email.scheduled_at) > start)) {
        evidence.pendingHustle++; stop("Pending or unrecognized campaign schedule; STOP.");
      }
    }
    return Date.parse(email.created_at);
  };
  for (let n = 0; n < MAX_PAGES; n++) {
    const result = await read(cursor); evidence.pages++; evidence.hasMore = result.has_more;
    for (const email of result.data) {
      previous = validate(email, previous);
      if (seen.has(email.id)) stop("Inventory cursor loop or duplicate ID.");
      seen.add(email.id); evidence.records++;
      evidence.latestCreatedAt ??= new Date(previous).toISOString(); evidence.earliestCreatedAt = new Date(previous).toISOString();
    }
    if (!n) head = result.data.map(e => e.id);
    if (!result.has_more) {
      // Detect insertions that would otherwise have appeared before our initial cursor.
      const again = await read(null); let order = Infinity;
      for (const email of again.data) order = validate(email, order);
      if (JSON.stringify(head) !== JSON.stringify(again.data.map(e => e.id))) stop("Inventory head changed during traversal.");
      if (now() >= deadline) stop("Inventory deadline exceeded.");
      evidence.complete = true; evidence.elapsedMs = now() - start; return evidence;
    }
    cursor = result.data.at(-1)!.id;
  }
  return stop("Inventory page resource bound exceeded.");
}
