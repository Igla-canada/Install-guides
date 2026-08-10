/** Optional collapse on any block's content JSON (`collapsible: true`). */

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstLine(text: string, html: string, max = 80): string {
  const plain = text.trim() || stripHtml(html);
  const line = plain.split(/\n/).find((l) => l.trim()) ?? "";
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  gallery: "Photos",
  image: "Photo",
  annotated_image: "Photo",
  connections_table: "Connections table",
  key_value_table: "Key / value table",
  checklist: "Checklist",
  callout: "Callout",
  code_value: "Code / value",
  file: "File",
  file_text: "File + text",
  igla_settings: "Igla settings",
  divider: "Divider",
};

/** Short label shown when a collapsible block is closed. */
export function blockCollapsedPreview(
  type: string,
  content: Record<string, unknown>,
): string {
  const c = content;
  const label = TYPE_LABELS[type] ?? type.replace(/_/g, " ");

  switch (type) {
    case "text":
    case "callout":
      return firstLine(String(c.text ?? ""), String(c.html ?? "")) || label;
    case "file_text":
      return firstLine(String(c.text ?? ""), "") || label;
    case "gallery": {
      const n = Array.isArray(c.items) ? c.items.length : 0;
      return n ? `${label} (${n})` : label;
    }
    case "checklist": {
      const n = Array.isArray(c.items) ? c.items.length : 0;
      return n ? `${label} (${n} items)` : label;
    }
    case "connections_table":
    case "key_value_table": {
      const n = Array.isArray(c.rows) ? c.rows.length : 0;
      return n ? `${label} (${n} rows)` : label;
    }
    case "image":
    case "annotated_image":
      return String(c.heading ?? c.caption ?? "").trim() || label;
    case "code_value":
      return String(c.label ?? c.value ?? "").trim() || label;
    case "file":
      return String(c.name ?? "").trim() || label;
    case "igla_settings":
      return String(c.productName ?? "").trim()
        ? `Igla settings · ${c.productName}`
        : label;
    default:
      return label;
  }
}

export function isBlockCollapsible(content: Record<string, unknown>): boolean {
  return Boolean(content.collapsible);
}

export function withBlockCollapsible(
  content: Record<string, unknown>,
  collapsible: boolean,
): Record<string, unknown> {
  if (collapsible) return { ...content, collapsible: true };
  const next = { ...content };
  delete next.collapsible;
  return next;
}
