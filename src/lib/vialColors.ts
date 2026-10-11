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

export const VIAL_COLORS = [
  '#0d9488', // teal
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
  '#ea580c', // orange
  '#ca8a04', // amber
  '#16a34a', // green
  '#0891b2', // cyan
  '#4f46e5', // indigo
  '#be123c', // rose
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
