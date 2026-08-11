// POST /api/mcp — MCP (Model Context Protocol) endpoint over Streamable HTTP.
//
// Read-only access to PUBLISHED installation guides and unit compatibility, for
// support agents. Authenticated with the same Bearer service token as
// /api/guild/resolve and /api/compatibility (`npm run token:service`).
//
// Use this URL from anything that can send an Authorization header — OpenAI's
// Responses API (`tools: [{type:"mcp", server_url, headers}]`), Claude Code /
// Desktop, the MCP Inspector, curl.
//
// ChatGPT's own connector UI can't send custom headers; it uses the sibling
// route /api/mcp/[token] instead.
import { NextRequest } from "next/server";
import { checkServiceToken } from "@/lib/service-auth";
import {
  mcpDisabled,
  mcpGet,
  mcpOptions,
  mcpRespond,
  mcpUnauthorized,
} from "@/lib/mcp/respond";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Checked before auth: a kill switch that first asks for valid credentials
  // is not a kill switch.
  const off = mcpDisabled();
  if (off) return off;
  if (!(await checkServiceToken(req))) return mcpUnauthorized();
  return mcpRespond(req);
}

export async function GET() {
  return mcpGet();
}

export async function OPTIONS() {
  return mcpOptions();
}
