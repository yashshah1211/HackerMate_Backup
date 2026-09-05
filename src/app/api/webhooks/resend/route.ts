export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Webhook } from "svix";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[Resend Webhook] RESEND_WEBHOOK_SECRET is not configured on the server.");
      return NextResponse.json(
        { error: "Server misconfiguration: RESEND_WEBHOOK_SECRET is required." },
        { status: 500 }
      );
    }

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn("[Resend Webhook] Missing Svix webhook headers.");
      return NextResponse.json({ error: "Missing webhook signature headers" }, { status: 401 });
    }

    const rawBody = await req.text();
    const wh = new Webhook(webhookSecret);
    let body: any;

    try {
      body = wh.verify(rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch (verifyErr: any) {
      console.warn("[Resend Webhook] Svix signature verification failed:", verifyErr.message);
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

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
