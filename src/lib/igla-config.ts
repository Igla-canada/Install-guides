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
  // Multi on/off squares (e.g. Extra options 1–8). Selected ids get the orange fill.
  | { type: "flags"; options: IglaOption[]; values: string[] }
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

/** Soft orange used for selected Extra-options squares (matches Igla software). */
export const IGLA_FLAG_ON_BG = "#f5b086";

export const DEFAULT_EXTRA_OPTION_FLAGS: IglaOption[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
].map((label) => ({ id: label, label }));

export function isExtraOptionsRow(row: { id: string; label: string }): boolean {
  const label = row.label.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    row.id === "extra_options" ||
    label === "extra options" ||
    label === "extra option" ||
    /^extra options?\b/i.test(row.label.trim())
  );
}

/** True when this control is (or should offer) Extra-options number squares. */
export function looksLikeExtraOptionFlags(control: {
  type: string;
  options?: { label: string }[];
}): boolean {
  if (control.type !== "flags" && control.type !== "select") return false;
  const labels = (control.options ?? []).map((o) => o.label.trim());
  if (labels.length < 2) return false;
  return labels.every((l) => /^[1-8]$/.test(l));
}

export function blankExtraOptionsToggle(): Extract<
  IglaControl,
  { type: "toggle" }
> {
  return {
    type: "toggle",
    value: false,
    onLabel: "Enabled",
    offLabel: "Disabled",
  };
}

export function blankExtraOptionsFlags(): Extract<
  IglaControl,
  { type: "flags" }
> {
  return {
    type: "flags",
    options: DEFAULT_EXTRA_OPTION_FLAGS.map((o) => ({ ...o })),
    values: [],
  };
}

/** Normalize legacy select/number Extra options into flags for editing/view. */
export function coerceToFlagsControl(
  control: IglaControl,
): Extract<IglaControl, { type: "flags" }> {
  if (control.type === "flags") {
    return {
      ...control,
      values: Array.isArray(control.values) ? control.values : [],
      options:
        control.options?.length > 0
          ? control.options
          : DEFAULT_EXTRA_OPTION_FLAGS,
    };
  }
  if (control.type === "select") {
    const options =
      control.options.length > 0
        ? control.options
        : DEFAULT_EXTRA_OPTION_FLAGS;
    const values: string[] = [];
    if (control.value) {
      const byId = options.find((o) => o.id === control.value);
      if (byId) values.push(byId.id);
      else {
        const byLabel = options.find(
          (o) =>
            o.label.trim().toLowerCase() ===
            String(control.value).trim().toLowerCase(),
        );
        if (byLabel) values.push(byLabel.id);
      }
    }
    return { type: "flags", options, values };
  }
  return {
    type: "flags",
    options: DEFAULT_EXTRA_OPTION_FLAGS,
    values: [],
  };
}

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
  { type: "flags", label: "Option squares (1–8 on/off)" },
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
    case "flags":
      return {
        type: "flags",
        options: DEFAULT_EXTRA_OPTION_FLAGS.map((o) => ({ ...o })),
        values: [],
      };
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
    case "flags": {
      const on = new Set(c.values);
      return c.options
        .filter((o) => on.has(o.id))
        .map((o) => o.label)
        .join(", ");
    }
    case "slider":
      return String(c.value);
    case "number":
      return c.segments.map((s) => s.value).join(" : ") + (c.unit ? ` ${c.unit}` : "");
    case "io":
      return c.func.options.find((o) => o.id === c.func.value)?.label ?? "";
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id${Math.round(performance.now() * 1000)}`;
}

/** Remint option ids; keep the selected value pointing at the same label. */
function remapOptions(
  options: IglaOption[],
  value: string | null,
): { options: IglaOption[]; value: string | null } {
  let nextValue: string | null = null;
  const next = options.map((o) => {
    const id = newId();
    if (o.id === value) nextValue = id;
    return { ...o, id };
  });
  if (nextValue == null && next[0]) nextValue = next[0].id;
  return { options: next, value: nextValue };
}

/** Deep-clone a control with fresh nested ids (options / segments). */
export function cloneControl(control: IglaControl): IglaControl {
  const c = structuredClone(control);
  switch (c.type) {
    case "select": {
      const remapped = remapOptions(c.options, c.value);
      return { ...c, ...remapped };
    }
    case "flags": {
      const selectedLabels = new Set(
        c.options.filter((o) => c.values.includes(o.id)).map((o) => o.label),
      );
      const options = c.options.map((o) => ({ ...o, id: newId() }));
      return {
        ...c,
        options,
        values: options.filter((o) => selectedLabels.has(o.label)).map((o) => o.id),
      };
    }
    case "number":
      return {
        ...c,
        segments: c.segments.map((s) => ({ ...s, id: newId() })),
      };
    case "io": {
      const direction = remapOptions(c.direction.options, c.direction.value);
      const func = remapOptions(c.func.options, c.func.value);
      return {
        ...c,
        direction: { ...c.direction, ...direction },
        func: { ...c.func, ...func },
      };
    }
    default:
      return c;
  }
}

/** Duplicate a setting row with a new id (for wire-colour twins, etc.). */
export function cloneRow(row: IglaRow, labelSuffix = " (copy)"): IglaRow {
  const label =
    !labelSuffix || row.label.endsWith(labelSuffix)
      ? row.label
      : `${row.label}${labelSuffix}`;
  return {
    ...structuredClone(row),
    id: newId(),
    label,
    control: cloneControl(row.control),
  };
}

/** Duplicate a section and every setting inside it, all with fresh ids. */
export function cloneSection(section: IglaSection, titleSuffix = " (copy)"): IglaSection {
  const title =
    !titleSuffix || section.title.endsWith(titleSuffix)
      ? section.title
      : `${section.title}${titleSuffix}`;
  return {
    id: newId(),
    title,
    // Keep setting labels; only remint ids (user renames wires after clone).
    rows: section.rows.map((r) => cloneRow(r, "")),
  };
}

/** Full template clone — new ids on every section/row/option. */
export function cloneDoc(doc: IglaConfigDoc): IglaConfigDoc {
  return {
    ...structuredClone(doc),
    sections: doc.sections.map((s) => cloneSection(s, "")),
  };
}

/** Move `from` → `to` in a new array (no-op if out of range / same index). */
export function reorder<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) {
    return arr;
  }
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Stable row id used in FD defaults / templates for the vehicle config file. */
export const CAR_CONFIGURATION_ROW_ID = "car_configuration";

export function isCarConfigurationRow(row: {
  id?: string;
  label?: string;
}): boolean {
  if (row.id === CAR_CONFIGURATION_ROW_ID) return true;
  return (row.label ?? "").trim().toLowerCase() === "car configuration";
}

function newOptionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id${Math.round(performance.now() * 1000)}`;
}

/** Find the Car configuration select row in a doc (if present). */
export function findCarConfigurationRow(
  doc: IglaConfigDoc,
): { sectionIndex: number; rowIndex: number; row: IglaRow } | null {
  for (let si = 0; si < doc.sections.length; si++) {
    const section = doc.sections[si];
    for (let ri = 0; ri < section.rows.length; ri++) {
      const row = section.rows[ri];
      if (isCarConfigurationRow(row) && row.control.type === "select") {
        return { sectionIndex: si, rowIndex: ri, row };
      }
    }
  }
  return null;
}

/**
 * Append a car-configuration label to a select control if not already present
 * (case-insensitive). Returns the option to select and whether it was newly added.
 */
export function ensureCarConfigurationOption(
  control: Extract<IglaControl, { type: "select" }>,
  rawLabel: string,
): {
  control: Extract<IglaControl, { type: "select" }>;
  option: IglaOption;
  added: boolean;
} {
  const label = rawLabel.trim();
  if (!label) {
    return {
      control,
      option: { id: control.value ?? "", label: "" },
      added: false,
    };
  }
  const existing = control.options.find(
    (o) => o.label.trim().toLowerCase() === label.toLowerCase(),
  );
  if (existing) {
    return {
      control: { ...control, value: existing.id },
      option: existing,
      added: false,
    };
  }
  const option: IglaOption = { id: newOptionId(), label };
  return {
    control: {
      ...control,
      options: [...control.options, option],
      value: option.id,
    },
    option,
    added: true,
  };
}

/** Merge template car-config options into a guide snapshot (by label). */
export function mergeCarConfigurationOptions(
  sections: IglaSection[],
  templateOptions: IglaOption[],
): { sections: IglaSection[]; changed: boolean } {
  if (!templateOptions.length) return { sections, changed: false };
  let changed = false;
  const next = sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => {
      if (!isCarConfigurationRow(row) || row.control.type !== "select") return row;
      const have = new Set(
        row.control.options.map((o) => o.label.trim().toLowerCase()),
      );
      const extras = templateOptions.filter(
        (o) => o.label.trim() && !have.has(o.label.trim().toLowerCase()),
      );
      if (!extras.length) return row;
      changed = true;
      // Fresh ids in the guide snapshot so we don't share template option ids.
      const mapped = extras.map((o) => ({ id: newOptionId(), label: o.label }));
      return {
        ...row,
        control: {
          ...row.control,
          options: [...row.control.options, ...mapped],
        },
      };
    }),
  }));
  return { sections: changed ? next : sections, changed };
}

function mergeOptionListsByLabel(
  existing: IglaOption[],
  fromDefaults: IglaOption[],
): { options: IglaOption[]; added: number } {
  const have = new Set(
    existing.map((o) => o.label.trim().toLowerCase()).filter(Boolean),
  );
  const usedIds = new Set(existing.map((o) => o.id));
  const extras: IglaOption[] = [];
  for (const o of fromDefaults) {
    const label = o.label.trim();
    if (!label || have.has(label.toLowerCase())) continue;
    have.add(label.toLowerCase());
    if (!usedIds.has(o.id)) {
      usedIds.add(o.id);
      extras.push({ id: o.id, label: o.label });
    } else {
      const id = newOptionId();
      usedIds.add(id);
      extras.push({ id, label: o.label });
    }
  }
  if (!extras.length) return { options: existing, added: 0 };
  return { options: [...existing, ...extras], added: extras.length };
}

/**
 * Keep the current template (presets, values, car configs, structure) and only
 * append missing dropdown / I/O function options from a defaults pack.
 * If the template is empty, returns a full clone of defaults.
 */
export function mergeDefaultsOptionLists(
  existing: IglaConfigDoc | null | undefined,
  defaults: IglaConfigDoc,
): { doc: IglaConfigDoc; added: number } {
  if (!existing || existing.sections.length === 0) {
    return { doc: structuredClone(defaults), added: 0 };
  }

  const byId = new Map<string, IglaRow>();
  const byLabel = new Map<string, IglaRow>();
  for (const section of defaults.sections) {
    for (const row of section.rows) {
      byId.set(row.id, row);
      byLabel.set(row.label.trim().toLowerCase(), row);
    }
  }

  let added = 0;
  const next = structuredClone(existing);
  for (const section of next.sections) {
    for (let i = 0; i < section.rows.length; i++) {
      const row = section.rows[i];
      const def =
        byId.get(row.id) ?? byLabel.get(row.label.trim().toLowerCase());
      if (!def) continue;

      const c = row.control;
      const d = def.control;

      if (c.type === "select" && d.type === "select") {
        // Never pull car-config names from defaults (defaults list is empty).
        if (isCarConfigurationRow(row)) continue;
        const m = mergeOptionListsByLabel(c.options, d.options);
        if (m.added) {
          section.rows[i] = {
            ...row,
            control: { ...c, options: m.options },
          };
          added += m.added;
        }
      } else if (c.type === "flags" && d.type === "flags") {
        const m = mergeOptionListsByLabel(c.options, d.options);
        if (m.added) {
          section.rows[i] = {
            ...row,
            control: { ...c, options: m.options },
          };
          added += m.added;
        }
      } else if (c.type === "io" && d.type === "io") {
        const dir = mergeOptionListsByLabel(
          c.direction.options,
          d.direction.options,
        );
        const func = mergeOptionListsByLabel(c.func.options, d.func.options);
        if (dir.added || func.added) {
          section.rows[i] = {
            ...row,
            control: {
              ...c,
              direction: { ...c.direction, options: dir.options },
              func: { ...c.func, options: func.options },
            },
          };
          added += dir.added + func.added;
        }
      }
    }
  }

  return { doc: next, added };
}

/**
 * Append label onto the template doc's Car configuration list.
 * No-op if the row is missing or the label already exists.
 */
export function appendCarConfigurationToDoc(
  doc: IglaConfigDoc,
  rawLabel: string,
): { doc: IglaConfigDoc; option: IglaOption | null; added: boolean } {
  const found = findCarConfigurationRow(doc);
  if (!found || found.row.control.type !== "select") {
    return { doc, option: null, added: false };
  }
  const { control, option, added } = ensureCarConfigurationOption(
    found.row.control,
    rawLabel,
  );
  if (!added) return { doc, option, added: false };
  const next = structuredClone(doc);
  next.sections[found.sectionIndex].rows[found.rowIndex] = {
    ...next.sections[found.sectionIndex].rows[found.rowIndex],
    control,
  };
  return { doc: next, option, added: true };
}
