import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

export interface AdminAuthResult {
  user: User;
  supabaseAdmin: SupabaseClient;
  // Authenticated-only RPCs must retain the verified caller's identity.
  supabaseUserClient: SupabaseClient;
}

export interface VerifiedProfileAuthResult {
  user: User;
  supabaseUserClient: SupabaseClient;
  isAdmin: boolean;
}

// Shared identity/profile boundary. This never creates a service-role client.
export async function requireVerifiedProfile(
  req?: NextRequest,
  options: { unauthenticatedStatus?: 401; lookupFailureStatus?: 500 } = {}
): Promise<VerifiedProfileAuthResult | NextResponse> {
  const authHeader = req?.headers?.get("Authorization");
  let token: string | undefined;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  }

  let user: User | null = null;
  let supabaseUserClient: SupabaseClient | null = null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // 1. Try Bearer token if provided
  if (token) {
    try {
      const tokenClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userData, error: authError } = await tokenClient.auth.getUser(token);
      if (authError) console.error("[requireAdmin] Token authentication failed:", options.unauthenticatedStatus ? { code: authError.code, status: authError.status } : authError);
      if (!authError && userData?.user) {
        user = userData.user;
        supabaseUserClient = tokenClient;
      }
    } catch (e) {
      console.error("[requireAdmin] Token auth error:", options.unauthenticatedStatus ? "Authentication exception" : e);
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
      if (authError) console.error("[requireAdmin] Cookie authentication failed:", options.unauthenticatedStatus ? { code: authError.code, status: authError.status } : authError);
      if (!authError && userData?.user) {
        user = userData.user;
      }
    } catch (e) {
      console.error("[requireAdmin] Cookie auth error:", options.unauthenticatedStatus ? "Authentication exception" : e);
    }
  }

  if (!user || !user.email || !supabaseUserClient) {
    return NextResponse.json(
      { error: !user && options.unauthenticatedStatus ? "Authentication required." : "Forbidden: Unable to verify access." },
      { status: !user && options.unauthenticatedStatus ? options.unauthenticatedStatus : 403 }
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
      console.error("[requireAdmin] Admin profile lookup failed:", options.lookupFailureStatus ? { code: profileError.code } : profileError);
      return NextResponse.json({ error: options.lookupFailureStatus ? "Unable to verify access." : "Forbidden: Unable to verify administrator access." }, { status: options.lookupFailureStatus ?? 403 });
    }

    // Unknown ban state cannot authorize either an organizer or administrator.
    if (!profile || profile.is_banned !== false) {
      return NextResponse.json({ error: "Forbidden: Unable to verify access." }, { status: 403 });
    }

    // Preserve the existing exact founder semantics in this shared boundary.
    // Only getUser's authenticated identity and the protected profile count.
    const isFounder = user.email.toLowerCase().trim() === "yashshah7117@gmail.com";
    return { user, supabaseUserClient, isAdmin: profile.role === "admin" || isFounder };
  } catch (e) {
    console.error("[requireAdmin] Admin profile lookup error:", options.lookupFailureStatus ? "Lookup exception" : e);
    return NextResponse.json({ error: options.lookupFailureStatus ? "Unable to verify access." : "Forbidden: Unable to verify administrator access." }, { status: options.lookupFailureStatus ?? 403 });
  }
}

export async function requireAdmin(
  req?: NextRequest
): Promise<AdminAuthResult | NextResponse> {
  const authorization = await requireVerifiedProfile(req);
  if (authorization instanceof NextResponse) return authorization;
  if (!authorization.isAdmin) {
    return NextResponse.json(
      { error: "Forbidden: Access restricted to authorized administrators." },
      { status: 403 }
    );
  }

  const { user, supabaseUserClient } = authorization;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabaseAdmin = serviceKey
    ? createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : supabaseUserClient;

  return { user, supabaseAdmin, supabaseUserClient };
}
