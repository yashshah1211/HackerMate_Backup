import { deleteAccount, WriterBudget, WriterError } from "@/lib/writers";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOUNDER_EMAIL = "yashshah7117@gmail.com";

export async function POST(req: NextRequest) {
  const budget = new WriterBudget(undefined, req.signal);
  try {
    const authorization = await budget.run(() => requireAdmin(req));
    if (authorization instanceof NextResponse) return authorization;
    const { user, supabaseAdmin, supabaseUserClient } = authorization;

    let body: unknown;
    try {
      body = await budget.run(() => req.json());
    } catch (error) {
      if (error instanceof WriterError) throw error;
      return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
    }
    const userId = body && typeof body === "object" && "userId" in body ? body.userId : undefined;
    if (typeof userId !== "string" || !UUID.test(userId)) {
      return NextResponse.json({ success: false, error: "A valid user ID is required." }, { status: 400 });
    }
    const targetId = userId.toLowerCase();
    if (targetId === user.id.toLowerCase()) {
      return NextResponse.json({ success: false, error: "You cannot delete your own account from the admin panel." }, { status: 403 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[admin/delete-user] Service-role configuration missing.");
      return NextResponse.json({ success: false, error: "Account deletion is temporarily unavailable." }, { status: 503 });
    }

    const { data: targetAuth, error: targetAuthError } = await budget.run(() => supabaseAdmin.auth.admin.getUserById(targetId));
    if (targetAuthError) {
      console.error("[admin/delete-user] Target Auth lookup failed:", { targetId, error: targetAuthError });
      return NextResponse.json({ success: false, error: targetAuthError.status === 404 ? "User not found." : "Unable to verify the target account." }, { status: targetAuthError.status === 404 ? 404 : 500 });
    }
    if (!targetAuth.user) {
      return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
    }
    const { data: targetProfile, error: targetProfileError } = await budget.query(() => supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", targetId)
      .maybeSingle());
    if (targetProfileError) {
      console.error("[admin/delete-user] Target profile lookup failed:", { targetId, error: targetProfileError });
      return NextResponse.json({ success: false, error: "Unable to verify the target account." }, { status: 500 });
    }
    if (!targetProfile) {
      return NextResponse.json({ success: false, error: "User profile not found." }, { status: 404 });
    }
    if (targetProfile.role === "admin" || targetAuth.user.email?.trim().toLowerCase() === FOUNDER_EMAIL) {
      return NextResponse.json({ success: false, error: "Protected administrator accounts cannot be deleted here." }, { status: 403 });
    }

    // Reuse the authenticated-only canonical RPC. Ownership, notifications,
    // Auth rows and FK cascades are one PostgreSQL transaction, not a sequence
    // of independently committed REST mutations or an Auth API delete.
    await deleteAccount(supabaseUserClient, targetId, user.id, budget, req.headers.get("Authorization")?.replace(/^Bearer /, ""));
    console.info("[admin/delete-user] Account deleted:", { actorId: user.id, targetId });
    return NextResponse.json({ success: true, message: "User account successfully deleted." });
  } catch (error: unknown) {
    console.error("[admin/delete-user] Request failed:", error);
    if (error instanceof WriterError) return NextResponse.json({ success: false, error: error.message, retryable: error.retryable, outcomeUnknown: error.outcomeUnknown }, { status: error.status });
    // A lost RPC response can follow a committed transaction. Never retry it
    // automatically or tell the operator that rollback is certain.
    return NextResponse.json({ success: false, error: "Unable to confirm deletion. Refresh the user list before retrying." }, { status: 500 });
  }
}
