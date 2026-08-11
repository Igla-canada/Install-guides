import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isBlockedBotUserAgent } from "@/lib/bot-ua";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** Public, unauthenticated pages that anyone can scrape — throttle per IP. */
const PUBLIC_THROTTLED = ["/dealer/"];
const PUBLIC_LIMIT = 30; // requests…
const PUBLIC_WINDOW_MS = 60_000; // …per minute per IP

/**
 * Network gate before routes run:
 * - Drop NVIDIA / stray /socket.io probes instantly (they were wedging localhost)
 * - Refuse known crawler / scraper user-agents
 * - Rate-limit the public (unauthenticated) pages so the compatibility list
 *   can't be bulk-harvested — the UA filter alone is trivially bypassed
 * - Attach X-Robots-Tag so nothing is indexed
 * - Service APIs with Bearer tokens still work
 */
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // GeForce Experience / other local tools poll /socket.io on :3000 and can
  // starve the Next.js server. Answer without running the app.
  if (
    path.startsWith("/socket.io") ||
    path.startsWith("/sockjs-node") ||
    path === "/.well-known/appspecific/com.chrome.devtools.json"
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const auth = req.headers.get("authorization");
  const hasServiceBearer = Boolean(auth?.toLowerCase().startsWith("bearer "));

  // The MCP endpoint gates itself on a service token, and its whole purpose is
  // to be called by an AI agent. ChatGPT's connector cannot send an
  // Authorization header (it carries the token in the path instead) and
  // identifies as "chatgpt-user" — which the crawler filter below blocks. Let
  // the route decide: no token, no answer.
  const isMcp = path === "/api/mcp" || path.startsWith("/api/mcp/");

  if (!isMcp && !hasServiceBearer && isBlockedBotUserAgent(req.headers.get("user-agent"))) {
    return new NextResponse("Forbidden", {
      status: 403,
      headers: {
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
        "Cache-Control": "no-store",
      },
    });
  }

  // Throttle the public pages. Service-token callers are exempt (the portal
  // integration is trusted and has its own auth).
  if (!hasServiceBearer && PUBLIC_THROTTLED.some((p) => path.startsWith(p))) {
    const { ok, retryAfter } = rateLimit(
      `pub:${clientIp(req.headers)}`,
      PUBLIC_LIMIT,
      PUBLIC_WINDOW_MS,
    );
    if (!ok) {
      return new NextResponse("Too many requests", {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-Robots-Tag": "noindex, nofollow",
          "Cache-Control": "no-store",
        },
      });
    }
  }

  const res = NextResponse.next();
  res.headers.set(
    "X-Robots-Tag",
    "noindex, nofollow, noarchive, nosnippet, noimageindex",
  );
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export const config = {
  matcher: [
    /*
     * Run on app routes (incl. /socket.io so we can 404 it cheaply).
     * Skip Next internals and static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
