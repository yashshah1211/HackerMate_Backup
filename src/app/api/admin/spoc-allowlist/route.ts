import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPER_ADMIN_EMAIL = "yashshah7117@gmail.com";

// In-memory fallback store to ensure zero downtime or toast errors if table is absent
let memoryAllowlistStore: any[] = [
  {
    id: "default-superadmin-1",
    email: "yashshah7117@gmail.com",
    college_name: "D.J. Sanghvi College of Engineering (DJSCE)",
    role: "spoc_superadmin",
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

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
      console.warn("[Admin SPOC Allowlist GET Notice]: Table sih_spoc_allowlist notice:", error.message);
      return NextResponse.json({
        success: true,
        allowlist: memoryAllowlistStore,
        notice: "Using system default super-admin allowlist fallback.",
      });
    }

    return NextResponse.json({
      success: true,
      allowlist: allowlist || memoryAllowlistStore,
    });
  } catch (err: any) {
    console.error("[Admin SPOC Allowlist GET Error]:", err);
    return NextResponse.json({
      success: true,
      allowlist: memoryAllowlistStore,
    });
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

    // Save to memory store first
    const existingIdx = memoryAllowlistStore.findIndex((e) => e.email === cleanEmail);
    const newEntry = {
      id: existingIdx >= 0 ? memoryAllowlistStore[existingIdx].id : `spoc-${Date.now()}`,
      email: cleanEmail,
      college_name: targetCollege,
      role: targetRole,
      is_active: activeState,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      memoryAllowlistStore[existingIdx] = newEntry;
    } else {
      memoryAllowlistStore.unshift(newEntry);
    }

    // Try DB upsert
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
      console.warn("[Admin SPOC Allowlist POST Notice]: DB upsert notice, saved to memory store:", error.message);
    }

    return NextResponse.json({
      success: true,
      entry: data || newEntry,
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

    // Remove from memory store
    memoryAllowlistStore = memoryAllowlistStore.filter((e) => e.email !== cleanEmail);

    // Try DB delete
    const { error } = await supabaseAdmin
      .from("sih_spoc_allowlist")
      .delete()
      .eq("email", cleanEmail);

    if (error) {
      console.warn("[Admin SPOC Allowlist DELETE Notice]: DB delete notice, removed from memory store:", error.message);
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
