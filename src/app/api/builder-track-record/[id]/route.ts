import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params;
    if (!targetId) {
      return NextResponse.json({ error: "Target ID or username is required" }, { status: 400 });
    }

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
      console.error("[Builder Track Record API Error]:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!trackRecord) {
      return NextResponse.json({ error: "Builder profile not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: trackRecord,
    });
  } catch (err: any) {
    console.error("[Builder Track Record Catch Error]:", err);
    return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
  }
}
