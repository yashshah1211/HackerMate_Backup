export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { supabaseAdmin } = authResult;

    const body = await req.json();
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status !== undefined) updateData.status = body.status;
    if (body.title !== undefined) updateData.title = body.title;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.summary !== undefined) updateData.summary = body.summary;
    if (body.problem_statement !== undefined) updateData.problem_statement = body.problem_statement;
    if (body.problem_pdf_url !== undefined) updateData.problem_pdf_url = body.problem_pdf_url;
    if (body.additional_rules !== undefined) updateData.additional_rules = body.additional_rules;
    if (body.track !== undefined) updateData.track = body.track;
    if (body.difficulty !== undefined) updateData.difficulty = body.difficulty;
    if (body.starts_at !== undefined) updateData.starts_at = body.starts_at;
    if (body.ends_at !== undefined) updateData.ends_at = body.ends_at;

    let updated: any = null;
    const { data: res1, error: err1 } = await supabaseAdmin
      .from("weekly_challenges")
      .update(updateData)
      .eq("id", id)
      .select("id, challenge_number, title, slug, track, difficulty, summary, status, starts_at, ends_at, updated_at")
      .single();

    if (err1) {
      console.warn("[Admin Challenges PATCH] Retrying update without optional columns:", err1.message);
      const fallbackUpdate = { ...updateData };
      delete fallbackUpdate.problem_pdf_url;
      delete fallbackUpdate.additional_rules;

      const { data: res2, error: err2 } = await supabaseAdmin
        .from("weekly_challenges")
        .update(fallbackUpdate)
        .eq("id", id)
        .select("id, challenge_number, title, slug, track, difficulty, summary, status, starts_at, ends_at, updated_at")
        .single();

      if (err2) {
        console.error("[Admin Challenges PATCH] Error:", err2);
        return NextResponse.json({ error: err2.message }, { status: 500 });
      }
      updated = res2;
    } else {
      updated = res1;
    }

    return NextResponse.json({ success: true, challenge: updated });
  } catch (err: any) {
    console.error("[Admin Challenges PATCH] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { supabaseAdmin } = authResult;

    const { error } = await supabaseAdmin
      .from("weekly_challenges")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[Admin Challenges DELETE] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[Admin Challenges DELETE] Exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error." }, { status: 500 });
  }
}
