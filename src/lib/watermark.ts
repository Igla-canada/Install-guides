// Per-view watermark text (AGENTS.md #3). Shared by every installer-facing
// watermark — the page overlay, the image lightbox, and the internal print
// export — so the format and time zone stay identical everywhere.
//
// Time is shown in Eastern (America/Toronto) with its real abbreviation
// (EST in winter, EDT in summer) rather than UTC, to match the operator's
// locale. Intl is available on both server and client, so this is safe to
// import from either.

/** "2026-06-17 19:41 EDT" — Eastern local time with the correct abbreviation. */
export function formatEastern(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const tz = get("timeZoneName") || "ET";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} ${tz}`;
}

/** Full stamp: "<who> · <eastern time> · <grant/user id>". */
export function watermarkStamp(label: string, reference: string, date: Date = new Date()): string {
  return `${label} · ${formatEastern(date)} · ${reference}`;
}
