import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
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

    const body = await req.json();
    const { contentType, folder = "chat", filename } = body;

    if (!contentType || !ALLOWED_TYPES.has(contentType.toLowerCase())) {
      return NextResponse.json(
        { error: `Unsupported media content type: ${contentType}` },
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

    const sanitizedFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "");
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
