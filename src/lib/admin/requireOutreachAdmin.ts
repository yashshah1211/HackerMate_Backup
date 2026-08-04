import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

export interface OutreachAdminAuthResult {
  user: User;
  supabaseAdmin: SupabaseClient;
}

export async function requireOutreachAdmin(
  req: NextRequest
): Promise<OutreachAdminAuthResult | NextResponse> {
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

  const allowedEmail = process.env.OUTREACH_ADMIN_EMAIL;

  if (!allowedEmail) {
    console.error("[Auth] OUTREACH_ADMIN_EMAIL environment variable is not configured.");
    return NextResponse.json(
      { error: "Forbidden: Outreach administrator email is not configured." },
      { status: 403 }
    );
  }

  if (
    authError ||
    !user ||
    !user.email ||
    user.email.toLowerCase() !== allowedEmail.toLowerCase()
  ) {
    return NextResponse.json(
      { error: "Forbidden: Access restricted to authorized administrator." },
      { status: 403 }
    );
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  return { user, supabaseAdmin };
}
