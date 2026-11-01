import { createClient } from "@supabase/supabase-js";
import { registerNativeEvent, RegistrationError } from "@/lib/hackathons/nativeRegistration";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = request.headers.get("authorization");
  if (!token || !/^Bearer [^\s]+$/.test(token)) return Response.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid registration request." }, { status: 400 }); }
  if (!uuid.test(id) || !body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).some(key => !["teamId", "reviewedUnknown"].includes(key))
    || (body.teamId != null && (typeof body.teamId !== "string" || !uuid.test(body.teamId)))
    || typeof body.reviewedUnknown !== "boolean") return Response.json({ error: "Invalid registration request." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ error: "Registration is unavailable." }, { status: 503 });
  try {
    const client = createClient(url, key, { global: { headers: { Authorization: token } }, auth: { persistSession: false, autoRefreshToken: false } });
    return Response.json(await registerNativeEvent(client, id, body.teamId ?? null, body.reviewedUnknown), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RegistrationError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Native registration request failed:", error);
    return Response.json({ error: "Registration is unavailable. Please retry." }, { status: 503 });
  }
}
