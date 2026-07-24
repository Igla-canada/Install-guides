/**
 * Reset a staff/installer account password (local dev helper).
 * Usage:
 *   npx tsx scripts/reset-password.ts <email> <new-password>
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  const password = process.argv[3];
  if (!email || !password) {
    console.error("Usage: npx tsx scripts/reset-password.ts <email> <new-password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const user = await prisma.userAccount.findUnique({ where: { email } });
  if (!user) {
    console.error(`No account found for ${email}`);
    process.exit(1);
  }

  await prisma.userAccount.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`Password updated for ${email} (${user.role}, ${user.status}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
