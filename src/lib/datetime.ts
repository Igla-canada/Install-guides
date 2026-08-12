// Timestamps render on the server (Vercel runs in UTC), so a bare
// toLocaleString() shows UTC. Igla Canada works in Eastern time, so format
// everything in America/Toronto (handles EST/EDT automatically) and tag it ET.
const TZ = "America/Toronto";

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  month: "numeric",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

/** "6/23/2026, 6:01:07 PM ET" — Eastern, regardless of server timezone. */
export function fmtDateTime(d: Date | string | number): string {
  return `${dateTimeFmt.format(new Date(d))} ET`;
}

/** Minutes that `timeZone` is offset from UTC at this instant (EDT = -240). */
function tzOffsetMinutes(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  // Rounded to the minute on purpose: formatToParts resolves only to seconds,
  // so an instant carrying milliseconds would otherwise smear them into the
  // offset and push a day boundary a fraction into the next day.
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * Turn a "YYYY-MM-DD" from a date input into the UTC instant that day starts
 * (or ends) in Eastern time.
 *
 * The list renders every timestamp in Eastern, so a filter that snapped to UTC
 * midnight would quietly cut the day at 8pm the evening before and drop rows
 * the user can see on screen. Returns null for anything unparseable.
 */
export function easternDayBoundary(day: string, edge: "start" | "end"): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.trim())) return null;
  const naive = new Date(
    `${day.trim()}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`,
  );
  if (Number.isNaN(naive.getTime())) return null;
  return new Date(naive.getTime() - tzOffsetMinutes(naive, TZ) * 60000);
}
