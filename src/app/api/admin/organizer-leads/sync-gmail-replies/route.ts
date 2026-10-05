import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";
import { executeGmailInboxSync } from "@/lib/admin/gmailInboxSync";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireOutreachAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;
    const result = await executeGmailInboxSync(supabaseAdmin);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Sync Gmail Replies API] Exception:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
