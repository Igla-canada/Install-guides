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
