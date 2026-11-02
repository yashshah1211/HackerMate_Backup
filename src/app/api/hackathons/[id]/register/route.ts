import { createClient } from "@supabase/supabase-js";
import { registerNativeEvent, RegistrationError } from "@/lib/hackathons/nativeRegistration";

import { WriterBudget, WriterError, writerFailure } from "@/lib/writers";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const budget = new WriterBudget(undefined, request.signal);
  try {
  const token = request.headers.get("authorization");
  if (!token || !/^Bearer [^\s]+$/.test(token)) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await budget.run(() => params);
  let body;
  try { body = await budget.run(() => request.json()); } catch (error) { if (error instanceof WriterError) throw error; return Response.json({ error: "Invalid registration request." }, { status: 400 }); }
  if (!uuid.test(id) || !body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some(key => !["teamId", "reviewedUnknown"].includes(key))
    || (body.teamId != null && (typeof body.teamId !== "string" || !uuid.test(body.teamId)))
    || typeof body.reviewedUnknown !== "boolean") return Response.json({ error: "Invalid registration request." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ error: "Registration is unavailable." }, { status: 503 });
    const client = createClient(url, key, { global: { headers: { Authorization: token }, fetch: (input, init) => fetch(input, { ...init, signal: budget.signal }) }, auth: { persistSession: false, autoRefreshToken: false } });
    return Response.json(await registerNativeEvent(client, id, body.teamId ?? null, body.reviewedUnknown, Date.now, budget, token.slice(7)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RegistrationError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Native registration request failed:", error);
    const failure = writerFailure(error);
    return Response.json({ error: failure.message, retryable: failure.retryable, outcomeUnknown: failure.outcomeUnknown }, { status: failure.status, headers: { "Cache-Control": "no-store" } });
  }
}
