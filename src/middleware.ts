import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const protectedRoutes = [
    "/dashboard",
    "/developers",
    "/profile/edit",
    "/notifications",
    "/connections",
    "/invites",
    "/messages",
    "/my-teams",
    "/admin",
    "/api/admin",
    "/hackathons/create",
    "/settings",
  ];

  const isProtected =
    protectedRoutes.some((route) => pathname.startsWith(route)) ||
    pathname === "/teams/create" ||
    (pathname.startsWith("/teams/") && (pathname.endsWith("/dashboard") || pathname.endsWith("/requests")));

  if (!isProtected) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isApiRoute = pathname.startsWith("/api/");

  if (!user) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    const redirectResponse = NextResponse.redirect(loginUrl);
    // Copy any updated cookies to redirect response
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  // Admin route server-side role check
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const isSuperAdmin = user.email?.toLowerCase().trim() === "yashshah7117@gmail.com";
    if (!isSuperAdmin) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile || profile.role !== "admin") {
        if (isApiRoute) {
          return NextResponse.json(
            { error: "Forbidden: Access restricted to authorized administrator." },
            { status: 403 }
          );
        }
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/dashboard";
        redirectUrl.search = "";
        const redirectResponse = NextResponse.redirect(redirectUrl);
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value);
        });
        return redirectResponse;
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/developers/:path*",
    "/teams/:path*",
    "/profile/:path*",
    "/notifications/:path*",
    "/connections/:path*",
    "/hackathons/:path*",
    "/invites/:path*",
    "/messages/:path*",
    "/my-teams/:path*",
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};


