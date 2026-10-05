import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

export interface AdminAuthResult {
  user: User;
  supabaseAdmin: SupabaseClient;
  // Authenticated-only RPCs must retain the verified caller's identity.
  supabaseUserClient: SupabaseClient;
}

export async function requireAdmin(
  req?: NextRequest
): Promise<AdminAuthResult | NextResponse> {
  const authHeader = req?.headers?.get("Authorization");
  let token: string | undefined;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  }

  let user: User | null = null;
  let supabaseUserClient: SupabaseClient | null = null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 1. Try Bearer token if provided
  if (token) {
    try {
      const tokenClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userData, error: authError } = await tokenClient.auth.getUser(token);
      if (authError) console.error("[requireAdmin] Token authentication failed:", authError);
      if (!authError && userData?.user) {
        user = userData.user;
        supabaseUserClient = tokenClient;
      }
    } catch (e) {
      console.error("[requireAdmin] Token auth error:", e);
    }
  }

  // 2. Fallback to cookies
  if (!user) {
    supabaseUserClient = createServerClient(
      url,
      anonKey,
      {
        cookies: {
          getAll: () => req?.cookies?.getAll() || [],
          setAll: () => {},
        },
      }
    );

    try {
      const { data: userData, error: authError } = await supabaseUserClient.auth.getUser();
      if (authError) console.error("[requireAdmin] Cookie authentication failed:", authError);
      if (!authError && userData?.user) {
        user = userData.user;
      }
    } catch (e) {
      console.error("[requireAdmin] Cookie auth error:", e);
    }
  }

  if (!user || !user.email || !supabaseUserClient) {
    return NextResponse.json(
      { error: "Forbidden: Access restricted to logged-in administrators." },
      { status: 403 }
    );
  }

  // Read the authenticated caller's protected role and ban state before
  // creating a service-role client. Lookup failures never grant access.
  try {
    const { data: profile, error: profileError } = await supabaseUserClient
      .from("profiles")
      .select("role, is_banned")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[requireAdmin] Admin profile lookup failed:", profileError);
      return NextResponse.json({ error: "Forbidden: Unable to verify administrator access." }, { status: 403 });
    }

    // Preserve the intentional exact founder exception already used by the
    // admin middleware. It requires authenticated identity and a non-banned
    // profile; email fragments, aliases and client metadata confer no privilege.
    const isFounder = user.email.toLowerCase().trim() === "yashshah7117@gmail.com";
    if (!profile || profile.is_banned || (profile.role !== "admin" && !isFounder)) {
      return NextResponse.json(
        { error: "Forbidden: Access restricted to authorized administrators." },
        { status: 403 }
      );
    }
  } catch (e) {
    console.error("[requireAdmin] Admin profile lookup error:", e);
    return NextResponse.json({ error: "Forbidden: Unable to verify administrator access." }, { status: 403 });
  }

  const supabaseAdmin = serviceKey
    ? createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : supabaseUserClient;

  return { user, supabaseAdmin, supabaseUserClient };
}
