import type { NextRequest } from "next/server";
import { handlePage } from "@/lib/hustle-phase2/pages";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return handlePage(req, (await context.params).path);
}
