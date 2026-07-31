import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";
import { sendSIHBroadcastBatch } from "@/lib/admin/sihBroadcast";

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireOutreachAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    let batchSize = 50;
    try {
      const body = await req.json();
      if (body.batchSize && typeof body.batchSize === "number") {
        batchSize = Math.max(1, Math.min(body.batchSize, 100));
      }
    } catch {
      // Body optional
    }

    const result = await sendSIHBroadcastBatch(batchSize);

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error: any) {
    console.error("SIH Broadcast Route Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
