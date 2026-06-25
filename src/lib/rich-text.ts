// Allowlist for rich-text ("text" block) HTML. Authors style text inline in
// the editor; the result is sanitized to THIS allowlist before it's ever shown
// to an installer, so only safe inline-formatting tags/attributes survive — no
// scripts, event handlers, links, images, or other active content.
export const RICH_ALLOWED_TAGS = [
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "span",
  "p",
  "div",
  "br",
  "ul",
  "ol",
  "li",
  "font",
];

export const RICH_ALLOWED_ATTR = ["style", "color", "size", "face", "align"];
