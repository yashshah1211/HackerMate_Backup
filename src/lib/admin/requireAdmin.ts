import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

export interface AdminAuthResult {
  user: User;
  supabaseAdmin: SupabaseClient;
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 1. Try Bearer token if provided
  if (token) {
    try {
      const tokenClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userData } = await tokenClient.auth.getUser(token);
      if (userData?.user) {
        user = userData.user;
      }
    } catch (e) {
      console.warn("[requireAdmin] Token auth error:", e);
    }
  }

  // 2. Fallback to cookies
  let supabaseUserClient: any = null;
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

    const { data: userData, error: authError } = await supabaseUserClient.auth.getUser();
    if (!authError && userData?.user) {
      user = userData.user;
    }
  }

  if (!user || !user.email) {
    return NextResponse.json(
      { error: "Forbidden: Access restricted to logged-in administrators." },
      { status: 403 }
    );
  }

  // 3. Resolve Admin Client (Service Role Key or authenticated token client)
  const supabaseAdmin: SupabaseClient = serviceKey
    ? createClient(url, serviceKey)
    : token
    ? createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
    : (supabaseUserClient || createClient(url, anonKey));

  const emailClean = user.email.toLowerCase().trim();
  const isSuperAdmin = emailClean === "yashshah7117@gmail.com" || emailClean.includes("admin");

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
