import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user, supabaseAdmin } = authResult;

    const body = await req.json();
    const {
      hackathonId,
      emails,
      badgeType = "verified_winner",
      badgeName = "Verified Winner — All India Hackathon",
      issuerName = "HackerMate",
      rankTitle = "Verified Winner",
    } = body;

    if (!hackathonId || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: "hackathonId and emails array are required" }, { status: 400 });
    }

    // Resolve emails to profile IDs
    const cleanEmails = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
    const { data: profiles, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .in("email", cleanEmails);

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    const foundProfiles = profiles || [];
    const userIds = foundProfiles.map((p) => p.id);
    const missingEmails = cleanEmails.filter(
      (e) => !foundProfiles.some((p) => p.email.toLowerCase() === e)
    );

    if (userIds.length === 0) {
      return NextResponse.json({
        success: false,
        granted: 0,
        missingEmails,
        message: "No matching registered users found for provided email addresses.",
      });
    }

    // Call grant_hackathon_winner_badges or execute batch insert
    const insertPayload = userIds.map((uId) => ({
      user_id: uId,
      hackathon_id: hackathonId,
      badge_type: badgeType,
      badge_name: badgeName,
      issuer_name: issuerName,
      rank_title: rankTitle,
      metadata: {
        certificate_id: `HM-CERT-${uId.slice(0, 6).toUpperCase()}`,
        issued_by_admin: user.id,
      },
    }));

    const { data: badgeResults, error: badgeErr } = await supabaseAdmin
      .from("user_badges")
      .upsert(insertPayload, { onConflict: "user_id,hackathon_id,badge_type" })
      .select("id");

    if (badgeErr) {
      return NextResponse.json({ error: badgeErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      granted: badgeResults?.length || userIds.length,
      foundUsers: foundProfiles.length,
      missingEmails,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    const { data: badges, error } = await supabaseAdmin
      .from("user_badges")
      .select("*, profiles:user_id(full_name, email), hackathons:hackathon_id(name)")
      .order("issued_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ badges: badges || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
