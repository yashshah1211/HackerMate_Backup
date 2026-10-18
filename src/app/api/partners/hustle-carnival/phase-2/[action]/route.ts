import type { NextRequest } from "next/server";
import { handleApi } from "@/lib/hustle-phase2/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string }> };
export async function GET(req: NextRequest, context: Context) { return handleApi(req, (await context.params).action); }
export async function POST(req: NextRequest, context: Context) { return handleApi(req, (await context.params).action); }
