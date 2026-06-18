// Serve-time per-view watermark (AGENTS.md #3). Rendered server-side into the
// page with the viewer's identity + Eastern timestamp + grant/user id. Never
// cache or share a rendered installer view — the stamp is what makes a leaked
// screen photo traceable to a person and a moment.
import { watermarkStamp } from "@/lib/watermark";

// Wide gap between repeats. Plain spaces collapse to one in HTML, which made the
// stamps run together; em-spaces keep a real, even gap.
const GAP = "\u2003\u2003\u2003";

export default function Watermark({
  label,
  reference,
  dark = false,
}: {
  label: string; // who: grantee label / installer name
  reference: string; // grant id or user id (short form)
  dark?: boolean; // light stamp on dark pages
}) {
  const stamp = watermarkStamp(label, reference);
  const rows = Array.from({ length: 9 });
  return (
    <div className="watermark-layer" aria-hidden>
      {rows.map((_, i) => (
        <div
          key={i}
          className="whitespace-nowrap text-sm font-medium"
          style={{
            position: "absolute",
            // Evenly spaced, parallel diagonal lines (a single, constant left
            // offset — alternating offsets made adjacent lines look doubled).
            top: `${i * 12}%`,
            left: "-25%",
            width: "150%",
            transform: "rotate(-20deg)",
            color: dark ? "rgba(255, 255, 255, 0.09)" : "rgba(120, 120, 120, 0.13)",
            letterSpacing: "0.06em",
          }}
        >
          {Array.from({ length: 5 }).map(() => stamp).join(GAP)}
        </div>
      ))}
    </div>
  );
}
