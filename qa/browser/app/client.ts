import type { SupabaseClient } from "@supabase/supabase-js";
type Result = { data: unknown; error: { message: string; code?: string } | null };
type Query = { table?: string; select?: string; filters?: Record<string, unknown>; order?: string; limit?: number; rpc?: string; args?: unknown; single?: boolean };
async function request(query: Query): Promise<Result> {
  const response = await fetch("/__qa/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) });
  if (!response.ok) throw new Error("Local fixture request failed");
  return response.json();
}
class Builder implements PromiseLike<Result> {
  constructor(private query: Query) {}
  select(select: string) { this.query.select = select; return this; }
  eq(key: string, value: unknown) { (this.query.filters ||= {})[key] = value; return this; }
  or() { return this; }
  order(order: string) { this.query.order = order; return this; }
  limit(limit: number) { this.query.limit = limit; return this; }
  single() { this.query.single = true; return this; }
  maybeSingle() { return this.single(); }
  then<TResult1 = Result, TResult2 = never>(onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
    return request(this.query).then(onfulfilled, onrejected);
  }
}
// This adapter exists only in the loopback harness; it never creates an app session,
// JWT or auth cookie and is never bundled into the real Next.js application.
export const supabase = {
  auth: { async getUser() { const { viewerId } = await (await fetch("/__qa/info")).json(); return { data: { user: { id: viewerId } } }; } },
  from(table: string) { return new Builder({ table }); },
  rpc(rpc: string, args: unknown) { return request({ rpc, args }); },
} as unknown as SupabaseClient;
