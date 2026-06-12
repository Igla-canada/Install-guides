// Dev sanity probe: presigned PUT + GET round-trip against the configured
// object store (MinIO locally, S3 in prod).
import { signedUploadUrl, signedViewUrl } from "../src/lib/s3";

async function main() {
  const key = "test/probe.jpg";
  const put = await fetch(await signedUploadUrl(key, "image/jpeg"), {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: Buffer.from("probe"),
  });
  console.log("PUT status:", put.status);
  const get = await fetch(await signedViewUrl(key));
  console.log("GET status:", get.status, "body:", await get.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
