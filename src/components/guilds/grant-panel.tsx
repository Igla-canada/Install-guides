"use client";
// Notion-style "Share" for a single guide: create a time-limited, watermarked
// access link for THIS guide without hunting through the Access-links page.
import { useState } from "react";

export default function GrantPanel({
  action,
  created,
  label,
  link,
  expiryOptions,
}: {
  action: (formData: FormData) => Promise<void>;
  created?: string;
  label?: string;
  link?: string;
  expiryOptions: Array<{ label: string; hours: number }>;
}) {
  const [open, setOpen] = useState(Boolean(created));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
      >
        🔗 Share
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-80 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          {created && link ? (
            <div>
              <p className="text-sm font-medium text-green-900">
                Link created for {label}. Copy it now — shown once:
              </p>
              <code className="mt-2 block select-all break-all rounded-md bg-green-50 p-2 text-xs">
                {link}
              </code>
              <p className="mt-2 text-xs text-zinc-500">
                Opening it texts a one-time code to the installer&apos;s phone.
              </p>
              <button
                onClick={() => setOpen(false)}
                className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
              >
                Done
              </button>
            </div>
          ) : (
            <form action={action} className="space-y-2">
              <h3 className="text-sm font-semibold">Grant access to this guide</h3>
              <input
                name="granteeLabel"
                required
                placeholder='Installer (e.g. "Mike @ DT Auto")'
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <input
                name="granteePhone"
                required
                placeholder="Installer mobile (+1 416 555 0123)"
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <label className="flex-1 text-xs text-zinc-500">
                  Expires
                  <select
                    name="hours"
                    defaultValue="24"
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  >
                    {expiryOptions.map((o) => (
                      <option key={o.hours} value={o.hours}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex-1 text-xs text-zinc-500">
                  Max views
                  <input
                    name="maxViews"
                    type="number"
                    min={1}
                    placeholder="∞"
                    className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <button className="w-full rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
                Create access link
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
