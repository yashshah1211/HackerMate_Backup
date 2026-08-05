import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

async function checkIsUserAdmin(user: any, supabaseAdmin: any): Promise<boolean> {
  if (!user) return false;
  const email = user.email?.toLowerCase() || "";
  if (
    email === "yashshah7117@gmail.com" ||
    email === "yashshah111@gmail.com" ||
    email.includes("admin")
  ) {
    return true;
  }
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile && (profile.is_admin || profile.role === "admin")) {
      return true;
    }
  } catch (err) {
    console.error("[Admin Check Error]:", err);
  }
  return false;
}

export async function GET(req: NextRequest) {
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

    const {
      data: { user },
    } = await supabaseUser.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const isAdmin = await checkIsUserAdmin(user, supabaseAdmin);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
    }

    // Fetch all hackathons with organizer profile info
    const { data: hackathons, error } = await supabaseAdmin
      .from("hackathons")
      .select("*, profiles:organizer_id(id, full_name, email)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Admin Hackathons GET Error]:", error);
      return NextResponse.json({ error: "Failed to fetch hackathons." }, { status: 500 });
    }

    // Map status fallback to ai_feedback or status column
    const normalized = (hackathons || []).map((h: any) => {
      const fb = h.ai_feedback || {};
      const status = h.status || fb.status || (h.type === "native" ? "pending" : "approved");
      return {
        ...h,
        status,
        organizerName: h.profiles?.full_name || "Unknown Host",
        organizerEmail: h.profiles?.email || "N/A",
      };
    });

    return NextResponse.json({
      success: true,
      hackathons: normalized,
    });
  } catch (err: any) {
    console.error("[Admin Hackathons GET Exception]:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

    const {
      data: { user },
    } = await supabaseUser.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const isAdmin = await checkIsUserAdmin(user, supabaseAdmin);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { hackathonId, action } = body; // action: 'approve' | 'reject' | 'delete'

    if (!hackathonId || !action) {
      return NextResponse.json({ error: "Missing hackathonId or action" }, { status: 400 });
    }

    // 1. DELETE ACTION
    if (action === "delete") {
      // First delete any team_hackathons references
      await supabaseAdmin.from("team_hackathons").delete().eq("hackathon_id", hackathonId);
      // Delete hackathon_registrations references
      await supabaseAdmin.from("hackathon_registrations").delete().eq("hackathon_id", hackathonId);

      const { error: delErr } = await supabaseAdmin.from("hackathons").delete().eq("id", hackathonId);

      if (delErr) {
        console.error("[Admin Delete Hackathon Error]:", delErr);
        return NextResponse.json({ error: "Failed to delete hackathon from database." }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Hackathon permanently deleted from database.",
      });
    }

    // 2. APPROVE OR REJECT ACTION
    const newStatus = action === "approve" ? "approved" : "rejected";

    // Fetch existing hackathon
    const { data: hData, error: hErr } = await supabaseAdmin
      .from("hackathons")
      .select("id, ai_feedback")
      .eq("id", hackathonId)
      .single();

    if (hErr || !hData) {
      return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
    }

    const existingFeedback = hData.ai_feedback || {};
    const updatedFeedback = {
      ...existingFeedback,
      status: newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    };

    // Update both ai_feedback JSONB and status column if available
    let updatedHackathon: any = null;
    const { data: fbResult, error: fbErr } = await supabaseAdmin
      .from("hackathons")
      .update({
        ai_feedback: updatedFeedback,
        updated_at: new Date().toISOString(),
      })
      .eq("id", hackathonId)
      .select()
      .single();

    if (fbErr) {
      console.error("[Admin Update Hackathon Status Error]:", fbErr);
      return NextResponse.json({ error: "Failed to update hackathon status." }, { status: 500 });
    }

    updatedHackathon = fbResult;

    // Try updating status column directly if present
    try {
      const { data: colResult } = await supabaseAdmin
        .from("hackathons")
        .update({ status: newStatus })
        .eq("id", hackathonId)
        .select()
        .single();

      if (colResult) updatedHackathon = colResult;
    } catch {
      // Ignore if status column is absent
    }

    return NextResponse.json({
      success: true,
      hackathon: updatedHackathon,
      message: `Hackathon successfully ${newStatus}!`,
    });
  } catch (err: any) {
    console.error("[Admin Hackathons POST Exception]:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
