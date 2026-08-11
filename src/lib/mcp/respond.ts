// Shared request handling for both MCP entry points (/api/mcp with a Bearer
// header, /api/mcp/[token] with the token in the path).
import { NextRequest, NextResponse } from "next/server";
import { handleMcpPost } from "./handler";
import { logEvent } from "@/lib/audit";

/**
 * Permissive CORS. The endpoint is token-gated and read-only, and browser-based
 * MCP clients (the Inspector, in-page agents) need it to connect at all.
 */
export const MCP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

/**
 * Master switch. Set MCP_DISABLED=1 in the environment to take the whole
 * endpoint dark without touching tokens — the blunt instrument for when you
 * don't yet know which token leaked.
 *
 * Slower than revoking a token (Vercel needs a redeploy for an env change to
 * take effect), so reach for `npm run token:revoke` first: that is instant.
 */
export function mcpDisabled(): NextResponse | null {
  const off = process.env.MCP_DISABLED?.trim().toLowerCase();
  if (off !== "1" && off !== "true") return null;
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "This MCP server is currently disabled." },
    },
    { status: 503, headers: MCP_CORS },
  );
}

export function mcpUnauthorized(): NextResponse {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
    { status: 401, headers: { ...MCP_CORS, "WWW-Authenticate": "Bearer" } },
  );
}

export function mcpOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: MCP_CORS });
}

/**
 * GET is where the spec puts the server→client SSE stream. This server never
 * pushes anything, so it says so rather than holding a connection open.
 */
export function mcpGet(): NextResponse {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "This server is stateless; POST JSON-RPC instead." },
    },
    { status: 405, headers: { ...MCP_CORS, Allow: "POST, OPTIONS" } },
  );
}

export async function mcpRespond(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: MCP_CORS },
    );
  }

  void auditToolCall(req, body);

  const result = await handleMcpPost(body);
  // Everything in the batch was a notification — nothing to answer.
  if (result === null) return new NextResponse(null, { status: 202, headers: MCP_CORS });
  return NextResponse.json(result, { headers: MCP_CORS });
}

/**
 * AGENTS.md #5: guide content served anywhere gets audited. Every tool call is
 * recorded — not just reads of a specific guide — because an agent walking the
 * whole corpus is exactly the pattern the alert rules exist to notice.
 */
async function auditToolCall(req: NextRequest, body: unknown) {
  const messages = Array.isArray(body) ? body : [body];
  for (const raw of messages) {
    const msg = raw as { method?: string; params?: Record<string, unknown> };
    if (msg?.method !== "tools/call") continue;
    const name = String(msg.params?.name ?? "");
    const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
    const guideId =
      typeof args.guideId === "string"
        ? args.guideId
        : typeof args.id === "string"
          ? args.id
          : null;
    try {
      await logEvent({
        // Service-token traffic: no user and no grant behind it.
        actor: null,
        action: "mcp_tool_call",
        // Search-hit ids aren't guide ids; only record one we know is a guide.
        guildId: guideId && (await isGuildId(guideId)) ? guideId : null,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
        meta: {
          tool: name,
          query: typeof args.query === "string" ? args.query.slice(0, 300) : null,
          make: args.make ?? null,
          model: args.model ?? null,
          year: args.year ?? null,
          requestedId: guideId,
        },
      });
    } catch (e) {
      // Never let auditing break a lookup.
      console.error("[mcp] audit failed", e);
    }
  }
}

async function isGuildId(id: string): Promise<boolean> {
  const { prisma } = await import("@/lib/db");
  const row = await prisma.guild.findUnique({ where: { id }, select: { id: true } });
  return Boolean(row);
}
