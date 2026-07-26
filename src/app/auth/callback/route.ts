import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // if "next" is in param, use it as the redirect address
  const next = searchParams.get("next") ?? "/dashboard";

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

    let response = NextResponse.redirect(`${origin}${next}`);

    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile || !profile.onboarding_completed) {
        const redirectRes = NextResponse.redirect(
          `${origin}/onboarding?next=${encodeURIComponent(next)}`
        );
        response.cookies.getAll().forEach((cookie) => {
          redirectRes.cookies.set(cookie.name, cookie.value);
        });
        return redirectRes;
      }

      return response;
    }
    console.error("Auth callback code exchange error:", error);
  }

  // Redirect to home page with error if exchange fails
  return NextResponse.redirect(`${origin}/?error=AuthCallbackError`);
}
