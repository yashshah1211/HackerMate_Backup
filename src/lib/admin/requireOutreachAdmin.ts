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

  const allowedEmailString =
    process.env.OUTREACH_ADMIN_EMAIL ||
    process.env.NEXT_PUBLIC_OUTREACH_ADMIN_EMAIL ||
    process.env.ADMIN_CONTACT_EMAIL ||
    process.env.RESEND_SANDBOX_RECIPIENT ||
    "yashshah7117@gmail.com";

  const allowedEmails = allowedEmailString
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (authError || !user || !user.email) {
    return NextResponse.json(
      { error: "Forbidden: Unauthorized administrator session." },
      { status: 403 }
    );
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const userEmailClean = user.email.toLowerCase().trim();

  if (userEmailClean !== "yashshah7117@gmail.com" && !allowedEmails.includes(userEmailClean)) {
    return NextResponse.json(
      { error: "Forbidden: Outreach and SPOC Allowlist operations are strictly restricted to Super Admin (yashshah7117@gmail.com)." },
      { status: 403 }
    );
  }

  return { user, supabaseAdmin };
}
