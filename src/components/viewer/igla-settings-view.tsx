// Read-only render of a guide's frozen Igla settings block — a faithful copy of
// the official Igla configuration software so an installer flashes the unit
// exactly. Pure/presentational (no hooks) so it renders in the server viewer and
// the PDF export alike; `dark` themes it for the watermarked installer view.
import type { IglaControl, IglaSection } from "@/lib/igla-config";

type Content = { productName?: string; sections?: IglaSection[] };

export default function IglaSettingsView({
  content,
  dark = false,
}: {
  content: Content;
  dark?: boolean;
}) {
  const sections = content.sections ?? [];
  if (sections.length === 0) return null;

  const border = dark ? "border-zinc-700" : "border-zinc-200";
  const headBg = dark ? "bg-zinc-800" : "bg-zinc-100";
  const rowBorder = dark ? "border-zinc-800" : "border-zinc-100";
  const labelText = dark ? "text-zinc-200" : "text-zinc-700";
  const boxCls = dark
    ? "border-zinc-700 bg-zinc-900 text-zinc-200"
    : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <div className={`overflow-hidden rounded-lg border ${border}`}>
      <div className={`flex items-center gap-2 border-b px-3 py-1.5 text-xs font-medium ${border} ${headBg} ${labelText}`}>
        <span>⚙ Igla settings</span>
        {content.productName && (
          <span className={`rounded px-1.5 py-0.5 ${dark ? "bg-zinc-700" : "bg-white"}`}>
            {content.productName}
          </span>
        )}
      </div>
      {sections.map((section) => (
        <div key={section.id} className={`border-b last:border-0 ${rowBorder}`}>
          <div className={`px-3 py-2 text-sm font-semibold ${labelText}`}>{section.title}</div>
          <div className={`divide-y ${dark ? "divide-zinc-800" : "divide-zinc-50"}`}>
            {section.rows.map((row) => (
              <div key={row.id} className="flex items-start gap-3 px-3 py-2">
                <div className={`flex min-w-0 flex-1 items-start gap-1 pt-1 text-sm ${labelText}`}>
                  <span className="min-w-0">{row.label}</span>
                  {row.help && (
                    <span className="cursor-help text-zinc-400" title={row.help}>
                      ?
                    </span>
                  )}
                </div>
                <div className="w-[56%] shrink-0">
                  <ReadControl control={row.control} dark={dark} boxCls={boxCls} muted={dark ? "text-zinc-400" : "text-zinc-500"} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReadControl({
  control: c,
  dark,
  boxCls,
  muted,
}: {
  control: IglaControl;
  dark: boolean;
  boxCls: string;
  muted: string;
}) {
  const track = dark ? "bg-zinc-700" : "bg-zinc-300";

  if (c.type === "toggle") {
    const on = c.value;
    return (
      <div className="flex items-center gap-2">
        <span className={`relative h-5 w-9 rounded-full ${on ? "bg-orange-500" : track}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${on ? "left-[1.15rem]" : "left-0.5"}`} />
        </span>
        <span className={`text-sm ${muted}`}>{on ? c.onLabel ?? "Enabled" : c.offLabel ?? "Disabled"}</span>
      </div>
    );
  }

  if (c.type === "select") {
    const label = c.options.find((o) => o.id === c.value)?.label ?? "—";
    return <div className={`rounded-md border px-3 py-1.5 text-sm ${boxCls}`}>{label}</div>;
  }

  if (c.type === "slider") {
    const pct = c.max > c.min ? ((c.value - c.min) / (c.max - c.min)) * 100 : 0;
    return (
      <div className="flex items-center gap-2">
        <span className={`w-8 shrink-0 text-right text-xs ${muted}`}>{c.min}</span>
        <span className={`relative h-1 flex-1 rounded ${track}`}>
          <span className="absolute inset-y-0 left-0 rounded bg-orange-500" style={{ width: `${pct}%` }} />
          <span className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-orange-500" style={{ left: `calc(${pct}% - 6px)` }} />
        </span>
        <span className={`w-8 shrink-0 text-xs ${muted}`}>{c.max}</span>
        <span className={`w-10 shrink-0 text-right text-sm font-medium tabular-nums ${dark ? "text-zinc-100" : "text-zinc-800"}`}>{c.value}</span>
      </div>
    );
  }

  if (c.type === "number") {
    return (
      <div className="flex items-center gap-1">
        {c.segments.map((seg) => (
          <span key={seg.id} className={`w-14 rounded-md border py-1.5 text-center text-sm ${boxCls}`}>
            {seg.value}
          </span>
        ))}
        {c.unit && <span className={`ml-1 text-xs ${muted}`}>{c.unit}</span>}
      </div>
    );
  }

  // io
  const dirLabel = c.direction.options.find((o) => o.id === c.direction.value)?.label ?? "—";
  const funcLabel = c.func.options.find((o) => o.id === c.func.value)?.label ?? "—";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="h-4 w-8 shrink-0 rounded border border-black/20" style={{ backgroundColor: c.color }} title={c.wire} />
        <span className={`text-xs ${muted}`}>{c.wire}</span>
        <span className={`ml-auto rounded-md border px-2 py-1 text-xs ${boxCls}`}>{dirLabel}</span>
      </div>
      <div className={`flex items-center gap-2 text-xs ${muted}`}>
        <span>Signal inversion</span>
        <span className={`relative h-4 w-7 rounded-full ${c.inversion ? "bg-orange-500" : track}`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white ${c.inversion ? "left-[0.95rem]" : "left-0.5"}`} />
        </span>
        <span>{c.inversion ? "On" : "Off"}</span>
      </div>
      <div className={`rounded-md border px-3 py-1.5 text-sm ${boxCls}`}>{funcLabel}</div>
    </div>
  );
}
