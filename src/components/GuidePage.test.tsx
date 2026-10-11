import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import { GuidePage } from './GuidePage';

/** Renders in a fixed language so the assertions are deterministic. */
function render(lang: 'en' | 'sk' = 'en'): string {
  return renderToString(
    <I18nProvider value={{ lang, setLang: () => {}, strings: DICTIONARIES[lang] }}>
      <GuidePage />
    </I18nProvider>,
  );
}

describe('GuidePage ("How to use")', () => {
  it('frames the explainer instead of reimplementing it', () => {
    const html = render();

    expect(html).toContain('<iframe');
    expect(html).toContain('/explainer.html?embed=1');
  });

  it('tells the video which language to speak', () => {
    expect(render('en')).toContain('lang=en');
    expect(render('sk')).toContain('lang=sk');
  });

  it('gives the frame an accessible name, not just a picture', () => {
    expect(render()).toContain(`title="${DICTIONARIES.en.guide.title}"`);
  });

  it('offers the standalone video, and says how to save it', () => {
    const html = render();

    // The link must not carry ?embed=1, or the shared copy would be cropped.
    expect(html).toContain('href="/explainer.html?lang=en"');
    expect(html).toContain(DICTIONARIES.en.guide.saveHint);
  });
});
