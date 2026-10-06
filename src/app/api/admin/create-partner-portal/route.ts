import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { accountId, readBody, existingEvent, PartnerAdminError } from "@/lib/admin/partnerManagement";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    // V1 uses partner-config, which has no lead/default/event-creation behavior.
    const body = await readBody(req, ["leadId", "customSlug", "brandColor", "tagline", "existingEventId"]);
    const { leadId, customSlug, brandColor, tagline } = body;

    if (!leadId) {
      return NextResponse.json({ error: "Missing required leadId parameter" }, { status: 400 });
    }
    accountId(leadId, "Lead");
    if (customSlug !== undefined && (typeof customSlug !== "string" || customSlug.length > 100)) throw new PartnerAdminError(400, "Invalid custom slug.");
    if (brandColor !== undefined && (typeof brandColor !== "string" || !/^#[0-9a-f]{6}$/i.test(brandColor))) throw new PartnerAdminError(400, "Invalid brand color.");
    if (tagline !== undefined && (typeof tagline !== "string" || tagline.length > 360)) throw new PartnerAdminError(400, "Invalid tagline.");
    const existingEventId = body.existingEventId === undefined ? null : accountId(body.existingEventId);

    // 1. Fetch Lead
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("organizer_leads")
      .select("id, title, unstop_url, college_or_host")
      .eq("id", leadId)
      .single();

    if (leadErr || !lead) {
      if (leadErr) {
        console.error("[Create Partner Portal] Lead lookup failed:", leadErr);
        return NextResponse.json({ error: "Unable to verify organizer lead" }, { status: 500 });
      }
      return NextResponse.json({ error: "Organizer lead not found" }, { status: 404 });
    }

    // 2. Find or Create Matching Hackathon
    let hackathon: { id: string } | null = null;
    if (existingEventId) {
      hackathon = await existingEvent(supabaseAdmin, existingEventId);
    } else {
      const matches = new Map<string, { id: string }>();
      const lookups: ["id" | "name" | "website_url", string | null][] = [["id", lead.id], ["name", lead.title], ["website_url", lead.unstop_url]];
      for (const [column, value] of lookups) {
        if (!value) continue;
        const match = await supabaseAdmin.from("hackathons").select("id").eq(column, value).maybeSingle();
        if (match.error) {
          console.error("[Create Partner Portal] Event match failed:", match.error);
          return NextResponse.json({ error: "Unable to resolve an existing event" }, { status: 500 });
        }
        if (match.data) matches.set(match.data.id, match.data);
      }
      if (matches.size > 1) throw new PartnerAdminError(409, "Multiple events match this lead. Choose an existing event explicitly.");
      hackathon = [...matches.values()][0] || null;
    }

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
          { error: "Failed to provision hackathon record" },
          { status: 500 }
        );
      }
      hackathon = { id: createdHackathon.id };
    }

    // 3. Check if Partner Config already exists
    const { data: existingConfig, error: existingConfigError } = await supabaseAdmin
      .from("partner_configs")
      .select("id, slug, hackathon_id, partner_name")
      .eq("hackathon_id", hackathon.id)
      .maybeSingle();
    if (existingConfigError) {
      console.error("[Create Partner Portal] Configuration lookup failed:", existingConfigError);
      return NextResponse.json({ error: "Unable to verify partner configuration" }, { status: 500 });
    }

    if (existingConfig) {
      return NextResponse.json({
        success: true,
        alreadyExisted: true,
        partnerConfig: existingConfig,
        portalUrl: `/partners/${existingConfig.slug}`,
      });
    }

    // 4. Generate Unique Slug
    let rawSlug = (typeof customSlug === "string" && customSlug || lead.title)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!rawSlug) rawSlug = "partner-event";

    let finalSlug = rawSlug;
    let counter = 1;
    while (true) {
      const { data: slugCheck, error: slugError } = await supabaseAdmin
        .from("partner_configs")
        .select("id")
        .eq("slug", finalSlug)
        .maybeSingle();
      if (slugError) {
        console.error("[Create Partner Portal] Slug lookup failed:", slugError);
        return NextResponse.json({ error: "Unable to verify public slug" }, { status: 500 });
      }

      if (!slugCheck) break;
      finalSlug = `${rawSlug}-${counter}`;
      counter++;
    }

    // 5. Insert Partner Config
    const newPartner = {
      slug: finalSlug,
      hackathon_id: hackathon.id,
      partner_name: lead.title,
      tagline: tagline || null,
      brand_color: brandColor || "#3B82F6",
      accent_color: "#10B981",
      logo_url: null,
      override_prize_pool: null,
      features: {},
    };

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("partner_configs")
      .insert(newPartner)
      .select("id, slug, hackathon_id, partner_name")
      .single();

    if (insertErr || !inserted) {
      console.error("[Create Partner Portal] Error inserting partner_config:", insertErr);
      return NextResponse.json(
        { error: "Failed to create partner config" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      alreadyExisted: false,
      partnerConfig: inserted,
      portalUrl: `/partners/${inserted.slug}`,
    });
  } catch (err) {
    console.error("[Create Partner Portal Error]:", err);
    return NextResponse.json(
      { error: err instanceof PartnerAdminError ? err.message : "Internal Server Error" },
      { status: err instanceof PartnerAdminError ? err.status : 500 }
    );
  }
}
