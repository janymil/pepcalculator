import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import { PairNotice } from './PairNotice';
import { PairPanel } from './PairPanel';

const render = (node: ReactNode) =>
  renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      {node}
    </I18nProvider>,
  );

const CODE = 'PC-7K2M-9QXA-4BCD-EFGH-JKLM-NPQR';

describe('PairPanel (server render smoke test)', () => {
  it('asks for a sync code before it can draw one', () => {
    const html = render(<PairPanel code="" serverUrl="http://localhost:8787" />);
    expect(html).toContain(DICTIONARIES.en.pair.title);
    expect(html).toContain(DICTIONARIES.en.pair.needCode);
  });

  it('renders the instructions without a window (the QR is built after mount)', () => {
    const html = render(<PairPanel code={CODE} serverUrl="http://localhost:8787" />);
    expect(html).toContain(DICTIONARIES.en.pair.intro);
    expect(html).toContain(DICTIONARIES.en.pair.steps);
  });
});

describe('PairNotice (server render smoke test)', () => {
  it('offers the one-tap reminder button', () => {
    const html = render(<PairNotice needsInstall={false} onEnable={() => {}} onDismiss={() => {}} />);
    expect(html).toContain(DICTIONARIES.en.pair.noticeTitle);
    expect(html).toContain(DICTIONARIES.en.pair.noticeEnable);
  });

  it('tells iPhone users to install the app first', () => {
    const html = render(<PairNotice needsInstall onEnable={() => {}} onDismiss={() => {}} />);
    expect(html).toContain(DICTIONARIES.en.pair.noticeInstalled);
    expect(html).not.toContain(DICTIONARIES.en.pair.noticeEnable);
  });
});
