// POST /api/mcp/<service-token> — the same MCP server, with the token in the
// URL instead of an Authorization header.
//
// This exists for ChatGPT: its connector UI offers only "no authentication" or
// a full OAuth flow, so a Bearer header is not an option there. The URL itself
// is the credential — treat it like a password: it is stored in whoever's
// ChatGPT settings you paste it into, and it appears in this app's request logs.
// Mint a token for each place you connect (`npm run token:service`) so any one
// of them can be revoked on its own.
import { NextRequest } from "next/server";
import { isValidServiceToken } from "@/lib/service-auth";
import { mcpGet, mcpOptions, mcpRespond, mcpUnauthorized } from "@/lib/mcp/respond";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!(await isValidServiceToken(decodeURIComponent(token)))) return mcpUnauthorized();
  return mcpRespond(req);
}

export async function GET() {
  return mcpGet();
}

export async function OPTIONS() {
  return mcpOptions();
}
