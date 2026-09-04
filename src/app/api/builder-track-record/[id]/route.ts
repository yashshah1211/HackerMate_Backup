import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, serviceKey);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params;
    if (!targetId) {
      return NextResponse.json({ error: "Target ID or username is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Try to get authenticated caller user ID if present
    let callerId: string | null = null;
    try {
      const cookieStore = await cookies();
      const supabaseUser = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: (cookiesToSet) => {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            },
          },
        }
      );

      const { data: { user } } = await supabaseUser.auth.getUser();
      if (user) {
        callerId = user.id;
      }
    } catch {
      // Anonymous caller
      callerId = null;
    }

    // Execute SECURITY DEFINER function to get sanitized track record
    const { data: trackRecord, error } = await supabaseAdmin.rpc("get_public_builder_profile", {
      p_target_id: targetId,
      p_caller_id: callerId,
    });

    if (error) {
      console.warn("[Builder Track Record RPC Warning]:", error.message);
      // If RPC is missing or fails, return empty gracefully instead of 500
      return NextResponse.json({ success: true, data: null });
    }

    if (!trackRecord) {
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({
      success: true,
      data: trackRecord,
    });
  } catch (err: any) {
    console.error("[Builder Track Record Catch Error]:", err);
    return NextResponse.json({ success: true, data: null });
  }
}
