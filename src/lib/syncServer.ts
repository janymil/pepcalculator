/**
 * Where the sync server is, and how a stale address gets corrected.
 *
 * The API is served from the same domain as the app (the reverse proxy sends
 * `/api/*` to it), so the right default is simply **the address the page was
 * loaded from**. Baking a domain into the build instead meant that moving the
 * app to a new domain left every device pointing at the old one.
 *
 * Pure module: the page's origin and build mode are passed in, so it can be
 * tested without a browser.
 */

/** The address used while developing: the sync server on this machine. */
export const LOCAL_SYNC_SERVER = 'http://localhost:8787';

/**
 * Addresses this app used to ship as its default and no longer should. A device
 * that saved one of them (because it was the default at the time) is moved to the
 * current default instead of being left on a domain that is going away.
 */
export const LEGACY_SYNC_SERVERS: readonly string[] = ['https://pepcalculator.casacam.net'];

/** `https://app.example/` and `https://app.example` are the same server. */
export function trimServer(address: string): string {
  return address.trim().replace(/\/+$/, '');
}

export interface DefaultSyncServerInput {
  /** `VITE_SYNC_SERVER`, when the build was given one explicitly. */
  configured?: string;
  /** `window.location.origin`, or '' outside a browser. */
  origin: string;
  /** True for a production build; the dev server's origin is not the API's. */
  production: boolean;
}

/**
 * The default sync server.
 *
 * An explicit `VITE_SYNC_SERVER` wins — *except* when it is one of our own
 * retired domains and the page is now served from somewhere else. That pairing
 * is exactly what a host that still has the old address in its build settings
 * produces, and following the page is the only thing that actually gets the
 * user off the domain that is going away.
 *
 * Otherwise a production build uses the page's own origin, and development falls
 * back to the local server (the dev page and the API are on different ports).
 */
export function defaultSyncServer({ configured, origin, production }: DefaultSyncServerInput): string {
  const explicit = trimServer(configured ?? '');
  // The address the page was loaded from, when it is a real one we can follow.
  const page = production && /^https?:\/\//.test(origin) ? trimServer(origin) : '';
  // A baked-in default on a domain we have left is stale, not a choice — unless
  // the page is *still* on that domain, where it is the right address.
  const staleLegacy = LEGACY_SYNC_SERVERS.includes(explicit) && page !== '' && page !== explicit;
  if (explicit !== '' && !staleLegacy) return explicit;
  return page !== '' ? page : LOCAL_SYNC_SERVER;
}

/**
 * The address to actually use, given what is saved on the device.
 *
 * Only a **legacy default** is replaced. Anything else the user typed (their own
 * server, a different domain) is theirs and is left exactly as it is - and on the
 * legacy domain itself the default *is* that domain, so nothing changes there.
 */
export function migratedSyncServer(saved: string, current: string): string {
  const savedAddress = trimServer(saved);
  if (savedAddress === trimServer(current)) return saved;
  return LEGACY_SYNC_SERVERS.includes(savedAddress) ? current : saved;
}
