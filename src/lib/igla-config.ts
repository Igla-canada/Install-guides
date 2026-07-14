// Igla unit configuration — the structured "Igla settings" section that mirrors
// the official Igla configuration software.
//
// A TEMPLATE (admin-managed, one per IglaProduct — the unit type) defines the
// sections, rows, control types, available dropdown options and DEFAULT values.
// When an admin adds the settings section to a guide it is SNAPSHOT into an
// `igla_settings` block (frozen — later template edits never touch it). In the
// guide, an admin edits VALUES only (never structure); techs/installers see it
// read-only. The same IglaConfigDoc shape serves both the template (where the
// control's value is the default) and the per-guide snapshot (where it's the
// chosen value), so one renderer/editor handles both.

export type IglaOption = { id: string; label: string };

// A numeric input made of one or more segments (e.g. the two boxes "00" / "05"
// for a mm:ss parking time). Single-value numbers use one segment.
export type IglaNumSeg = { id: string; label?: string; value: string; max?: number };

export type IglaControl =
  // Enabled/Disabled, On/Off switch.
  | { type: "toggle"; value: boolean; onLabel?: string; offLabel?: string }
  // Single choice from a fixed option list (e.g. "15 seconds", "ON (in all modes)").
  | { type: "select"; options: IglaOption[]; value: string | null }
  // A 0..255-style range with the current numeric value shown.
  | { type: "slider"; min: number; max: number; value: number }
  // One or more numeric boxes, optional unit label.
  | { type: "number"; segments: IglaNumSeg[]; unit?: string }
  // An Input/Output wire row: colour swatch + wire name, a direction dropdown
  // (often fixed), a signal-inversion toggle, and a function dropdown.
  | {
      type: "io";
      color: string; // swatch hex, e.g. "#2f5fce"
      wire: string; // wire name, e.g. "White-blue"
      direction: { options: IglaOption[]; value: string | null; locked?: boolean };
      inversion: boolean;
      func: { options: IglaOption[]; value: string | null };
    };

export type IglaControlType = IglaControl["type"];

export type IglaRow = {
  id: string;
  label: string;
  help?: string; // the "?" tooltip copy
  control: IglaControl;
};

export type IglaSection = {
  id: string;
  title: string;
  rows: IglaRow[];
};

export type IglaConfigDoc = {
  // Set on a per-guide snapshot: which unit/product it represents (denormalised
  // label so the frozen block renders without a lookup). Absent on templates.
  productId?: string;
  productName?: string;
  sections: IglaSection[];
};

export const CONTROL_TYPES: { type: IglaControlType; label: string }[] = [
  { type: "toggle", label: "Toggle (Enabled / Disabled)" },
  { type: "select", label: "Dropdown (choose one)" },
  { type: "slider", label: "Slider (0–255)" },
  { type: "number", label: "Number / time boxes" },
  { type: "io", label: "Input / Output wire" },
];

export function emptyDoc(): IglaConfigDoc {
  return { sections: [] };
}

export function isIglaConfigDoc(v: unknown): v is IglaConfigDoc {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as { sections?: unknown }).sections)
  );
}

// A safe, never-crash coercion for JSONB read back from the DB or block content.
export function asConfigDoc(v: unknown): IglaConfigDoc {
  return isIglaConfigDoc(v) ? v : emptyDoc();
}

// A blank control of a given type — used when the admin adds a new row or
// switches a row's control type in the template editor.
export function blankControl(type: IglaControlType): IglaControl {
  switch (type) {
    case "toggle":
      return { type: "toggle", value: false, onLabel: "Enabled", offLabel: "Disabled" };
    case "select":
      return { type: "select", options: [], value: null };
    case "slider":
      return { type: "slider", min: 0, max: 255, value: 0 };
    case "number":
      return { type: "number", segments: [{ id: "s1", value: "0" }] };
    case "io":
      return {
        type: "io",
        color: "#3f6ad8",
        wire: "",
        direction: { options: [], value: null, locked: false },
        inversion: false,
        func: { options: [], value: null },
      };
  }
}

// Human label for a control's CURRENT value (used by the read-only renderer and
// summaries). Returns "" when nothing is set.
export function controlValueLabel(c: IglaControl): string {
  switch (c.type) {
    case "toggle":
      return c.value ? c.onLabel ?? "Enabled" : c.offLabel ?? "Disabled";
    case "select":
      return c.options.find((o) => o.id === c.value)?.label ?? "";
    case "slider":
      return String(c.value);
    case "number":
      return c.segments.map((s) => s.value).join(" : ") + (c.unit ? ` ${c.unit}` : "");
    case "io":
      return c.func.options.find((o) => o.id === c.func.value)?.label ?? "";
  }
}
