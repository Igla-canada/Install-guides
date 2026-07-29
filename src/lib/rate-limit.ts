/**
 * Lightweight in-memory sliding-window rate limiter for PUBLIC endpoints.
 *
 * Purpose: stop bulk scraping of the public compatibility list. The bot
 * user-agent filter only catches honest crawlers — anyone sending a normal
 * browser UA walks straight through it, so the catalog needs a real throttle.
 *
 * Scope/limits (deliberate, documented trade-off):
 * - Counters live in process memory, so on serverless each instance keeps its
 *   own window. That still cuts a scrape by roughly the instance count rather
 *   than stopping it dead. A shared store (Redis/Vercel KV) is the upgrade if
 *   abuse continues — the call site does not change.
 * - Keyed by client IP; requests without a resolvable IP share one bucket.
 */

type Bucket = { hits: number[]; };

const buckets = new Map<string, Bucket>();

// Bound memory: drop buckets untouched for a while, and never let the map grow
// without limit if an attacker rotates IPs.
const MAX_KEYS = 10_000;
let lastSweep = 0;

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    const live = b.hits.filter((t) => now - t < windowMs);
    if (live.length === 0) buckets.delete(key);
    else b.hits = live;
  }
  if (buckets.size > MAX_KEYS) buckets.clear();
}

export type RateLimitResult = {
  ok: boolean;
  /** Requests remaining in the current window (0 when limited). */
  remaining: number;
  /** Seconds until the window frees up — for the Retry-After header. */
  retryAfter: number;
};

/**
 * Record a hit for `key` and report whether it is within `limit` per
 * `windowMs`. Call once per request, before doing any real work.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key) ?? { hits: [] };
  const hits = bucket.hits.filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    bucket.hits = hits;
    buckets.set(key, bucket);
    const oldest = hits[0] ?? now;
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  hits.push(now);
  bucket.hits = hits;
  buckets.set(key, bucket);
  return { ok: true, remaining: limit - hits.length, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
