import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

import { verifySpocAuthorization, isSameCollege } from "@/lib/sihSpocAuth";

export async function GET(req: NextRequest) {
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

    const {
      data: { user },
    } = await supabaseUser.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const authResult = await verifySpocAuthorization(user, supabaseAdmin);
    if (!authResult.isAuthorized) {
      return NextResponse.json(
        { error: "Forbidden: Exporting official SIH nominations CSV requires SPOC or HOD authorization." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") || "all";
    const status = searchParams.get("status") || "all";
    const targetCollege = authResult.isAdminOverride
      ? searchParams.get("college") || authResult.collegeName || "DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)"
      : authResult.collegeName!;

    let query = supabaseAdmin
      .from("sih_mock_submissions")
      .select("*, teams(id, name, college, owner_id, team_members(id, user_id, role, project_role, profiles(id, full_name, email, gender)))")
      .order("total_score", { ascending: false });

    if (category !== "all") {
      query = query.eq("ps_category", category);
    }

    const { data: rawSubmissions, error } = await query;

    if (error || !rawSubmissions) {
      return NextResponse.json({ error: "Failed to generate SPOC export." }, { status: 500 });
    }

    const submissions = targetCollege
      ? rawSubmissions.filter((sub: any) => isSameCollege(targetCollege, sub.teams?.college))
      : rawSubmissions;

    // Build CSV Headers
    const headers = [
      "SIH_PS_Number",
      "SIH_PS_Title",
      "Category",
      "Theme",
      "Team_Name",
      "College_Name",
      "Team_Leader_Name",
      "Team_Leader_Email",
      "Member_2_Name",
      "Member_3_Name",
      "Member_4_Name",
      "Member_5_Name",
      "Member_6_Name",
      "Mandatory_Female_Teammate",
      "Pitch_PPT_URL",
      "GitHub_URL",
      "AI_Screening_Score",
      "Jury_Viva_Score",
      "Final_Composite_Score",
      "SPOC_Approval_Status",
      "SPOC_Notes",
    ];

    const rows: string[] = [headers.join(",")];

    for (const sub of submissions) {
      const fb = sub.ai_feedback || {};
      const spocStatus = sub.spoc_approval_status || fb.spoc_approval_status || "pending";
      const vivaScore = sub.jury_viva_score !== undefined && sub.jury_viva_score !== null ? sub.jury_viva_score : (fb.jury_viva_score || 0);
      const compositeScore = sub.final_composite_score || fb.final_composite_score || sub.total_score || 0;
      const spocNotes = sub.spoc_notes || fb.spoc_notes || "";

      // Apply status filter if set
      if (status !== "all" && spocStatus !== status) {
        continue;
      }

      const team = sub.teams || {};
      const members = team.team_members || [];
      const leader = members.find((m: any) => m.user_id === team.owner_id) || members[0];
      const leaderProfile = leader?.profiles || {};

      const memberNames: string[] = [];
      let hasFemale = false;

      members.forEach((m: any) => {
        const p = m.profiles || {};
        if (p.gender?.toLowerCase() === "female" || p.gender?.toLowerCase() === "f") {
          hasFemale = true;
        }
        if (p.full_name) {
          memberNames.push(p.full_name);
        }
      });

      const m2 = memberNames[1] || "N/A";
      const m3 = memberNames[2] || "N/A";
      const m4 = memberNames[3] || "N/A";
      const m5 = memberNames[4] || "N/A";
      const m6 = memberNames[5] || "N/A";

      const row = [
        escapeCsv(sub.ps_number),
        escapeCsv(sub.ps_title),
        escapeCsv(sub.ps_category),
        escapeCsv(sub.theme),
        escapeCsv(team.name || "SIH Team"),
        escapeCsv(team.college || "D.J. Sanghvi College of Engineering (DJSCE)"),
        escapeCsv(leaderProfile.full_name || "Team Leader"),
        escapeCsv(leaderProfile.email || "N/A"),
        escapeCsv(m2),
        escapeCsv(m3),
        escapeCsv(m4),
        escapeCsv(m5),
        escapeCsv(m6),
        hasFemale ? "YES" : "NO (RULE VIOLATION)",
        escapeCsv(sub.ppt_url),
        escapeCsv(sub.github_url || "N/A"),
        sub.total_score || 0,
        vivaScore,
        compositeScore,
        escapeCsv(spocStatus),
        escapeCsv(spocNotes),
      ];

      rows.push(row.join(","));
    }

    const csvContent = rows.join("\n");
    const filename = `DJSCE_SIH2026_Internal_Nominations_${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("[SPOC Export Error]:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

function escapeCsv(val: string | null | undefined): string {
  if (!val) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}
