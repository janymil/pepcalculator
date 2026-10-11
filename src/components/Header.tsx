import { LANGUAGES, LANGUAGE_LABELS } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import type { Lang } from '../i18n/types';
import type { ThemeName } from '../types';

interface HeaderProps {
  theme: ThemeName;
  onThemeToggle: () => void;
}

/** App title, language switch and light/dark switch. */
export function Header({ theme, onThemeToggle }: HeaderProps) {
  const { lang, setLang, strings } = useI18n();

  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          💊
        </span>
        <div className="brand__text">
          <h1 className="brand__name">{strings.appName}</h1>
          <p className="brand__tagline">{strings.tagline}</p>
        </div>
      </div>

      <div className="app-header__controls">
        <div className="lang-toggle" role="group" aria-label={strings.language.label}>
          {LANGUAGES.map((code: Lang) => (
            <button
              key={code}
              type="button"
              className={`lang-toggle__btn${code === lang ? ' is-active' : ''}`}
              aria-pressed={code === lang}
              onClick={() => setLang(code)}
            >
              {LANGUAGE_LABELS[code]}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={onThemeToggle}
          aria-label={strings.theme.label}
          title={strings.theme.label}
        >
          <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
        </button>
      </div>
    </header>
  );
}
