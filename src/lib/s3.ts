// S3 access. Locally this points at MinIO (docker-compose); in production set
// the env vars to real Amazon S3 (ca-central-1). All installer-facing image
// URLs are SHORT-LIVED signed URLs — never public, never long-lived, so a
// copied URL dies with the viewing session.
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT || undefined;

export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "ca-central-1",
  endpoint,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

export const BUCKET = process.env.S3_BUCKET ?? "igla-guilds";

let bucketEnsured = false;
/**
 * Dev convenience: create the bucket on first use (MinIO starts empty).
 * Best-effort — on Supabase Storage (S3-compatible endpoint) buckets are
 * created in the dashboard and CreateBucket may be denied; signing still works.
 */
export async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    } catch {
      // Bucket may exist without Head/Create permission — proceed.
    }
  }
  bucketEnsured = true;
}

/** Signed PUT for direct browser upload. 10 min — uploads can be slow on garage connections. */
export async function signedUploadUrl(key: string, mime: string) {
  await ensureBucket();
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: mime }),
    { expiresIn: 600 }
  );
}

/** Signed GET for serving images. Short-lived by design (anti-hotlink). */
export async function signedViewUrl(key: string, expiresIn = 300) {
  await ensureBucket();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn,
  });
}
