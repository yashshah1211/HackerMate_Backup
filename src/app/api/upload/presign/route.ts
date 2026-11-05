import { NextRequest, NextResponse } from "next/server";
import { requireVerifiedProfile } from "@/lib/admin/requireAdmin";
import { createPresignedUploadUrl } from "@/lib/r2";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  // Audio / Voice Notes
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
]);

export async function POST(req: NextRequest) {
  try {
    const authorization = await requireVerifiedProfile(req, { unauthenticatedStatus: 401, lookupFailureStatus: 500 });
    if (authorization instanceof NextResponse) return authorization;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
    }
    const { contentType, folder = "chat" } = body as { contentType?: unknown; folder?: unknown };

    if (typeof contentType !== "string" || !ALLOWED_TYPES.has(contentType.toLowerCase())) {
      return NextResponse.json(
        { error: "Unsupported media content type" },
        { status: 400 }
      );
    }

    // Determine extension
    let ext = "bin";
    if (contentType.includes("webp")) ext = "webp";
    else if (contentType.includes("png")) ext = "png";
    else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
    else if (contentType.includes("gif")) ext = "gif";
    else if (contentType.includes("webm")) ext = "webm";
    else if (contentType.includes("mp4") || contentType.includes("m4a")) ext = "mp4";
    else if (contentType.includes("ogg")) ext = "ogg";
    else if (contentType.includes("mpeg") || contentType.includes("mp3")) ext = "mp3";
    else if (contentType.includes("wav")) ext = "wav";

    const rawFolder = typeof folder === "string" ? folder : "chat";
    const sanitizedFolder = rawFolder.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "chat";
    const randomId = crypto.randomUUID().slice(0, 10);
    const key = `${sanitizedFolder}/${Date.now()}-${randomId}.${ext}`;

    const { uploadUrl, publicUrl } = await createPresignedUploadUrl(key, contentType, 900);

    return NextResponse.json({
      uploadUrl,
      publicUrl,
      key,
    });
  } catch (error: unknown) {
    console.error("Presign URL generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate presigned upload URL" },
      { status: 500 }
    );
  }
}
