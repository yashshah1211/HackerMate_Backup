import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { safeAuthReturnPath } from "@/lib/auth/returnPath";
import { trustedCallbackOrigin } from "@/lib/auth/callbackOrigin";
import { BASE } from "@/lib/hustle-phase2/core";
import { enabled } from "@/lib/hustle-phase2/server";
import { attestGoogleSession } from "@/lib/hustle-phase2/google-session";

export async function GET(request: NextRequest) {
  const origin = trustedCallbackOrigin(request.url);
  if (!origin) {
    return NextResponse.json({ error: "Invalid authentication callback origin.", code: "AUTH_CALLBACK_ORIGIN_INVALID" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeAuthReturnPath(searchParams.get("next"));

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const response = NextResponse.redirect(new URL(next, origin));

    const { data: { user, session }, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && user) {
      // Round 2 only; ordinary Google/GitHub authentication is unchanged.
      // HARD-OFF performs no proof RPC or Google userinfo request.
      if (next === BASE && enabled() && (!session || !await attestGoogleSession(session, supabase))) {
        const denied = NextResponse.json({ error: "Round 2 requires a fresh Google sign-in. Other HackerMate access is unchanged." },
          { status: 403, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
        response.cookies.getAll().forEach(cookie => denied.cookies.set(cookie));
        return denied;
      }
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Auth callback profile fetch error:", profileError);
        // Preserve the existing handoff; destination guards still authorize access.
        return response;
      }

      if (!profile || !profile.onboarding_completed) {
        const redirectRes = NextResponse.redirect(
          new URL(`/onboarding?next=${encodeURIComponent(next)}`, origin)
        );
        response.cookies.getAll().forEach((cookie) => {
          redirectRes.cookies.set(cookie);
        });
        return redirectRes;
      }

      return response;
    }
    console.error("Auth callback code exchange error:", error);
  }

  // Redirect to home page with error if exchange fails
  return NextResponse.redirect(new URL("/?error=AuthCallbackError", origin));
}
