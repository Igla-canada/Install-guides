// Flatten a guide's JSONB blocks into plain text.
//
// Used by the search index and by the MCP `fetch` tool, so an agent reads the
// same words an installer sees. Every block kind is handled explicitly and
// unknown kinds degrade to "" rather than throwing — block types can be added
// without a schema change (see src/lib/blocks.ts), and a new one must never be
// able to break indexing for a whole guide.
import type { IglaSection } from "./igla-config";

/** Strip the rich-text allowlist HTML back to readable text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|ul|ol)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function iglaSettingsText(sections: unknown): string {
  if (!Array.isArray(sections)) return "";
  const out: string[] = [];
  for (const raw of sections as IglaSection[]) {
    const title = str(raw?.title);
    if (title) out.push(title);
    for (const row of raw?.rows ?? []) {
      const label = str(row?.label);
      const c = row?.control;
      let value = "";
      switch (c?.type) {
        case "toggle":
          value = c.value ? str(c.onLabel) || "Enabled" : str(c.offLabel) || "Disabled";
          break;
        case "select":
          // Store the option's LABEL, not its id — an agent quoting "15 seconds"
          // is useful, quoting "opt_3" is not.
          value = str(c.options?.find((o) => o.id === c.value)?.label) || str(c.value);
          break;
        case "flags":
          value = (c.options ?? [])
            .filter((o) => c.values?.includes(o.id))
            .map((o) => str(o.label))
            .filter(Boolean)
            .join(", ");
          break;
        case "slider":
          value = String(c.value ?? "");
          break;
        case "number":
          value = [
            (c.segments ?? []).map((s) => String(s?.value ?? "")).join(":"),
            str(c.unit),
          ]
            .filter(Boolean)
            .join(" ");
          break;
        case "io":
          value = [
            str(c.wire),
            str(c.direction?.options?.find((o) => o.id === c.direction?.value)?.label),
            str(c.func?.options?.find((o) => o.id === c.func?.value)?.label),
            c.inversion ? "inverted" : "",
          ]
            .filter(Boolean)
            .join(" · ");
          break;
      }
      const help = str(row?.help);
      const line = [label, value].filter(Boolean).join(": ");
      if (line) out.push(help ? `${line} (${help})` : line);
    }
  }
  return out.join("\n");
}

/**
 * One block's searchable/readable text. `content` is the raw JSONB — treat every
 * field as untrusted shape.
 */
export function blockToText(type: string, content: unknown): string {
  const c = (content ?? {}) as Record<string, unknown>;
  switch (type) {
    case "text":
      return htmlToText(str(c.text));

    case "callout": {
      const style = str(c.style);
      const text = htmlToText(str(c.text));
      if (!text) return "";
      return style && style !== "info" ? `${style.toUpperCase()}: ${text}` : text;
    }

    case "key_value_table":
      return (Array.isArray(c.rows) ? c.rows : [])
        .map((r) => {
          const row = (r ?? {}) as Record<string, unknown>;
          return [str(row.key), str(row.value)].filter(Boolean).join(": ");
        })
        .filter(Boolean)
        .join("\n");

    case "connections_table":
      return (Array.isArray(c.rows) ? c.rows : [])
        .map((r) => {
          const row = (r ?? {}) as Record<string, unknown>;
          const head = [str(row.name), str(row.location)].filter(Boolean).join(" @ ");
          const detail = [
            str(row.color) && `colour ${str(row.color)}`,
            str(row.pin) && `pin ${str(row.pin)}`,
            str(row.note),
          ]
            .filter(Boolean)
            .join(", ");
          return [head, detail].filter(Boolean).join(" — ");
        })
        .filter(Boolean)
        .join("\n");

    case "checklist":
      return (Array.isArray(c.items) ? c.items : [])
        .map((i) => str((i as Record<string, unknown>)?.text))
        .filter(Boolean)
        .map((t) => `• ${t}`)
        .join("\n");

    case "code_value": {
      const label = str(c.label);
      const value = str(c.value);
      return [label, value].filter(Boolean).join(": ");
    }

    case "image":
    case "annotated_image":
      return [str(c.heading), str(c.caption)].filter(Boolean).join(" — ");

    case "gallery":
      return (Array.isArray(c.items) ? c.items : [])
        .map((i) => str((i as Record<string, unknown>)?.caption))
        .filter(Boolean)
        .join("\n");

    case "file":
      return str(c.name);

    case "file_text":
      return [htmlToText(str(c.text)), str(c.name)].filter(Boolean).join("\n");

    case "igla_settings": {
      const head = str(c.productName);
      const body = iglaSettingsText(c.sections);
      return [head && `Igla settings — ${head}`, body].filter(Boolean).join("\n");
    }

    case "divider":
      return "";

    default:
      // Forward compatibility: a block type authored by a newer version still
      // contributes whatever plain strings it carries rather than nothing.
      return Object.values(c)
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
        .join(" ");
  }
}

/** Annotation callouts on a photo ("CAN-H here") — often the only text on it. */
export function annotationsToText(
  annotations: Array<{ label: string; description: string | null }>,
): string {
  return annotations
    .map((a) => [a.label?.trim(), a.description?.trim()].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join("\n");
}
