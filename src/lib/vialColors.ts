/**
 * A stable colour per saved vial.
 *
 * The same vial must look the same everywhere — the calendar pills, the day
 * panel, the saved-vials list and the legend — so the colour is derived from the
 * vial id alone (never from the list order). Pure and tiny, so it is testable.
 *
 * The palette holds mid-tone hues: they are readable with white text and still
 * stand out on both the light and the dark theme.
 */

/**
 * A muted categorical palette: mid-tone, slightly desaturated hues that stay
 * readable as small dots on both themes and never shout over the accent colour.
 */
export const VIAL_COLORS = [
  '#0e8a7d', // teal
  '#4a63c8', // indigo
  '#7a5bc4', // violet
  '#b8467f', // plum
  '#b8630f', // amber
  '#0e7490', // cyan
  '#4a7c59', // moss
  '#8f5a3c', // clay
  '#5b6b7c', // slate
  '#7d6a2f', // olive
] as const;

/** Index into `VIAL_COLORS` for a vial id (djb2-style, deterministic). */
export function vialColorIndex(id: string): number {
  let hash = 5381;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 33 + id.charCodeAt(index)) >>> 0;
  }
  return hash % VIAL_COLORS.length;
}

/** The colour for a vial, stable across pages and reloads. */
export function vialColor(id: string): string {
  return VIAL_COLORS[vialColorIndex(id)];
}
