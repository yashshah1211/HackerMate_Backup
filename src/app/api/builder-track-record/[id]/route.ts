export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Generic failure body. Database error details stay in the server log only.
const TRACK_RECORD_UNAVAILABLE = { success: false, error: "track_record_unavailable" };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params;
    if (!targetId) {
      return NextResponse.json({ success: false, error: "missing_target" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      console.error("[Builder Track Record] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
      return NextResponse.json(TRACK_RECORD_UNAVAILABLE, { status: 500 });
    }

    // The RPC runs with the visitor's own identity (their session JWT, or anon),
    // never with the service role, so auth.uid() inside the function is meaningful.
    const cookieStore = await cookies();
    const sessionClient = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });

    let callerId: string | null = null;
    try {
      const { data: { user } } = await sessionClient.auth.getUser();
      callerId = user?.id ?? null;
    } catch {
      // No verifiable session: treat the request as an anonymous visitor.
      callerId = null;
    }

    // Signed-in callers use their session client. Visitors (and callers whose
    // session could not be verified) use a cookie-less anon client, so a stale
    // cookie can't turn a public read into an error.
    const rpcClient = callerId
      ? sessionClient
      : createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

    // p_caller_id is still passed for compatibility with the pre-1A function,
    // which reads it. After migration 1A the function ignores it and uses auth.uid().
    const { data: trackRecord, error } = await rpcClient.rpc("get_public_builder_profile", {
      p_target_id: targetId,
      p_caller_id: callerId,
    });

    if (error) {
      console.error("[Builder Track Record] get_public_builder_profile failed", {
        targetId,
        authenticated: Boolean(callerId),
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(TRACK_RECORD_UNAVAILABLE, { status: 500 });
    }

    // A successful RPC can legitimately return null (unknown target).
    return NextResponse.json({ success: true, data: trackRecord ?? null });
  } catch (err) {
    console.error("[Builder Track Record] Unexpected error", err);
    return NextResponse.json(TRACK_RECORD_UNAVAILABLE, { status: 500 });
  }
}
