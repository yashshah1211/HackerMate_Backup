import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email || !email.includes("@")) {
      return new NextResponse(
        `<html>
          <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #09090b; color: #fff;">
            <h2>Invalid Unsubscribe Request</h2>
            <p style="color: #a1a1aa;">No valid email address was provided.</p>
          </body>
        </html>`,
        { headers: { "Content-Type": "text/html" }, status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (supabaseUrl && serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

      // Update in tech_sponsor_leads
      await supabaseAdmin
        .from("tech_sponsor_leads")
        .update({ status: "opted_out", notes: "Unsubscribed via unsubscribe link" })
        .ilike("contact_email", `%${cleanEmail}%`);

      // Update in organizer_leads
      await supabaseAdmin
        .from("organizer_leads")
        .update({ status: "archived", notes: "Unsubscribed via unsubscribe link" })
        .ilike("organizer_email", `%${cleanEmail}%`);
    }

    return new NextResponse(
      `<html>
        <head>
          <title>Unsubscribed — HackerMate</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 60px 20px; background: #09090b; color: #fff; line-height: 1.6;">
          <div style="max-width: 480px; margin: 0 auto; background: #18181b; border: 1px solid #27272a; padding: 40px; rounded-radius: 16px; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);">
            <div style="font-size: 40px; margin-bottom: 16px;">✉️</div>
            <h2 style="font-size: 22px; font-weight: 700; margin-bottom: 12px; color: #f4f4f5;">You Have Been Unsubscribed</h2>
            <p style="color: #a1a1aa; font-size: 14px; margin-bottom: 24px;">
              <strong>${cleanEmail}</strong> has been removed from all HackerMate partnership & sponsorship outreach sequences.
            </p>
            <p style="color: #71717a; font-size: 12px;">
              If this was done in error or you ever wish to re-connect, feel free to visit <a href="https://hackermate.in" style="color: #38bdf8; text-decoration: none;">hackermate.in</a>.
            </p>
          </div>
        </body>
      </html>`,
      { headers: { "Content-Type": "text/html" }, status: 200 }
    );
  } catch (err: any) {
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #09090b; color: #fff;">
          <h2>Unsubscribe Processing Error</h2>
          <p style="color: #a1a1aa;">An error occurred while processing your request.</p>
        </body>
      </html>`,
      { headers: { "Content-Type": "text/html" }, status: 500 }
    );
  }
}
