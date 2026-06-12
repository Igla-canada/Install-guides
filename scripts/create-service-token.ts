// Creates a service token for the Igla portal/app to call /api/guild/resolve.
// Usage: npm run token:service -- "Igla portal prod"
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const name = process.argv[2] ?? "Igla portal";
  const token = "igla_svc_" + randomBytes(32).toString("base64url");
  await prisma.serviceToken.create({
    data: {
      name,
      tokenHash: createHash("sha256").update(token).digest("hex"),
    },
  });
  console.log(`Service token created for "${name}".`);
  console.log(`Token (shown ONCE — store it in the Igla app config):`);
  console.log(token);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
