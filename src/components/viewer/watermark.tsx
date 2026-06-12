// Serve-time per-view watermark (AGENTS.md #3). Rendered server-side into the
// page with the viewer's identity + timestamp + grant/user id. Never cache or
// share a rendered installer view — the stamp is what makes a leaked screen
// photo traceable to a person and a moment.
export default function Watermark({
  label,
  reference,
}: {
  label: string; // who: grantee label / installer name
  reference: string; // grant id or user id (short form)
  }) {
  const stamp = `${label} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · ${reference}`;
  const rows = Array.from({ length: 12 });
  return (
    <div className="watermark-layer" aria-hidden>
      {rows.map((_, i) => (
        <div
          key={i}
          className="whitespace-nowrap text-sm font-medium"
          style={{
            position: "absolute",
            top: `${i * 9}%`,
            left: i % 2 === 0 ? "-10%" : "-25%",
            width: "150%",
            transform: "rotate(-20deg)",
            color: "rgba(120, 120, 120, 0.13)",
            letterSpacing: "0.05em",
          }}
        >
          {Array.from({ length: 6 })
            .map(() => stamp)
            .join("      ")}
        </div>
      ))}
    </div>
  );
}
