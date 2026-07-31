export type TextBlockPresetClient = {
  id: string;
  label: string;
  html: string;
  text: string;
  sortOrder: number;
};

/** Content for a normal `text` block seeded from a named preset. */
export function textContentFromPreset(preset: {
  html: string;
  text: string;
}): { text: string; html: string } {
  return {
    text: preset.text,
    html: preset.html,
  };
}
