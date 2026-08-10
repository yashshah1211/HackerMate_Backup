import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body || !body.type || !body.data) {
      return NextResponse.json({ error: "Invalid webhook payload format" }, { status: 400 });
    }

    const fullType: string = body.type || "";
    // Normalize type (e.g., 'email.delivered' -> 'delivered')
    const eventType = fullType.replace(/^email\./, "").toLowerCase();

    const data = body.data || {};
    const emailId = data.email_id || data.id || "unknown";
    const recipients = Array.isArray(data.to) ? data.to.join(", ") : (data.to || "unknown");
    const subject = data.subject || null;

    // Log event into resend_webhook_events
    const { error: insertErr } = await supabaseAdmin.from("resend_webhook_events").insert({
      resend_email_id: emailId,
      event_type: eventType,
      recipient_email: recipients,
      subject: subject,
      payload: body,
      created_at: new Date().toISOString(),
    });

    if (insertErr) {
      console.warn("[Resend Webhook API] Failed to log event to DB:", insertErr);
    }

    return NextResponse.json({
      success: true,
      recordedEvent: eventType,
      resendEmailId: emailId,
    });
  } catch (err: any) {
    console.error("[Resend Webhook API Error]:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process Resend webhook event" },
      { status: 500 }
    );
  }
}
