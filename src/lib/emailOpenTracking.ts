import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signingKey(): Buffer | null {
  const secret = process.env.EMAIL_OPEN_TRACKING_SECRET;
  return secret && /^[0-9a-f]{64}$/i.test(secret) ? Buffer.from(secret, "hex") : null;
}

function sign(key: Buffer, leadId: string): Buffer {
  return createHmac("sha256", key).update(`hackermate:email-open:v1:${leadId.toLowerCase()}`).digest();
}

/** Returns only an authenticated, canonical lead ID; never touches the database. */
export function verifiedOrganizerTrackingId(params: URLSearchParams): string | null {
  const leadId = params.get("id");
  const signature = params.get("sig");
  if (params.getAll("id").length !== 1 || params.getAll("sig").length !== 1
    || !leadId || !UUID.test(leadId) || !signature || !/^[0-9a-f]{64}$/.test(signature)) return null;
  const key = signingKey();
  if (!key) return null;
  return timingSafeEqual(Buffer.from(signature, "hex"), sign(key, leadId)) ? leadId.toLowerCase() : null;
}

/** Missing configuration disables tracking, without changing email dispatch semantics. */
export function organizerTrackingPixel(siteUrl: string, leadId: string): string {
  const key = signingKey();
  if (!key || !UUID.test(leadId)) {
    console.warn("[Email Open Tracking] Pixel omitted: signing configuration or lead ID unavailable.");
    return "";
  }
  const url = `${siteUrl}/api/webhooks/email-open?id=${leadId.toLowerCase()}&sig=${sign(key, leadId).toString("hex")}`;
  const htmlUrl = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<img src="${htmlUrl}" width="1" height="1" style="display:none; width:1px; height:1px; opacity:0;" alt="" />`;
}
