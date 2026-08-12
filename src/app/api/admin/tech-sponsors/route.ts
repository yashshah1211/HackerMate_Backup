import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";
import { createClient } from "@supabase/supabase-js";
import { autoSendSinglePitchEmail } from "@/lib/admin/autoSendPitches";

export const SAFE_SPONSOR_LEAD_COLUMNS =
  "id, company_name, website_url, contact_email, public_source_url, target_role, pitch_type, status, draft_pitch_subject, draft_pitch_body, pitch_sent_at, notes, created_at, updated_at";

export async function GET(req: NextRequest) {
  const authResult = await requireOutreachAdmin(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: leads, error } = await supabaseAdmin
      .from("tech_sponsor_leads")
      .select(SAFE_SPONSOR_LEAD_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ leads: leads || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireOutreachAdmin(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const { action, company_name, website_url, contact_email, public_source_url, target_role, pitch_type } = body;

    // Sub-action A: Add a new verified Tech Sponsor lead
    if (action === "add_lead") {
      if (!company_name || !contact_email || !public_source_url) {
        return NextResponse.json(
          { error: "Company name, contact email, and public source URL are required." },
          { status: 400 }
        );
      }

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("tech_sponsor_leads")
        .insert({
          company_name: company_name.trim(),
          website_url: (website_url || "").trim(),
          contact_email: contact_email.trim().toLowerCase(),
          public_source_url: public_source_url.trim(),
          target_role: (target_role || "DevRel / Community Lead").trim(),
          pitch_type: pitch_type || "credits_perks",
          status: "draft",
        })
        .select(SAFE_SPONSOR_LEAD_COLUMNS);

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, lead: inserted?.[0] });
    }

    // Sub-action B: Generate Draft Pitches for leads missing drafts
    // 1. Fetch live runtime counts from PostgreSQL
    const { count: profileCount } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true });

    const { count: teamCount } = await supabaseAdmin
      .from("teams")
      .select("id", { count: "exact", head: true });

    const { count: partnerCount } = await supabaseAdmin
      .from("partner_configs")
      .select("id", { count: "exact", head: true });

    const userCountDisplay = (profileCount || 300).toLocaleString("en-IN");
    const teamCountDisplay = (teamCount || 80).toLocaleString("en-IN");
    const partnerCountDisplay = (partnerCount || 5).toLocaleString("en-IN");

    // Fetch leads where draft_pitch_body is null or status = 'draft'
    const { data: draftableLeads, error: fetchErr } = await supabaseAdmin
      .from("tech_sponsor_leads")
      .select(SAFE_SPONSOR_LEAD_COLUMNS)
      .eq("status", "draft");

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    let generatedCount = 0;

    for (const lead of draftableLeads || []) {
      const encodedEmail = encodeURIComponent(lead.contact_email);
      const unsubscribeUrl = `https://hackermate.in/api/unsubscribe?email=${encodedEmail}`;

      const subject = `Partnering HackerMate × ${lead.company_name} — Dev Perks & Student Credits`;

      const draftBody = `Hi ${lead.target_role || "Team"} at ${lead.company_name},

Hope you're having a great week!

I’m Yash, founder of HackerMate (https://hackermate.in) — India's premier hackathon squad-building and team-formation platform.

We are currently powering participants across ${partnerCountDisplay} partner hackathons, with ${userCountDisplay}+ active student developers who have formed over ${teamCountDisplay}+ project teams.

We’d love to explore featuring ${lead.company_name} as an Official Developer Infrastructure Partner on HackerMate:
- Offering ${lead.company_name} cloud/API credits & perks directly to HackerMate squads building projects.
- Co-branded partner hub placement across our hackathon directory and builder dashboards.
- Zero financial cost for your team — purely driving product adoption among active builders.

Would you be open to providing developer credits or student perks for our upcoming hackathon cohorts? Happy to share our participant metrics or jump on a quick 10-minute chat.

Best regards,

Yash Shah
Founder, HackerMate
yash@hackermate.in | https://hackermate.in

---
If you prefer not to receive partnership requests from HackerMate, click here to opt out:
${unsubscribeUrl}`;

      await supabaseAdmin
        .from("tech_sponsor_leads")
        .update({
          draft_pitch_subject: subject,
          draft_pitch_body: draftBody,
          status: "draft",
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      generatedCount++;
    }

    return NextResponse.json({
      success: true,
      generatedCount,
      metrics: {
        profiles: profileCount,
        teams: teamCount,
        partners: partnerCount,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireOutreachAdmin(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const { leadId, customSubject, customBody } = body;

    if (!leadId) {
      return NextResponse.json({ error: "Missing leadId" }, { status: 400 });
    }

    // Fetch the target lead
    const { data: leads, error: fetchErr } = await supabaseAdmin
      .from("tech_sponsor_leads")
      .select(SAFE_SPONSOR_LEAD_COLUMNS)
      .eq("id", leadId)
      .limit(1);

    if (fetchErr || !leads || leads.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 444 });
    }

    const lead = leads[0];
    const subject = customSubject || lead.draft_pitch_subject || `Partnering HackerMate × ${lead.company_name}`;
    const draftText = customBody || lead.draft_pitch_body;

    if (!draftText) {
      return NextResponse.json({ error: "Draft body is empty. Please generate or enter draft pitch first." }, { status: 400 });
    }

    // Dispatch via centralized email budget guard
    const sendResult = await autoSendSinglePitchEmail(supabaseAdmin, {
      recipientEmail: lead.contact_email,
      recipientName: lead.company_name,
      subject,
      bodyText: draftText,
    });

    if (sendResult.success) {
      await supabaseAdmin
        .from("tech_sponsor_leads")
        .update({
          status: "pitch_sent",
          pitch_sent_at: new Date().toISOString(),
          draft_pitch_subject: subject,
          draft_pitch_body: draftText,
        })
        .eq("id", lead.id);

      return NextResponse.json({ success: true, sendResult });
    } else {
      return NextResponse.json({ error: sendResult.error || "Failed to send email via budget guard" }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal Error" }, { status: 500 });
  }
}
