import type { SupabaseClient } from "@supabase/supabase-js";

export type AttentionCategory = "onboarding" | "join-requests" | "invitations";
export type AttentionFilter = "all" | "recent" | "over7d";
export type Measurement =
  | { status: "verified"; value: number }
  | { status: "unavailable"; value: null; reason: string };
export type AttentionOptions = {
  category: AttentionCategory;
  filter: AttentionFilter;
  limit: number;
  cursor: { at: string | null; id: string } | null;
};
export type AttentionItem = {
  id: string;
  name: string;
  team: string | null;
  responsible: string;
  suspended: boolean | null;
  createdAt: string | null;
  age: { status: "known"; days: number } | { status: "unknown"; reason: string };
  links: { label: string; href: string }[];
};
export type AttentionResponse = {
  generatedAt: string;
  category: AttentionCategory;
  filter: AttentionFilter;
  coverage: "complete" | "partial" | "unavailable";
  totals: Record<AttentionCategory, Measurement>;
  recentIncompleteRegistrations: Measurement;
  unknownOnboardingState: Measurement;
  joinRequestAges: { under1d: Measurement; oneTo7d: Measurement; over7d: Measurement; unknown: Measurement };
  oldInvitations: Measurement;
  page: {
    status: "available" | "unavailable";
    items: AttentionItem[] | null;
    nextCursor: string | null;
    hasMore: boolean | null;
    error: string | null;
  };
  warnings: string[];
};

const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const categories = ["onboarding", "join-requests", "invitations"] as const;
const tableFor = { onboarding: "profiles", "join-requests": "team_join_requests", invitations: "team_invites" };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const name = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;

// Keep the original precision for keyset comparisons (Postgres may return
// microseconds). Date.toISOString() would truncate the cursor to milliseconds.
function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day &&
    Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60 && Number.isFinite(Date.parse(value));
}

export function ageAt(value: unknown, now: number): AttentionItem["age"] {
  if (value === null || value === undefined) return { status: "unknown", reason: "Creation timestamp missing" };
  if (!timestamp(value)) return { status: "unknown", reason: "Creation timestamp invalid" };
  const fraction = value.match(/\.(\d+)(?:Z|[+-])/);
  const subMillisecond = fraction ? Number(fraction[1].padEnd(6, "0").slice(3)) / 1000 : 0;
  const elapsed = (now - Date.parse(value)) - subMillisecond;
  if (elapsed < 0) return { status: "unknown", reason: "Creation timestamp is in the future" };
  return { status: "known", days: Math.floor(elapsed / DAY) };
}

export function parseAttentionOptions(params: URLSearchParams): AttentionOptions {
  if ([...params.keys()].some(key => !["category", "filter", "limit", "cursor"].includes(key)) ||
    [...new Set(params.keys())].some(key => params.getAll(key).length !== 1)) throw new Error("Invalid queue parameters.");
  const category = params.get("category") ?? "onboarding";
  if (!categories.includes(category as AttentionCategory)) throw new Error("Invalid queue category.");
  const filter = params.get("filter") ?? "all";
  if (filter !== "all" && filter !== (category === "onboarding" ? "recent" : "over7d")) throw new Error("Invalid queue filter.");
  const rawLimit = params.get("limit") ?? "25";
  if (!/^\d{1,2}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 50) throw new Error("Page size must be between 1 and 50.");
  let cursor: AttentionOptions["cursor"] = null;
  const encoded = params.get("cursor");
  if (encoded !== null) {
    try {
      if (!encoded || encoded.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error();
      const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      if (!record(parsed) || parsed.v !== 1 || parsed.category !== category || parsed.filter !== filter ||
        !id(parsed.id) || (parsed.at !== null && !timestamp(parsed.at))) throw new Error();
      cursor = { at: parsed.at, id: parsed.id };
    } catch { throw new Error("Invalid queue cursor."); }
  }
  return { category: category as AttentionCategory, filter: filter as AttentionFilter, limit: Number(rawLimit), cursor };
}

function base(client: SupabaseClient, category: AttentionCategory, columns: string, head = false) {
  const query = client.from(tableFor[category]).select(columns, head ? { count: "exact", head: true } : undefined);
  return category === "onboarding" ? query.eq("onboarding_completed", false) : query.eq("status", "pending");
}
const unavailable = (reason: string): Measurement => ({ status: "unavailable", value: null, reason });

// A shared deadline and at most four concurrent queries bound this one refresh.
// No automatic retries, polling, RPCs or writes are performed.
export async function getAttentionQueue(client: SupabaseClient, viewerId: string, options: AttentionOptions): Promise<AttentionResponse> {
  const now = Date.now();
  const generatedAt = new Date(now).toISOString();
  const dayAgo = new Date(now - DAY).toISOString();
  const weekAgo = new Date(now - 7 * DAY).toISOString();
  const signal = AbortSignal.timeout(8_000);
  async function count(query: { abortSignal(signal: AbortSignal): PromiseLike<unknown> }): Promise<Measurement> {
    try {
      const result = await query.abortSignal(signal);
      if (!record(result) || result.error !== null) return unavailable("Database count query failed or timed out.");
      if (typeof result.count !== "number" || !Number.isSafeInteger(result.count) || result.count < 0) return unavailable("Database returned no valid exact count.");
      return { status: "verified", value: result.count };
    } catch { return unavailable("Database count query failed or timed out."); }
  }
  const tasks = [
    () => count(base(client, "onboarding", "id", true)),
    () => count(base(client, "join-requests", "id", true)),
    () => count(base(client, "invitations", "id", true)),
    () => count(base(client, "onboarding", "id", true).gte("created_at", dayAgo).lte("created_at", generatedAt)),
    () => count(client.from("profiles").select("id", { count: "exact", head: true }).is("onboarding_completed", null)),
    () => count(base(client, "join-requests", "id", true).gt("created_at", dayAgo).lte("created_at", generatedAt)),
    () => count(base(client, "join-requests", "id", true).gte("created_at", weekAgo).lte("created_at", dayAgo)),
    () => count(base(client, "join-requests", "id", true).lt("created_at", weekAgo)),
    () => count(base(client, "join-requests", "id", true).or(`created_at.is.null,created_at.gt.${generatedAt}`)),
    () => count(base(client, "invitations", "id", true).lt("created_at", weekAgo)),
  ];
  const measured: Measurement[] = [];
  let taskIndex = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (taskIndex < tasks.length) {
      const index = taskIndex++;
      try { measured[index] = await tasks[index](); }
      catch { measured[index] = unavailable("Database count query could not be started."); }
    }
  }));

  const warnings: string[] = [];
  const { category, filter, cursor, limit } = options;
  let page: AttentionResponse["page"] = { status: "unavailable", items: null, hasMore: null, nextCursor: null, error: "Queue rows could not be loaded." };
  try {
    const columns = category === "onboarding" ? "id, full_name, onboarding_completed, is_banned, created_at" :
      category === "join-requests" ? "id, team_id, user_id, status, created_at" : "id, team_id, invited_user_id, status, created_at";
    let query = base(client, category, columns).order("created_at", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
    if (filter === "recent") query = query.gte("created_at", dayAgo).lte("created_at", generatedAt);
    if (filter === "over7d") query = query.lt("created_at", weekAgo);
    if (cursor?.at === null) query = query.is("created_at", null).gt("id", cursor.id);
    else if (cursor) query = query.or(`created_at.gt.${cursor.at},and(created_at.eq.${cursor.at},id.gt.${cursor.id}),created_at.is.null`);
    const result = await query.limit(limit + 1).abortSignal(signal);
    const rawRows: unknown = result.data;
    if (result.error || !Array.isArray(rawRows)) throw new Error();
    const rows = rawRows.map(row => { if (!record(row)) throw new Error(); return row; });
    if (rows.length > limit + 1 || rows.some(row => !id(row.id) ||
      (category === "onboarding" ? row.onboarding_completed !== false :
        row.status !== "pending" || !id(row.team_id) || !id(row[category === "join-requests" ? "user_id" : "invited_user_id"])))) throw new Error();
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const teams = new Map<string, { name: string; ownerId: string | null }>();
    const profiles = new Map<string, { name: string; suspended: boolean | null }>();
    const teamIds = [...new Set(visible.map(row => row.team_id).filter(id))];
    if (teamIds.length) {
      try {
        const teamResult = await client.from("teams").select("id, name, owner_id").in("id", teamIds).limit(teamIds.length).abortSignal(signal);
        if (teamResult.error || !Array.isArray(teamResult.data) || teamResult.data.some(row => !record(row) || !id(row.id) || !teamIds.includes(row.id))) throw new Error();
        for (const team of teamResult.data) teams.set(team.id, { name: name(team.name, "Unnamed team"), ownerId: id(team.owner_id) ? team.owner_id : null });
      } catch { warnings.push("Team details and ownership could not be verified."); }
    }
    const profileIds = [...new Set([
      ...visible.map(row => row[category === "join-requests" ? "user_id" : "invited_user_id"]).filter(id),
      ...[...teams.values()].map(team => team.ownerId).filter(id),
    ])];
    if (profileIds.length) {
      try {
        const profileResult = await client.from("profiles").select("id, full_name, is_banned").in("id", profileIds).limit(profileIds.length).abortSignal(signal);
        if (profileResult.error || !Array.isArray(profileResult.data) || profileResult.data.some(row => !record(row) || !id(row.id) || !profileIds.includes(row.id))) throw new Error();
        for (const profile of profileResult.data) profiles.set(profile.id, { name: name(profile.full_name, "Unnamed user"), suspended: typeof profile.is_banned === "boolean" ? profile.is_banned : null });
      } catch { warnings.push("User and responsible-owner names could not be loaded."); }
    }
    const items = visible.map((row): AttentionItem => {
      const personId = category === "onboarding" ? row.id as string : row[category === "join-requests" ? "user_id" : "invited_user_id"] as string;
      const person = category === "onboarding" ? { name: name(row.full_name, "Unnamed profile"), suspended: typeof row.is_banned === "boolean" ? row.is_banned : null } : profiles.get(personId);
      const team = id(row.team_id) ? teams.get(row.team_id) : undefined;
      const owner = team?.ownerId ? profiles.get(team.ownerId) : undefined;
      const links: AttentionItem["links"] = [];
      if (person && person.suspended === false) links.push({ label: "View profile", href: `/profile/${personId}` });
      if (team) links.push({ label: "View team", href: `/teams/${row.team_id}` });
      if (category === "join-requests" && team?.ownerId === viewerId) links.push({ label: "Review your team's requests", href: `/teams/${row.team_id}/requests` });
      if (category === "invitations" && personId === viewerId) links.push({ label: "View your invitations", href: "/invites" });
      return {
        id: row.id as string, name: person?.name ?? "User details unavailable", team: team?.name ?? null,
        responsible: category === "onboarding" ? "This user completes onboarding in their own account." : category === "invitations" ?
          "The intended recipient responds through their own Invites page." : `Team owner: ${owner?.name ?? "details unavailable"}. Only the owner can review this request.`,
        suspended: person?.suspended ?? null,
        createdAt: timestamp(row.created_at) ? row.created_at : null,
        age: ageAt(row.created_at, now), links,
      };
    });
    let nextCursor: string | null = null;
    const last = visible[visible.length - 1];
    if (hasMore && last) {
      if (last.created_at !== null && !timestamp(last.created_at)) warnings.push("Pagination is unavailable because the last row has a malformed creation timestamp.");
      else nextCursor = Buffer.from(JSON.stringify({ v: 1, category, filter, at: last.created_at, id: last.id })).toString("base64url");
    }
    page = { status: "available", items, hasMore, nextCursor, error: null };
  } catch { /* Retain the unavailable list state; successful aggregate counts survive. */ }

  const successes = measured.filter(metric => metric.status === "verified").length;
  const coverage = successes === 0 && page.status === "unavailable" ? "unavailable" :
    successes === measured.length && page.status === "available" && warnings.length === 0 ? "complete" : "partial";
  return {
    generatedAt, category, filter, coverage,
    totals: { onboarding: measured[0], "join-requests": measured[1], invitations: measured[2] },
    recentIncompleteRegistrations: measured[3], unknownOnboardingState: measured[4],
    joinRequestAges: { under1d: measured[5], oneTo7d: measured[6], over7d: measured[7], unknown: measured[8] },
    oldInvitations: measured[9], page, warnings,
  };
}
