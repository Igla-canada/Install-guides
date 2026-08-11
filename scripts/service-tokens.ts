/**
 * Manage the service tokens that open /api/mcp, /api/guild/resolve and
 * /api/compatibility.
 *
 *   npm run token:list
 *   npm run token:revoke -- "ChatGPT support agent"     # or an id prefix
 *   npm run token:rotate -- "ChatGPT support agent"     # revoke + reissue
 *   npm run token:revoke -- --all --yes                 # panic: kill everything
 *
 * Revocation is INSTANT — every request re-checks the database, so a revoked
 * token stops working on the next call with no deploy and no restart.
 *
 * The one exception is IGLA_SERVICE_TOKEN in the environment: it is compared
 * before the database is consulted, so it cannot be revoked from here. Changing
 * it means editing the env var and redeploying. That is exactly why the tokens
 * you hand out should be minted here instead.
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const command = args[0] ?? "list";
const flags = new Set(args.filter((a) => a.startsWith("--")));
const target = args.slice(1).find((a) => !a.startsWith("--"));

function mintToken(): string {
  return "igla_svc_" + randomBytes(32).toString("base64url");
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function findOne(needle: string) {
  const all = await prisma.serviceToken.findMany({ orderBy: { createdAt: "asc" } });
  const exact = all.filter((t) => t.name === needle || t.id === needle);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new Error(
      `"${needle}" matches ${exact.length} tokens. Use the id instead:\n` +
        exact.map((t) => `  ${t.id}  ${t.name}`).join("\n"),
    );
  }
  const fuzzy = all.filter(
    (t) => t.id.startsWith(needle) || t.name.toLowerCase().includes(needle.toLowerCase()),
  );
  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length === 0) throw new Error(`No service token matches "${needle}".`);
  throw new Error(
    `"${needle}" is ambiguous:\n` + fuzzy.map((t) => `  ${t.id}  ${t.name}`).join("\n"),
  );
}

async function list() {
  const tokens = await prisma.serviceToken.findMany({ orderBy: { createdAt: "asc" } });
  if (!tokens.length) {
    console.log("No service tokens in the database.");
  } else {
    console.log(`${tokens.length} service token(s):\n`);
    for (const t of tokens) {
      const state = t.revokedAt
        ? `REVOKED ${t.revokedAt.toISOString().slice(0, 16).replace("T", " ")}`
        : "active";
      console.log(
        `  ${t.id}  ${state.padEnd(30)} created ${t.createdAt
          .toISOString()
          .slice(0, 10)}  ${t.name}`,
      );
    }
  }
  if (process.env.IGLA_SERVICE_TOKEN) {
    console.log(
      "\n  ! IGLA_SERVICE_TOKEN is also set in the environment. It always works and" +
        "\n    CANNOT be revoked from here — change the env var and redeploy instead.",
    );
  }
  console.log("\nThe token value itself is never stored, only its hash — it cannot be re-read.");
}

async function revoke() {
  if (flags.has("--all")) {
    const active = await prisma.serviceToken.findMany({ where: { revokedAt: null } });
    if (!active.length) return console.log("Nothing to revoke — no active tokens.");
    if (!flags.has("--yes")) {
      console.log(`This would revoke ALL ${active.length} active token(s):\n`);
      for (const t of active) console.log(`  ${t.name}`);
      console.log(
        "\nThat breaks the Igla portal integration too, not just the AI connectors." +
          "\nRe-run with --yes if that is what you want.",
      );
      return;
    }
    const { count } = await prisma.serviceToken.updateMany({
      where: { revokedAt: null },
      data: { revokedAt: new Date() },
    });
    console.log(`Revoked ${count} token(s). Effective immediately.`);
    if (process.env.IGLA_SERVICE_TOKEN) {
      console.log(
        "! IGLA_SERVICE_TOKEN is still valid — it lives in the environment, not the DB.",
      );
    }
    return;
  }

  if (!target) {
    console.log('Usage: npm run token:revoke -- "<name or id>"   |   -- --all --yes');
    return;
  }
  const t = await findOne(target);
  if (t.revokedAt) {
    console.log(`"${t.name}" was already revoked at ${t.revokedAt.toISOString()}.`);
    return;
  }
  await prisma.serviceToken.update({
    where: { id: t.id },
    data: { revokedAt: new Date() },
  });
  console.log(`Revoked "${t.name}" (${t.id}). Effective immediately — no deploy needed.`);
}

async function rotate() {
  if (!target) {
    console.log('Usage: npm run token:rotate -- "<name or id>"');
    return;
  }
  const old = await findOne(target);
  const token = mintToken();
  await prisma.$transaction([
    prisma.serviceToken.update({
      where: { id: old.id },
      data: { revokedAt: old.revokedAt ?? new Date() },
    }),
    prisma.serviceToken.create({ data: { name: old.name, tokenHash: hash(token) } }),
  ]);
  console.log(`Rotated "${old.name}".`);
  console.log(`  old token: revoked, dead now`);
  console.log(`  new token (shown ONCE):\n`);
  console.log(`    ${token}\n`);
  console.log("Update every place that used the old one — it stopped working already.");
}

async function create() {
  const name = target ?? "Unnamed";
  const token = mintToken();
  await prisma.serviceToken.create({ data: { name, tokenHash: hash(token) } });
  console.log(`Created "${name}". Token (shown ONCE):\n`);
  console.log(`  ${token}\n`);
}

async function main() {
  switch (command) {
    case "list":
      return list();
    case "revoke":
      return revoke();
    case "rotate":
      return rotate();
    case "create":
      return create();
    default:
      console.log(
        "Commands: list | create <name> | revoke <name|id> [--all --yes] | rotate <name|id>",
      );
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
