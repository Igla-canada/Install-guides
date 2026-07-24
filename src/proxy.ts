import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isBlockedBotUserAgent } from "@/lib/bot-ua";

/**
 * Network gate before routes run:
 * - Drop NVIDIA / stray /socket.io probes instantly (they were wedging localhost)
 * - Refuse known crawler / scraper user-agents
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

  if (!hasServiceBearer && isBlockedBotUserAgent(req.headers.get("user-agent"))) {
    return new NextResponse("Forbidden", {
      status: 403,
      headers: {
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
        "Cache-Control": "no-store",
      },
    });
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
