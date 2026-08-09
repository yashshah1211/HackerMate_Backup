import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

export interface AdminAuthResult {
  user: User;
  supabaseAdmin: SupabaseClient;
}

export async function requireAdmin(
  req: NextRequest
): Promise<AdminAuthResult | NextResponse> {
  const supabaseUserClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: () => {},
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabaseUserClient.auth.getUser();

  if (authError || !user || !user.email) {
    return NextResponse.json(
      { error: "Forbidden: Access restricted to logged-in administrators." },
      { status: 403 }
    );
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const emailClean = user.email.toLowerCase().trim();
  const isSuperAdmin = emailClean === "yashshah7117@gmail.com";

  if (!isSuperAdmin) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Access restricted to authorized administrators." },
        { status: 403 }
      );
    }
  }

  return { user, supabaseAdmin };
}
