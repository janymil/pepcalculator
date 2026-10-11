/**
 * Top-level "pages" of the app.
 *
 * Everything is one HTML page, but there are two distinct screens: the
 * calculator and the calendar. The active one is mirrored in the URL hash, so
 * the browser back button works and an installed PWA reopens on the page you
 * left. Pure and dependency-free — no router library.
 */

export type ViewId = 'calculator' | 'vials' | 'calendar' | 'reference' | 'settings';

export const VIEWS: readonly ViewId[] = ['calculator', 'vials', 'calendar', 'reference', 'settings'];

export function isViewId(value: unknown): value is ViewId {
  return VIEWS.includes(value as ViewId);
}

/** Reads a view from a location hash, accepting `#calendar` and `#/calendar`. */
export function viewFromHash(hash: string): ViewId | null {
  const cleaned = hash.replace(/^#\/?/, '').toLowerCase();
  return isViewId(cleaned) ? cleaned : null;
}

/** The hash that represents a view. */
export function hashForView(view: ViewId): string {
  return `#${view}`;
}
