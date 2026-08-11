// MCP over Streamable HTTP, hand-rolled.
//
// The protocol surface a read-only tool server needs is small — initialize,
// tools/list, tools/call, ping — and the spec allows answering a POST with a
// plain JSON body instead of an SSE stream when the server has nothing to push.
// Writing those few methods directly keeps this working across Next.js versions
// rather than depending on an adapter that has to track them.
import { TOOLS, TOOLS_BY_NAME, SERVER_INSTRUCTIONS } from "./tools";

/** Protocol revisions this server can speak. */
const SUPPORTED_PROTOCOL = "2025-06-18";
const FALLBACK_PROTOCOL = "2024-11-05";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

const ok = (id: JsonRpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: JsonRpcId, code: number, message: string) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

function negotiateProtocol(requested: unknown): string {
  if (requested === SUPPORTED_PROTOCOL || requested === FALLBACK_PROTOCOL) {
    return requested;
  }
  return SUPPORTED_PROTOCOL;
}

async function handleOne(msg: JsonRpcRequest): Promise<object | null> {
  const id = msg.id ?? null;
  const method = msg.method ?? "";

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: negotiateProtocol(msg.params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "igla-guides", version: "1.0.0" },
        instructions: SERVER_INSTRUCTIONS,
      });

    // Notifications carry no id and must not be answered.
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = TOOLS_BY_NAME.get(name);
      if (!tool) return err(id, -32602, `Unknown tool: ${name}`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await tool.run(args);
        // Text content holding JSON is the widely-supported shape; structured
        // content rides alongside for clients that read it.
        return ok(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
          isError: false,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Tool failed";
        console.error(`[mcp] ${name} failed:`, e);
        // A tool-level failure is reported in the result, not as a protocol
        // error — the agent should see it and be able to try something else.
        return ok(id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    // Declared unsupported rather than left to time out.
    case "resources/list":
      return ok(id, { resources: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });

    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}

/**
 * Handle one MCP HTTP POST body. Accepts a single message or a batch; returns
 * null when everything in it was a notification (caller should answer 202).
 */
export async function handleMcpPost(body: unknown): Promise<object | object[] | null> {
  if (Array.isArray(body)) {
    const out: object[] = [];
    for (const msg of body) {
      const res = await handleOne(msg as JsonRpcRequest);
      if (res) out.push(res);
    }
    return out.length ? out : null;
  }
  return handleOne((body ?? {}) as JsonRpcRequest);
}
