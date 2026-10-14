import { describe, expect, it } from 'vitest';
import {
  LOCAL_SYNC_SERVER,
  defaultSyncServer,
  migratedSyncServer,
  trimServer,
} from './syncServer';

describe('defaultSyncServer', () => {
  it('uses the address the page was loaded from in a production build', () => {
    expect(defaultSyncServer({ origin: 'https://pepstool.com', production: true })).toBe(
      'https://pepstool.com',
    );
  });

  it('follows the app to a new domain without a rebuild-time setting', () => {
    expect(defaultSyncServer({ origin: 'https://example.org/', production: true })).toBe(
      'https://example.org',
    );
  });

  it('lets an explicit setting win, whatever the page address is', () => {
    expect(
      defaultSyncServer({
        configured: 'https://sync.example/',
        origin: 'https://pepstool.com',
        production: true,
      }),
    ).toBe('https://sync.example');
  });

  it('ignores an empty setting rather than treating it as an address', () => {
    expect(defaultSyncServer({ configured: '  ', origin: 'https://pepstool.com', production: true })).toBe(
      'https://pepstool.com',
    );
  });

  it('keeps the local server in development, where the page is not the API', () => {
    expect(defaultSyncServer({ origin: 'http://localhost:5173', production: false })).toBe(
      LOCAL_SYNC_SERVER,
    );
  });

  it('falls back to the local server outside a browser', () => {
    expect(defaultSyncServer({ origin: '', production: true })).toBe(LOCAL_SYNC_SERVER);
  });

  it('ignores a retired domain the host still bakes in', () => {
    // The old address only survives because the build settings still list it.
    // The page is the truth now, and a fresh device must not inherit the old one.
    expect(
      defaultSyncServer({
        configured: 'https://pepcalculator.casacam.net',
        origin: 'https://pepstool.com',
        production: true,
      }),
    ).toBe('https://pepstool.com');
  });

  it('keeps a retired default while the page really is on that domain', () => {
    expect(
      defaultSyncServer({
        configured: 'https://pepcalculator.casacam.net',
        origin: 'https://pepcalculator.casacam.net',
        production: true,
      }),
    ).toBe('https://pepcalculator.casacam.net');
  });

  it('keeps a retired default when there is no page origin to follow', () => {
    expect(
      defaultSyncServer({
        configured: 'https://pepcalculator.casacam.net',
        origin: '',
        production: true,
      }),
    ).toBe('https://pepcalculator.casacam.net');
  });
});

describe('migratedSyncServer', () => {
  const now = 'https://pepstool.com';

  it('moves a device off the old test domain', () => {
    expect(migratedSyncServer('https://pepcalculator.casacam.net', now)).toBe(now);
    expect(migratedSyncServer('https://pepcalculator.casacam.net/', now)).toBe(now);
  });

  it('leaves an address the user chose alone', () => {
    expect(migratedSyncServer('https://my-own-server.example', now)).toBe('https://my-own-server.example');
  });

  it('changes nothing when the saved address already is the default', () => {
    expect(migratedSyncServer(now, now)).toBe(now);
    expect(migratedSyncServer('https://pepstool.com/', now)).toBe('https://pepstool.com/');
  });

  it('does not rewrite the legacy domain on the legacy domain itself', () => {
    const legacy = 'https://pepcalculator.casacam.net';
    expect(migratedSyncServer(legacy, legacy)).toBe(legacy);
  });
});

describe('trimServer', () => {
  it('drops whitespace and trailing slashes only', () => {
    expect(trimServer('  https://a.example///  ')).toBe('https://a.example');
    expect(trimServer('https://a.example/path')).toBe('https://a.example/path');
  });
});
