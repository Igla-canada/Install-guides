"use client";

import { useEffect, useState, useTransition } from "react";
import { updateGuideBlockingFromList } from "@/lib/guide-list-actions";

export type BlockingFieldsState = {
  blockKind: string | null;
  analogBlockRequired: boolean;
  analogBlockType: string | null;
};

function useGuideBlockingFields(
  guildId: string,
  initial: BlockingFieldsState,
  onChange?: (next: BlockingFieldsState) => void,
) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setState(initial);
  }, [
    guildId,
    initial.blockKind,
    initial.analogBlockRequired,
    initial.analogBlockType,
  ]);

  function patch(partial: Partial<BlockingFieldsState>) {
    const prev = state;
    let next: BlockingFieldsState = { ...state, ...partial };
    if (partial.analogBlockRequired === false) {
      next = { ...next, analogBlockType: null };
    }
    if (partial.analogBlockRequired === true) {
      next = { ...next, blockKind: "analog" };
    }
    setState(next);
    startTransition(async () => {
      const res = await updateGuideBlockingFromList(guildId, {
        analogBlockRequired: next.analogBlockRequired,
        analogBlockType: next.analogBlockType,
        blockKind:
          next.blockKind === "analog" || next.blockKind === "digital"
            ? next.blockKind
            : null,
      });
      if (!res.ok) {
        setState(prev);
        return;
      }
      const saved: BlockingFieldsState = {
        blockKind: res.blockKind,
        analogBlockRequired: res.analogBlockRequired,
        analogBlockType: res.analogBlockType,
      };
      setState(saved);
      onChange?.(saved);
    });
  }

  const blockValue =
    state.blockKind === "analog" || state.blockKind === "digital"
      ? state.blockKind
      : state.analogBlockRequired
        ? "analog"
        : "";

  return { state, patch, pending, blockValue };
}

/** Two table cells: Type of block + Analog (same as staff compatibility list). */
export function GuideBlockingCells({
  guildId,
  initial,
  onChange,
}: {
  guildId: string;
  initial: BlockingFieldsState;
  onChange?: (next: BlockingFieldsState) => void;
}) {
  const { state, patch, pending, blockValue } = useGuideBlockingFields(
    guildId,
    initial,
    onChange,
  );

  return (
    <>
      <td className="px-3 py-3 align-top" onClick={(e) => e.stopPropagation()}>
        <select
          value={blockValue}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value;
            patch({
              blockKind: v === "analog" || v === "digital" ? v : null,
              ...(v === "analog"
                ? { analogBlockRequired: true }
                : v === "digital"
                  ? { analogBlockRequired: false }
                  : {}),
            });
          }}
          className="max-w-[7.5rem] rounded border border-zinc-200 bg-white px-1.5 py-1 text-xs"
          title="Type of block: digital or analog"
        >
          <option value="">—</option>
          <option value="analog">Analog</option>
          <option value="digital">Digital</option>
        </select>
      </td>
      <td className="px-3 py-3 align-top" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-[10rem] flex-col gap-1">
          <select
            value={state.analogBlockRequired ? "yes" : "no"}
            disabled={pending}
            onChange={(e) =>
              patch({ analogBlockRequired: e.target.value === "yes" })
            }
            className="rounded border border-zinc-200 bg-white px-1.5 py-1 text-xs"
            title="Analog blocking required?"
          >
            <option value="no">Not required</option>
            <option value="yes">Required</option>
          </select>
          {state.analogBlockRequired && (
            <input
              type="text"
              defaultValue={state.analogBlockType ?? ""}
              key={`${guildId}-${state.analogBlockType ?? ""}`}
              disabled={pending}
              placeholder="Type / notes…"
              onBlur={(e) => {
                const next = e.target.value.trim() || null;
                if (next === (state.analogBlockType ?? null)) return;
                patch({ analogBlockType: next });
              }}
              className="rounded border border-zinc-200 px-1.5 py-1 text-xs"
              title="Optional analog blocking detail"
            />
          )}
        </div>
      </td>
    </>
  );
}

/** Inline layout (non-table contexts). */
export default function BlockingFieldsInline({
  guildId,
  initial,
  onChange,
  disabled = false,
}: {
  guildId: string;
  initial: BlockingFieldsState;
  onChange?: (next: BlockingFieldsState) => void;
  disabled?: boolean;
}) {
  const { state, patch, pending, blockValue } = useGuideBlockingFields(
    guildId,
    initial,
    onChange,
  );

  return (
    <div
      className="flex flex-wrap items-start gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={blockValue}
        disabled={disabled || pending}
        onChange={(e) => {
          const v = e.target.value;
          patch({
            blockKind: v === "analog" || v === "digital" ? v : null,
            ...(v === "analog"
              ? { analogBlockRequired: true }
              : v === "digital"
                ? { analogBlockRequired: false }
                : {}),
          });
        }}
        className="max-w-[7.5rem] rounded border border-zinc-200 bg-white px-1.5 py-1 text-xs"
        title="Type of block: digital or analog"
      >
        <option value="">—</option>
        <option value="analog">Analog</option>
        <option value="digital">Digital</option>
      </select>
      <div className="flex min-w-[9rem] flex-col gap-1">
        <select
          value={state.analogBlockRequired ? "yes" : "no"}
          disabled={disabled || pending}
          onChange={(e) =>
            patch({ analogBlockRequired: e.target.value === "yes" })
          }
          className="rounded border border-zinc-200 bg-white px-1.5 py-1 text-xs"
          title="Analog blocking required?"
        >
          <option value="no">Not required</option>
          <option value="yes">Required</option>
        </select>
        {state.analogBlockRequired && (
          <input
            type="text"
            defaultValue={state.analogBlockType ?? ""}
            key={`${guildId}-${state.analogBlockType ?? ""}`}
            disabled={disabled || pending}
            placeholder="Type / notes…"
            onBlur={(e) => {
              const next = e.target.value.trim() || null;
              if (next === (state.analogBlockType ?? null)) return;
              patch({ analogBlockType: next });
            }}
            className="rounded border border-zinc-200 px-1.5 py-1 text-xs"
            title="Optional analog blocking detail"
          />
        )}
      </div>
    </div>
  );
}
