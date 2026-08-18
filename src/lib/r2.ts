import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID || "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing Cloudflare R2 environment variables (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).");
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
  const bucketName = process.env.R2_BUCKET_NAME || "hackermate-media";
  const publicUrlBase = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

  if (!publicUrlBase) {
    throw new Error("Missing R2_PUBLIC_URL environment variable.");
  }

  const client = getR2Client();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  const publicUrl = `${publicUrlBase}/${key}`;

  return { uploadUrl, publicUrl };
}
