// Block content contracts shared by the preview editor, the chat surface and
// the viewer/PDF renderer. Content lives in JSONB — adding a type here needs
// no schema change. Unknown types must render as a graceful fallback, never
// crash (forward compatibility for content authored by newer versions).

export type BlockContent =
  | { kind: "text"; text: string }
  | { kind: "key_value_table"; rows: Array<{ key: string; value: string }> }
  // heading = the red banner over the photo, e.g. "Passenger Foot Well
  // Harness" or "Installation Location: (1) Passenger Side Foot Well" —
  // ties the photo to its connection point.
  | { kind: "image"; imageAssetId: string; heading?: string; caption?: string }
  | { kind: "annotated_image"; imageAssetId: string; heading?: string; caption?: string }
  // columns = how many across in the grid (1–4); lets the author pick the
  // layout for the PDF/view (2×grid, 3×grid, single-wide, …).
  | {
      kind: "gallery";
      items: Array<{ imageAssetId: string; caption?: string }>;
      columns?: number;
    }
  // The "IGLA Connections" table from the reference pages. `location` ties a
  // row to the photo heading it belongs to when a car has multiple
  // connection points.
  | {
      kind: "connections_table";
      rows: Array<{ name: string; location: string; color: string; pin: string; note: string }>;
    }
  | { kind: "checklist"; items: Array<{ text: string; checked: boolean }> }
  | { kind: "callout"; style: "info" | "warning" | "danger"; text: string }
  | { kind: "code_value"; label?: string; value: string }
  | { kind: "file"; assetId: string; name: string; size?: number } // firmware .bin etc.
  // File + a description in one block: a text area that carries the attachment
  // with it (e.g. "231: Stable version" + the .bin). The single file option.
  | { kind: "file_text"; text: string; assetId: string; name: string; size?: number }
  | { kind: "divider" };

// The block picker. One photo option (gallery — handles single or multiple
// images, each annotatable) and one file option (file_text). The legacy
// `image` / `annotated_image` / `file` types still render everywhere for
// content authored before this change, they're just no longer offered here.
export const BLOCK_TYPES = [
  { type: "text", label: "Text" },
  { type: "connections_table", label: "Connections table" },
  { type: "key_value_table", label: "Key / value table" },
  { type: "gallery", label: "Photo with annotations" },
  { type: "checklist", label: "Checklist" },
  { type: "callout", label: "Callout / warning" },
  { type: "code_value", label: "Code / value" },
  { type: "file_text", label: "File + text" },
  { type: "divider", label: "Divider" },
] as const;

export const SECTION_TYPES = [
  { type: "installation_point", label: "Installation point", color: "red" },
  { type: "connections", label: "Connections", color: "red" },
  { type: "settings", label: "Settings", color: "blue" },
  { type: "software", label: "Software", color: "purple" },
  { type: "buttons_indications", label: "Buttons & indications", color: "green" },
  { type: "warning", label: "Warning", color: "amber" },
  { type: "custom", label: "Custom", color: "zinc" },
] as const;

export function defaultContent(type: string): object {
  switch (type) {
    case "text":
      return { text: "" };
    case "key_value_table":
      return { rows: [{ key: "", value: "" }] };
    case "image":
    case "annotated_image":
      return { imageAssetId: "", heading: "", caption: "" };
    case "gallery":
      return { items: [], columns: 2 };
    case "connections_table":
      // Pre-filled with the standard IGLA hookups — fastest path in the car.
      return {
        rows: [
          { name: "CAN-H", location: "", color: "", pin: "", note: "" },
          { name: "CAN-L", location: "", color: "", pin: "", note: "" },
          { name: "Ground", location: "", color: "", pin: "", note: "" },
          { name: "12V Constant", location: "", color: "", pin: "", note: "" },
        ],
      };
    case "checklist":
      return { items: [{ text: "", checked: false }] };
    case "callout":
      return { style: "warning", text: "" };
    case "code_value":
      return { label: "", value: "" };
    case "file":
      return { assetId: "", name: "" };
    case "file_text":
      return { text: "", assetId: "", name: "" };
    default:
      return {};
  }
}

// Colors mirror the Notion reference pages: green connection sections, blue
// settings, dark-red software, olive buttons & indication.
const SECTION_COLORS: Record<
  string,
  { bar: string; tint: string; accent: string }
> = {
  installation_point: {
    bar: "bg-green-800 text-white",
    tint: "bg-green-50",
    accent: "border-l-green-700",
  },
  connections: {
    bar: "bg-green-800 text-white",
    tint: "bg-green-50",
    accent: "border-l-green-700",
  },
  settings: {
    bar: "bg-blue-900 text-white",
    tint: "bg-blue-50",
    accent: "border-l-blue-800",
  },
  software: {
    bar: "bg-red-900 text-white",
    tint: "bg-red-50",
    accent: "border-l-red-800",
  },
  buttons_indications: {
    bar: "bg-yellow-800 text-white",
    tint: "bg-yellow-50",
    accent: "border-l-yellow-700",
  },
  warning: {
    bar: "bg-amber-700 text-white",
    tint: "bg-amber-50",
    accent: "border-l-amber-600",
  },
  custom: {
    bar: "bg-zinc-700 text-white",
    tint: "bg-zinc-50",
    accent: "border-l-zinc-400",
  },
};

export function sectionColors(type: string) {
  return SECTION_COLORS[type] ?? SECTION_COLORS.custom;
}

/** Left-border accent used in the editor cards. */
export function sectionAccent(type: string): string {
  return sectionColors(type).accent;
}
