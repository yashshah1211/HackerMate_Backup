import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getR2Client } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { validateMagicBytes } from "@/lib/mediaValidation";
import { moderateImageWithGemini } from "@/lib/geminiModeration";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  // Audio / Voice
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
]);

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: () => {},
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "chat";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(contentType.toLowerCase())) {
      return NextResponse.json({ error: `Unsupported file type: ${contentType}` }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Binary Magic-Byte Malware & Disguised Extension Verification
    const magicCheck = validateMagicBytes(buffer, contentType);
    if (!magicCheck.isValid) {
      return NextResponse.json(
        { error: "Security check failed: Corrupt or invalid file signature detected." },
        { status: 400 }
      );
    }

    // 2. AI Vision Safety & Content Moderation (NSFW / Adult / Violence / Hate filter)
    if (contentType.startsWith("image/")) {
      const moderation = await moderateImageWithGemini(buffer, contentType);
      if (!moderation.isSafe) {
        return NextResponse.json(
          { error: `Upload blocked: ${moderation.reason || "Image violates HackerMate community guidelines (adult or inappropriate content)."}` },
          { status: 400 }
        );
      }
    }

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

    const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "");
    const randomId = crypto.randomUUID().slice(0, 10);
    const key = `${sanitizedFolder}/${Date.now()}-${randomId}.${ext}`;

    const client = getR2Client();
    const bucketName = process.env.R2_BUCKET_NAME || "hackermate-media";
    const publicUrlBase = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

    if (!publicUrlBase) {
      throw new Error("Missing public storage URL configuration");
    }

    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    const publicUrl = `${publicUrlBase}/${key}`;

    return NextResponse.json({
      success: true,
      publicUrl,
      key,
    });
  } catch (error: unknown) {
    console.error("Direct upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload file" },
      { status: 500 }
    );
  }
}
