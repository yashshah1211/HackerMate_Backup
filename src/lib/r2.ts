import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID || "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "hackermate-media";
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

export function getR2Client(): S3Client {
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing Cloudflare R2 environment variables.");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export async function createPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 900
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const client = getR2Client();

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  const publicUrl = `${R2_PUBLIC_URL}/${key}`;

  return { uploadUrl, publicUrl };
}
