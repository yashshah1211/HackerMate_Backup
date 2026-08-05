import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

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

    // Verify Admin Authorization
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin, role, email")
      .eq("id", user.id)
      .maybeSingle();

    const isAuthorized =
      profile?.is_admin ||
      user.email === "yashshah7117@gmail.com" ||
      user.email === "yashshah111@gmail.com" ||
      user.email?.includes("admin");

    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "60", 10);

    // Fetch first N registered users ordered by created_at ASC
    const { data: rawProfiles, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, college, created_at")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchErr || !rawProfiles) {
      console.error("[SIH Announcement Preview Fetch Error]:", fetchErr);
      return NextResponse.json({ error: "Failed to fetch user list." }, { status: 500 });
    }

    const validTargets = rawProfiles.filter((p) => p.email && p.email.includes("@"));
    const emailSubject = "⚡ Test your SIH 2026 Pitch Deck with AI before your College Selection Round! 🚀";
    const sampleHtml = buildEmailHtml("Builder", emailSubject, "https://hackermate.in/hackathons/sih");

    return NextResponse.json({
      success: true,
      mode: "DRY_RUN_PREVIEW",
      totalFound: validTargets.length,
      limit,
      emailSubject,
      targets: validTargets.map((t, idx) => ({
        index: idx + 1,
        id: t.id,
        name: t.full_name || "Builder",
        email: t.email,
        college: t.college || "N/A",
        registeredAt: t.created_at,
      })),
      htmlPreview: sampleHtml,
    });
  } catch (err: any) {
    console.error("[SIH Announcement GET Error]:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

    // Verify Admin Authorization
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin, role, email")
      .eq("id", user.id)
      .maybeSingle();

    const isAuthorized =
      profile?.is_admin ||
      user.email === "yashshah7117@gmail.com" ||
      user.email === "yashshah111@gmail.com" ||
      user.email?.includes("admin");

    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden: Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { sendLive, limit = 60, testEmailOnly } = body;

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Yash from HackerMate <yash@hackermate.in>";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (host ? `${proto}://${host}` : "https://hackermate.in");
    const targetUrl = `${baseUrl}/hackathons/sih`;

    const emailSubject = "⚡ Test your SIH 2026 Pitch Deck with AI before your College Selection Round! 🚀";

    // 1. Single Test Email Mode
    if (testEmailOnly) {
      const recipientName = "Yash (Test)";
      const htmlBody = buildEmailHtml(recipientName, emailSubject, targetUrl);

      if (!resendApiKey) {
        return NextResponse.json({
          success: true,
          mode: "TEST_EMAIL_MOCK",
          testEmail: testEmailOnly,
          message: "RESEND_API_KEY not configured. Mock test logged.",
        });
      }

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: testEmailOnly,
          subject: `[TEST RUN] ${emailSubject}`,
          html: htmlBody,
        }),
      });

      const resendData = await resendRes.json();
      if (!resendRes.ok) {
        return NextResponse.json({ error: "Resend API Error", details: resendData }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        mode: "TEST_EMAIL_SENT",
        testEmail: testEmailOnly,
        resendResponse: resendData,
      });
    }

    if (!sendLive) {
      return NextResponse.json(
        { error: "Confirmation missing. Pass { sendLive: true } to trigger bulk email dispatch." },
        { status: 400 }
      );
    }

    // 2. Fetch first N registered users ordered by created_at ASC
    const { data: rawProfiles, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, college, created_at")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (fetchErr || !rawProfiles) {
      return NextResponse.json({ error: "Failed to fetch targets from database." }, { status: 500 });
    }

    const targets = rawProfiles.filter((p) => p.email && p.email.includes("@"));

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Send in batches of 5 with 300ms pause to avoid rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (p: any) => {
          if (!p.email) return;

          const recipientName = p.full_name?.trim() ? p.full_name.trim().split(" ")[0] : "Builder";
          const htmlBody = buildEmailHtml(recipientName, emailSubject, targetUrl);

          if (!resendApiKey) {
            successCount++;
            return;
          }

          try {
            const resendRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendApiKey}`,
              },
              body: JSON.stringify({
                from: fromEmail,
                to: p.email,
                subject: emailSubject,
                html: htmlBody,
              }),
            });

            if (resendRes.ok) {
              successCount++;
            } else {
              const errData = await resendRes.json();
              failedCount++;
              errors.push(`${p.email}: ${errData.message || "Failed"}`);
            }
          } catch (err: any) {
            failedCount++;
            errors.push(`${p.email}: ${err.message}`);
          }
        })
      );

      // 300ms rate limit buffer
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return NextResponse.json({
      success: true,
      mode: "BULK_LIVE_SENT",
      totalTargeted: targets.length,
      successCount,
      failedCount,
      errors: errors.slice(0, 10),
    });
  } catch (err: any) {
    console.error("[SIH Announcement POST Error]:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

function buildEmailHtml(recipientName: string, subject: string, ctaUrl: string) {
  const safeName = escapeHtml(recipientName);
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { background-color: #090D14; color: #E2E8F0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 32px 20px; }
    .card { background-color: #0F172A; border: 1px solid #1E293B; border-radius: 20px; padding: 36px 28px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; background-color: rgba(16, 185, 129, 0.15); color: #34D399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-mono; }
    h1 { color: #FFFFFF; font-size: 24px; font-weight: 800; margin-top: 16px; margin-bottom: 16px; line-height: 1.3; }
    p { color: #94A3B8; font-size: 14px; line-height: 1.6; margin-bottom: 20px; }
    .feature-box { background-color: rgba(30, 41, 59, 0.5); border: 1px solid #334155; border-radius: 14px; padding: 16px; margin-bottom: 24px; }
    .feature-item { font-size: 13px; color: #CBD5E1; margin-bottom: 10px; line-height: 1.5; }
    .feature-item strong { color: #10B981; }
    .btn { display: block; width: 100%; text-align: center; background: linear-gradient(to right, #059669, #0D9488); color: #FFFFFF !important; font-weight: 800; font-size: 15px; padding: 16px 24px; border-radius: 14px; text-decoration: none; box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3); transition: all 0.2s; }
    .footer { text-align: center; margin-top: 32px; font-size: 11px; color: #64748B; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <span class="badge">⚡ HackerMate Platform Announcement</span>
      <h1>Test your SIH 2026 Pitch Deck with AI before College Selection! 🚀</h1>

      <p>Hi ${safeName},</p>

      <p>Preparing for <strong>Smart India Hackathon (SIH) 2026</strong>? Finding a 6-member squad, meeting mandatory female teammate rules, and getting your pitch approved by your College SPOC can be tough.</p>

      <p>That’s why we launched the official <strong>HackerMate SIH 2026 Internal Screening & AI Evaluator Hub</strong>!</p>

      <div class="feature-box">
        <div class="feature-item">
          🤖 <strong>Instant AI Pitch Evaluator:</strong> Upload your PPT deck link and get a 0–100 diagnostic scorecard assessing Innovation, Technical Architecture, UI/UX, and Feasibility in ~4.5 seconds.
        </div>
        <div class="feature-item">
          👥 <strong>Squad Compliance Audit:</strong> Automated verification for 6-member squad size and mandatory 1+ female teammate rules.
        </div>
        <div class="feature-item">
          📜 <strong>1-Click PDF Certificates:</strong> Earn official cryptographic DJSCE SIH nomination merit certificates upon SPOC approval.
        </div>
      </div>

      <a href="${ctaUrl}" class="btn">🚀 Test My SIH Pitch Deck Now →</a>

      <p style="margin-top: 24px; font-size: 12px; color: #64748B; text-align: center;">
        Don't wait until the internal college deadline — evaluate your pitch deck today and refine your presentation!
      </p>
    </div>

    <div class="footer">
      Sent by <strong>HackerMate</strong> — Full-Stack Hackathon & Squad OS for Colleges<br>
      D.J. Sanghvi College of Engineering (DJSCE) Partner Portal<br>
      You are receiving this because you registered at hackermate.in
    </div>
  </div>
</body>
</html>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
