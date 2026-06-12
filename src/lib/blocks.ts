// Block content contracts shared by the preview editor, the chat surface and
// the viewer/PDF renderer. Content lives in JSONB — adding a type here needs
// no schema change. Unknown types must render as a graceful fallback, never
// crash (forward compatibility for content authored by newer versions).

export type BlockContent =
  | { kind: "text"; text: string }
  | { kind: "key_value_table"; rows: Array<{ key: string; value: string }> }
  | { kind: "image"; imageAssetId: string; caption?: string }
  | { kind: "annotated_image"; imageAssetId: string; caption?: string }
  | { kind: "gallery"; items: Array<{ imageAssetId: string; caption?: string }> }
  | { kind: "checklist"; items: Array<{ text: string; checked: boolean }> }
  | { kind: "callout"; style: "info" | "warning" | "danger"; text: string }
  | { kind: "code_value"; label?: string; value: string }
  | { kind: "divider" };

export const BLOCK_TYPES = [
  { type: "text", label: "Text" },
  { type: "key_value_table", label: "Key / value table" },
  { type: "annotated_image", label: "Photo with annotations" },
  { type: "image", label: "Photo" },
  { type: "gallery", label: "Gallery" },
  { type: "checklist", label: "Checklist" },
  { type: "callout", label: "Callout / warning" },
  { type: "code_value", label: "Code / value" },
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
      return { imageAssetId: "", caption: "" };
    case "gallery":
      return { items: [] };
    case "checklist":
      return { items: [{ text: "", checked: false }] };
    case "callout":
      return { style: "warning", text: "" };
    case "code_value":
      return { label: "", value: "" };
    default:
      return {};
  }
}

export function sectionAccent(type: string): string {
  switch (type) {
    case "installation_point":
    case "connections":
      return "border-l-red-500";
    case "settings":
      return "border-l-blue-500";
    case "software":
      return "border-l-purple-500";
    case "buttons_indications":
      return "border-l-green-500";
    case "warning":
      return "border-l-amber-500";
    default:
      return "border-l-zinc-300";
  }
}
