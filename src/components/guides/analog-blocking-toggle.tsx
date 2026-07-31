"use client";

import { useEffect, useState, useTransition } from "react";
import { setAnalogBlockingRequired } from "@/lib/guide-list-actions";

/**
 * Guide-level flag: this install needs analog blocking. Syncs onto linked
 * VehicleCompatibility rows (Analog column / block kind). Does not create or
 * modify guide content.
 */
export default function AnalogBlockingToggle({
  guildId,
  initialRequired,
  onChange,
  variant = "light",
  compact = false,
}: {
  guildId: string;
  initialRequired: boolean;
  onChange?: (required: boolean) => void;
  variant?: "light" | "dark";
  compact?: boolean;
}) {
  const [required, setRequired] = useState(initialRequired);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRequired(initialRequired);
  }, [guildId, initialRequired]);

  const dark = variant === "dark";

  return (
    <label
      className={`inline-flex cursor-pointer gap-2 text-xs ${
        compact ? "items-center" : "items-start"
      } ${dark ? "text-zinc-300" : "text-zinc-600"} ${pending ? "opacity-60" : ""}`}
      title="Mark analog blocking for the dealer compatibility list"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        className={compact ? undefined : "mt-0.5"}
        checked={required}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          const prev = required;
          setRequired(next);
          setError(null);
          startTransition(async () => {
            const res = await setAnalogBlockingRequired(guildId, next);
            if (!res.ok) {
              setRequired(prev);
              setError("Could not save");
              return;
            }
            onChange?.(res.analogBlockingRequired);
          });
        }}
      />
      <span>
        <span className={dark ? "text-zinc-200" : "text-zinc-800"}>
          {compact ? "Analog blocking" : "Analog blocking required"}
        </span>
        {!compact && (
          <span
            className={`mt-0.5 block ${dark ? "text-zinc-500" : "text-zinc-400"}`}
          >
            Shows on the dealer compatibility list for linked vehicles
          </span>
        )}
        {error && (
          <span className="mt-0.5 block text-amber-600">{error}</span>
        )}
      </span>
    </label>
  );
}
