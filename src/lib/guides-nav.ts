/** Keep staff guide flows on the list/drill they started from via `?from=`. */

export function safeGuidesFrom(from: string | undefined | null): string | null {
  if (!from || !from.startsWith("/guides")) return null;
  // Path only — no open redirects.
  if (from.includes("://") || from.startsWith("//")) return null;
  return from;
}

/** Append a safe `from` query param to a guides URL. */
export function withFromParam(
  href: string,
  from: string | null | undefined,
): string {
  const safe = safeGuidesFrom(from);
  if (!safe) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}from=${encodeURIComponent(safe)}`;
}

/** Prefer the preserved list URL; otherwise the fallback (e.g. make/model drill). */
export function guidesBackHref(
  from: string | null | undefined,
  fallback: string,
): string {
  return safeGuidesFrom(from) ?? fallback;
}
