import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { accountId, CONFIG_COLUMNS, configurationRows, configPatch, configWrite, dbFailure, existingEvent,
  failure, managedConfig, PartnerAdminError, query, readBody, reply, privateDenial, revision } from "@/lib/admin/partnerManagement";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return privateDenial(auth);
    query(req, []);
    const configs = await configurationRows(auth.supabaseAdmin, "partner_configs");
    const events = await configurationRows(auth.supabaseAdmin, "hackathons");
    return reply({ partners: configs.map(managedConfig), events: events.sort((a, b) => String(a.name).localeCompare(String(b.name))) });
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return privateDenial(auth);
    query(req, []);
    const body = await readBody(req, ["config"]);
    const patch = configPatch(body.config, true);
    await existingEvent(auth.supabaseAdmin, patch.hackathon_id!);
    const result = await auth.supabaseAdmin.from("partner_configs").insert(configWrite(patch, null)).select(CONFIG_COLUMNS).single();
    if (result.error?.code === "23505") throw new PartnerAdminError(409, "That public slug is already in use.");
    if (result.error || !result.data) dbFailure(result.error, "Unable to create partner configuration.");
    return reply({ partner: managedConfig(result.data) }, 201);
  } catch (error) { return failure(error); }
}
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return privateDenial(auth);
    query(req, []);
    const body = await readBody(req, ["partnerId", "expectedRevision", "config"]);
    const partnerId = accountId(body.partnerId, "Partner");
    if (typeof body.expectedRevision !== "string" || !/^[0-9a-f]{64}$/.test(body.expectedRevision)) throw new PartnerAdminError(400, "A configuration revision is required.");
    const patch = configPatch(body.config);
    const current = await auth.supabaseAdmin.from("partner_configs").select(CONFIG_COLUMNS).eq("id", partnerId).maybeSingle();
    if (current.error) dbFailure(current.error, "Unable to verify partner configuration.");
    if (!current.data) throw new PartnerAdminError(404, "Partner configuration not found.");
    const snapshot: Record<string, unknown> = current.data;
    if (revision(current.data) !== body.expectedRevision) throw new PartnerAdminError(409, "Configuration changed. Reload before saving.");
    await existingEvent(auth.supabaseAdmin, patch.hackathon_id || current.data.hackathon_id);
    let update = auth.supabaseAdmin.from("partner_configs").update(configWrite(patch, current.data)).eq("id", partnerId);
    // Compare the entire read snapshot, including JSON, to prevent a lost merge
    // even when a legacy writer does not advance updated_at.
    for (const key of CONFIG_COLUMNS.split(", ").filter(key => key !== "id")) {
      const value = snapshot[key];
      update = value == null ? update.is(key, null) : update.eq(key, key === "features" ? JSON.stringify(value) : value);
    }
    const result = await update.select(CONFIG_COLUMNS).maybeSingle();
    if (result.error?.code === "23505") throw new PartnerAdminError(409, "That public slug is already in use.");
    if (result.error) dbFailure(result.error, "Unable to save partner configuration.");
    if (!result.data) throw new PartnerAdminError(409, "Configuration changed. Reload before saving.");
    return reply({ partner: managedConfig(result.data) });
  } catch (error) { return failure(error); }
}
