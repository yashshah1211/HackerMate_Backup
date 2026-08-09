import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPER_ADMIN_EMAIL = "yashshah7117@gmail.com";

// NOTE: No in-memory fallback. On Vercel serverless, module-level state is NOT shared
// across instances or cold starts — storing access grants in memory produces inconsistent
// behavior (grant visible in one Lambda, invisible in another). The DB is the only source of
// truth. If the table is missing, we surface a clear setup error to the admin UI.

const TABLE_MISSING_MSG =
  "The sih_spoc_allowlist table does not exist in the database. " +
  "Apply the migration at supabase/migrations/20260809230000_create_sih_spoc_allowlist.sql " +
  "via the Supabase Dashboard > SQL Editor.";

async function verifySuperAdmin(req: NextRequest) {
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabaseUser.auth.getUser();

  if (!user || !user.email) {
    return { isSuperAdmin: false, user: null, error: "Unauthorized. Please sign in." };
  }

  const userEmailClean = user.email.toLowerCase().trim();
  if (userEmailClean !== SUPER_ADMIN_EMAIL) {
    return {
      isSuperAdmin: false,
      user,
      error: `Access Denied (${user.email}). Only Super Admin (${SUPER_ADMIN_EMAIL}) can manage SPOC dashboard access allowlists.`,
    };
  }

  return { isSuperAdmin: true, user, error: null };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifySuperAdmin(req);
    if (!auth.isSuperAdmin) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: allowlist, error } = await supabaseAdmin
      .from("sih_spoc_allowlist")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Admin SPOC Allowlist GET Error]: DB query failed:", error.message);
      return NextResponse.json(
        { success: false, tableNotReady: true, error: TABLE_MISSING_MSG },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true, allowlist: allowlist || [] });
  } catch (err: any) {
    console.error("[Admin SPOC Allowlist GET Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifySuperAdmin(req);
    if (!auth.isSuperAdmin) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json();
    const { email, collegeName, role, isActive } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Valid user email is required." }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const targetCollege = collegeName?.trim() || "D.J. Sanghvi College of Engineering (DJSCE)";
    const targetRole = role || "spoc";
    const activeState = isActive !== undefined ? Boolean(isActive) : true;

    // DB upsert — the only source of truth
    const { data, error } = await supabaseAdmin
      .from("sih_spoc_allowlist")
      .upsert(
        {
          email: cleanEmail,
          college_name: targetCollege,
          role: targetRole,
          is_active: activeState,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      )
      .select()
      .maybeSingle();

    if (error) {
      console.error("[Admin SPOC Allowlist POST Error]: DB upsert failed:", error.message);
      return NextResponse.json(
        { success: false, tableNotReady: true, error: TABLE_MISSING_MSG },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      entry: data,
      message: `Granted SPOC access for ${cleanEmail} (${targetCollege}).`,
    });
  } catch (err: any) {
    console.error("[Admin SPOC Allowlist POST Error]:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifySuperAdmin(req);
    if (!auth.isSuperAdmin) {
      return NextResponse.json({ error: auth.error }, { status: 403 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Email query param is required." }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Protect super admin email from accidental deletion
    if (cleanEmail === SUPER_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "Cannot revoke primary Super Admin account access." },
        { status: 400 }
      );
    }

    // DB delete — the only source of truth
    const { error } = await supabaseAdmin
      .from("sih_spoc_allowlist")
      .delete()
      .eq("email", cleanEmail);

    if (error) {
      console.error("[Admin SPOC Allowlist DELETE Error]: DB delete failed:", error.message);
      return NextResponse.json(
        { success: false, tableNotReady: true, error: TABLE_MISSING_MSG },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Revoked SPOC access for ${cleanEmail}.`,
    });
  } catch (err: any) {
    console.error("[Admin SPOC Allowlist DELETE Error]:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
