"use client";

import { useEffect, useState, useTransition } from "react";
import { setHideFromCompatibility } from "@/lib/guide-list-actions";

/**
 * Guide-level override: when checked, linked compatibility rows stay off the
 * dealer/API list even if the guide is published.
 */
export default function HideFromCompatibilityToggle({
  guildId,
  initialHidden,
  onChange,
  variant = "light",
}: {
  guildId: string;
  initialHidden: boolean;
  onChange?: (hidden: boolean) => void;
  variant?: "light" | "dark";
}) {
  const [hidden, setHidden] = useState(initialHidden);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHidden(initialHidden);
  }, [guildId, initialHidden]);

  const dark = variant === "dark";

  return (
    <label
      className={`inline-flex cursor-pointer items-start gap-2 text-xs ${
        dark ? "text-zinc-300" : "text-zinc-600"
      } ${pending ? "opacity-60" : ""}`}
      title="Overrides publish status for the compatibility list only — does not archive or unpublish the guide"
    >
      <input
        type="checkbox"
        className="mt-0.5"
        checked={hidden}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          const prev = hidden;
          setHidden(next);
          setError(null);
          startTransition(async () => {
            const res = await setHideFromCompatibility(guildId, next);
            if (!res.ok) {
              setHidden(prev);
              setError("Could not save");
              return;
            }
            onChange?.(res.hideFromCompatibility);
          });
        }}
      />
      <span>
        <span className={dark ? "text-zinc-200" : "text-zinc-800"}>
          Hide from compatibility list
        </span>
        <span
          className={`mt-0.5 block ${dark ? "text-zinc-500" : "text-zinc-400"}`}
        >
          Even if published — this wins over the list
        </span>
        {error && (
          <span className="mt-0.5 block text-amber-600">{error}</span>
        )}
      </span>
    </label>
  );
}
