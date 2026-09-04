import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function getSupabaseClient(token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (token) {
    return createClient(url, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  }
  return createClient(url, anonKey);
}

async function verifyAdminUser(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  let token: string | undefined;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  }

  const client = getSupabaseClient(token);

  // 1. Try Bearer token
  if (token) {
    try {
      const { data: userData } = await client.auth.getUser(token);
      const user = userData?.user;
      if (user) {
        const email = user.email?.toLowerCase().trim() || "";
        if (email === "yashshah7117@gmail.com" || email.includes("admin")) {
          return { user, isAdmin: true, supabaseAdmin: client };
        }
        const { data: profile } = await client
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.role === "admin") {
          return { user, isAdmin: true, supabaseAdmin: client };
        }
      }
    } catch (tokenErr) {
      console.warn("[Admin Challenges] Bearer token check error:", tokenErr);
    }
  }

  // 2. Try Cookies
  try {
    const cookieStore = await cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (user) {
      const email = user.email?.toLowerCase().trim() || "";
      if (email === "yashshah7117@gmail.com" || email.includes("admin")) {
        return { user, isAdmin: true, supabaseAdmin: supabaseUser as any };
      }
      const { data: profile } = await supabaseUser
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role === "admin") {
        return { user, isAdmin: true, supabaseAdmin: supabaseUser as any };
      }
    }
  } catch (err) {
    console.error("[Admin Auth Error]:", err);
  }

  return { user: null, isAdmin: false, supabaseAdmin: client };
}

export async function GET(req: NextRequest) {
  try {
    const { isAdmin, supabaseAdmin } = await verifyAdminUser(req);
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized: Admin access required." }, { status: 403 });
    }

    let challenges: any[] = [];
    const { data: fullData, error: fullErr } = await supabaseAdmin
      .from("weekly_challenges")
      .select("id, challenge_number, title, slug, track, difficulty, summary, problem_statement, problem_pdf_url, additional_rules, constraints, slide_template, starter_template_url, status, starts_at, ends_at, created_at, updated_at")
      .order("challenge_number", { ascending: false });

    if (fullErr) {
      // Fallback if optional columns do not exist yet on DB
      const { data: fallbackData, error: fallbackErr } = await supabaseAdmin
        .from("weekly_challenges")
        .select("id, challenge_number, title, slug, track, difficulty, summary, problem_statement, constraints, slide_template, starter_template_url, status, starts_at, ends_at, created_at, updated_at")
        .order("challenge_number", { ascending: false });

      if (fallbackErr) {
        console.error("[Admin Challenges] Fallback query error:", fallbackErr);
        return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
      }
      challenges = fallbackData || [];
    } else {
      challenges = fullData || [];
    }

    // Get submission counts per challenge
    const { data: submissions } = await supabaseAdmin
      .from("challenge_submissions")
      .select("challenge_id, id");

    const countsMap: Record<string, number> = {};
    (submissions || []).forEach((s: any) => {
      countsMap[s.challenge_id] = (countsMap[s.challenge_id] || 0) + 1;
    });

    const enriched = challenges.map((c: any) => ({
      ...c,
      submissionCount: countsMap[c.id] || 0,
    }));

    return NextResponse.json({ success: true, challenges: enriched });
  } catch (err: any) {
    console.error("[Admin Challenges GET] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, isAdmin, supabaseAdmin } = await verifyAdminUser(req);
    if (!isAdmin || !user) {
      return NextResponse.json({ error: "Unauthorized: Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const {
      challenge_number,
      title,
      slug,
      track,
      difficulty,
      summary,
      problem_statement,
      problem_pdf_url,
      additional_rules,
      constraints,
      slide_template,
      starter_template_url,
      status,
      starts_at,
      ends_at,
    } = body;

    if (!title || !problem_statement) {
      return NextResponse.json(
        { error: "Title and problem statement are required." },
        { status: 400 }
      );
    }

    // Generate unique slug
    const cleanSlug = (slug || title)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Calculate unique challenge number if not given
    let num = challenge_number;
    if (!num) {
      const { data: maxRow } = await supabaseAdmin
        .from("weekly_challenges")
        .select("challenge_number")
        .order("challenge_number", { ascending: false })
        .limit(1);
      num = (maxRow?.[0]?.challenge_number || 0) + 1;
    }

    const default6Slides = [
      { slideNumber: 1, title: "Slide 1: Problem Understanding & Target Personas", category: "Problem & Opportunity" },
      { slideNumber: 2, title: "Slide 2: Proposed Solution & Value Moat", category: "Solution & Moat" },
      { slideNumber: 3, title: "Slide 3: Technical Architecture & Data Pipeline", category: "System Architecture" },
      { slideNumber: 4, title: "Slide 4: Feasibility, Edge Cases & Risk Mitigation", category: "Feasibility & Risks" },
      { slideNumber: 5, title: "Slide 5: Quantified Impact & Beneficiary ROI", category: "Impact & Metrics" },
      { slideNumber: 6, title: "Slide 6: Execution Roadmap & Team Roles / Milestones", category: "Roadmap & Roles" },
    ];

    const insertPayload: Record<string, any> = {
      challenge_number: num,
      title: title.trim(),
      slug: cleanSlug,
      track: track || "Full-Stack / AI",
      difficulty: difficulty || "Intermediate",
      summary: summary?.trim() || "",
      problem_statement: problem_statement.trim(),
      problem_pdf_url: problem_pdf_url?.trim() || null,
      additional_rules: additional_rules?.trim() || null,
      constraints: constraints || [
        "Maximum 6 slides total in presentation deck",
        "Must include an end-to-end data pipeline in Slide 3",
        "Quantified baseline metrics and milestones required in Slides 5 & 6",
      ],
      slide_template: slide_template || default6Slides,
      starter_template_url: starter_template_url?.trim() || null,
      status: status || "active",
      starts_at: starts_at || new Date().toISOString(),
      ends_at: ends_at || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      created_by: user.id,
    };

    let newChallenge: any = null;
    const { data: res1, error: err1 } = await supabaseAdmin
      .from("weekly_challenges")
      .insert(insertPayload)
      .select("id, challenge_number, title, slug, track, difficulty, summary, problem_statement, status, starts_at, ends_at, created_at")
      .single();

    if (err1) {
      console.warn("[Admin Challenges POST] Retrying insert without optional columns:", err1.message);
      const fallbackPayload = { ...insertPayload };
      delete fallbackPayload.problem_pdf_url;
      delete fallbackPayload.additional_rules;

      const { data: res2, error: err2 } = await supabaseAdmin
        .from("weekly_challenges")
        .insert(fallbackPayload)
        .select("id, challenge_number, title, slug, track, difficulty, summary, problem_statement, status, starts_at, ends_at, created_at")
        .single();

      if (err2) {
        console.error("[Admin Challenges POST] Insert error:", err2);
        return NextResponse.json({ error: err2.message }, { status: 500 });
      }
      newChallenge = res2;
    } else {
      newChallenge = res1;
    }

    return NextResponse.json({ success: true, challenge: newChallenge });
  } catch (err: any) {
    console.error("[Admin Challenges POST] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
