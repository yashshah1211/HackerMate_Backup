import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { safeAuthReturnPath } from "@/lib/auth/returnPath";
import { trustedCallbackOrigin } from "@/lib/auth/callbackOrigin";

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

    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && user) {
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
