import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Certificate ID is required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Sanitize input to allow only valid ID / certificate string characters (alphanumeric, hyphens, underscores)
    const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!cleanId) {
      return NextResponse.json({ error: "Invalid certificate ID format" }, { status: 400 });
    }

    // Search by exact badge ID or metadata certificate_id
    const { data: badge, error } = await supabase
      .from("user_badges")
      .select("id, badge_name, issuer_name, rank_title, issued_at, metadata, profiles:user_id(full_name, college), hackathons:hackathon_id(name)")
      .or(`id.eq.${cleanId},metadata->>certificate_id.eq.${cleanId}`)
      .maybeSingle();

    if (error) {
      console.error("[Certificate Verification] Supabase query error:", error);
    }

    if (error || !badge) {
      return NextResponse.json({
        valid: false,
        message: "Certificate not found or invalid",
        certificate_id: id,
      }, { status: 404 });
    }

    return NextResponse.json({
      valid: true,
      certificate_id: badge.metadata?.certificate_id || `HM-CERT-${badge.id.slice(0, 8).toUpperCase()}`,
      badge_name: badge.badge_name,
      issuer_name: badge.issuer_name,
      rank_title: badge.rank_title,
      recipient_name: (badge.profiles as any)?.full_name || "Verified Participant",
      recipient_college: (badge.profiles as any)?.college || null,
      event_name: (badge.hackathons as any)?.name || badge.badge_name,
      issued_at: badge.issued_at,
    });
  } catch (err) {
    console.error("[Certificate Verification] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
