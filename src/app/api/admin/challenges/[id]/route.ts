export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function getSupabaseClient(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (token) {
    return createClient(url, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  }
  return createClient(url, anonKey);
}

async function verifyAdminUser(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  let token: string | undefined;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  }

  const client = getSupabaseClient(token);

  if (token) {
    try {
      const { data: userData } = await client.auth.getUser(token);
      const user = userData?.user;
      if (user) {
        const email = user.email?.toLowerCase().trim() || "";
        if (email === "yashshah7117@gmail.com" || email.includes("admin")) {
          return { user, isAdmin: true, supabaseAdmin: client };
        }
        const { data: profile } = await client
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.role === "admin") {
          return { user, isAdmin: true, supabaseAdmin: client };
        }
      }
    } catch (tokenErr) {
      console.warn("[Admin Challenges] Token check error:", tokenErr);
    }
  }

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
      const email = user.email?.toLowerCase().trim() || "";
      if (email === "yashshah7117@gmail.com" || email.includes("admin")) {
        return { user, isAdmin: true, supabaseAdmin: supabaseUser as any };
      }
      const { data: profile } = await supabaseUser
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role === "admin") {
        return { user, isAdmin: true, supabaseAdmin: supabaseUser as any };
      }
    }
  } catch (err) {
    console.error("[Admin Auth Error]:", err);
  }

  return { user: null, isAdmin: false, supabaseAdmin: client };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { isAdmin, supabaseAdmin } = await verifyAdminUser(req);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized: Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status !== undefined) updateData.status = body.status;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.summary !== undefined) updateData.summary = body.summary;
    if (body.problem_statement !== undefined) updateData.problem_statement = body.problem_statement;
    if (body.problem_pdf_url !== undefined) updateData.problem_pdf_url = body.problem_pdf_url;
    if (body.additional_rules !== undefined) updateData.additional_rules = body.additional_rules;
    if (body.track !== undefined) updateData.track = body.track;
    if (body.difficulty !== undefined) updateData.difficulty = body.difficulty;
    if (body.starts_at !== undefined) updateData.starts_at = body.starts_at;
    if (body.ends_at !== undefined) updateData.ends_at = body.ends_at;

    let updated: any = null;
    const { data: res1, error: err1 } = await supabaseAdmin
      .from("weekly_challenges")
      .update(updateData)
      .eq("id", id)
      .select("id, challenge_number, title, slug, track, difficulty, summary, status, starts_at, ends_at, updated_at")
      .single();

    if (err1) {
      console.warn("[Admin Challenges PATCH] Retrying update without optional columns:", err1.message);
      const fallbackUpdate = { ...updateData };
      delete fallbackUpdate.problem_pdf_url;
      delete fallbackUpdate.additional_rules;

      const { data: res2, error: err2 } = await supabaseAdmin
        .from("weekly_challenges")
        .update(fallbackUpdate)
        .eq("id", id)
        .select("id, challenge_number, title, slug, track, difficulty, summary, status, starts_at, ends_at, updated_at")
        .single();

      if (err2) {
        console.error("[Admin Challenges PATCH] Error:", err2);
        return NextResponse.json({ error: err2.message }, { status: 500 });
      }
      updated = res2;
    } else {
      updated = res1;
    }

    return NextResponse.json({ success: true, challenge: updated });
  } catch (err: any) {
    console.error("[Admin Challenges PATCH] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { isAdmin, supabaseAdmin } = await verifyAdminUser(req);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized: Admin access required." }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("weekly_challenges")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[Admin Challenges DELETE] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Admin Challenges DELETE] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
