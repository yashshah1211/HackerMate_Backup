import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    const body = await req.json().catch(() => ({}));
    const { leadId, customSlug, brandColor, tagline } = body;

    if (!leadId) {
      return NextResponse.json({ error: "Missing required leadId parameter" }, { status: 400 });
    }

    // 1. Fetch Lead
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("organizer_leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: "Organizer lead not found" }, { status: 404 });
    }

    // 2. Find or Create Matching Hackathon
    let { data: hackathon } = await supabaseAdmin
      .from("hackathons")
      .select("*")
      .or(`id.eq.${lead.id},name.eq."${lead.title.replace(/"/g, '\\"')}",website_url.eq."${lead.unstop_url || ""}"`)
      .maybeSingle();

    if (!hackathon) {
      const { data: createdHackathon, error: createHackErr } = await supabaseAdmin
        .from("hackathons")
        .insert({
          name: lead.title,
          description: `Official Partner Hackathon — ${lead.title}`,
          website_url: lead.unstop_url,
          college: lead.college_or_host,
          mode: "online",
          type: "external",
          prize_pool: "Certificate & Perks",
          start_date: new Date().toISOString(),
        })
        .select()
        .single();

      if (createHackErr || !createdHackathon) {
        console.error("[Create Partner Portal] Error creating hackathon:", createHackErr);
        return NextResponse.json(
          { error: "Failed to provision hackathon record", details: createHackErr?.message },
          { status: 500 }
        );
      }
      hackathon = createdHackathon;
    }

    // 3. Check if Partner Config already exists
    const { data: existingConfig } = await supabaseAdmin
      .from("partner_configs")
      .select("*")
      .eq("hackathon_id", hackathon.id)
      .maybeSingle();

    if (existingConfig) {
      return NextResponse.json({
        success: true,
        alreadyExisted: true,
        partnerConfig: existingConfig,
        portalUrl: `/partners/${existingConfig.slug}`,
      });
    }

    // 4. Generate Unique Slug
    let rawSlug = (customSlug || lead.title)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!rawSlug) rawSlug = "partner-event";

    let finalSlug = rawSlug;
    let counter = 1;
    while (true) {
      const { data: slugCheck } = await supabaseAdmin
        .from("partner_configs")
        .select("id")
        .eq("slug", finalSlug)
        .maybeSingle();

      if (!slugCheck) break;
      finalSlug = `${rawSlug}-${counter}`;
      counter++;
    }

    // 5. Insert Partner Config
    const newPartner = {
      slug: finalSlug,
      hackathon_id: hackathon.id,
      partner_name: lead.title,
      tagline: tagline || `Official Co-Branded Partner Portal for ${lead.title}. Find your team, connect with mentors, and build solutions.`,
      brand_color: brandColor || "#3B82F6",
      accent_color: "#10B981",
      logo_url: "/partners/axcentra-icon-only-transparent.png",
      override_prize_pool: null,
      features: {},
    };

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("partner_configs")
      .insert(newPartner)
      .select()
      .single();

    if (insertErr || !inserted) {
      console.error("[Create Partner Portal] Error inserting partner_config:", insertErr);
      return NextResponse.json(
        { error: "Failed to create partner config", details: insertErr?.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      alreadyExisted: false,
      partnerConfig: inserted,
      portalUrl: `/partners/${inserted.slug}`,
    });
  } catch (err: any) {
    console.error("[Create Partner Portal Error]:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err.message },
      { status: 500 }
    );
  }
}
