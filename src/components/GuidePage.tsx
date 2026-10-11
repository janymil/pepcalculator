import { useI18n } from '../i18n/I18nContext';
import { Icon } from './Icon';

/**
 * "How to use the app" — the hand-drawn explainer, shown inside the app.
 *
 * The animation is its own self-contained document (`public/explainer.html`, one
 * canvas and no dependencies), so it is **framed rather than reimplemented**:
 * porting ~1000 lines of drawing code into React would create two versions of
 * the same video, and the standalone file is also what the export button
 * records. `?embed=1` tells it to drop its own heading and background, and the
 * app's current language is passed straight through, so the video speaks the
 * same language as the rest of the screen.
 */
export function GuidePage() {
  const { lang, strings } = useI18n();
  const copy = strings.guide;

  const embedSrc = `/explainer.html?embed=1&lang=${lang}`;
  /** The same video without the embedding tweaks, for sharing or exporting. */
  const standaloneSrc = `/explainer.html?lang=${lang}`;

  return (
    <section className="settings" aria-labelledby="guide-title">
      <div className="page-head">
        <h2 className="page-title" id="guide-title">
          {copy.title}
        </h2>
        <p className="page-subtitle">{copy.subtitle}</p>
      </div>

      <div className="guide">
        <div className="guide__frame">
          {/* Keyed on the language, so switching language remounts the frame and
              the video restarts in the new language instead of staying paused. */}
          <iframe
            key={lang}
            className="guide__video"
            src={embedSrc}
            title={copy.title}
            loading="lazy"
            allow="fullscreen"
          />
        </div>

        <div className="guide__actions">
          <a
            className="btn btn--sm"
            href={standaloneSrc}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="sparkles" size={16} />
            {copy.open}
          </a>
          <p className="guide__hint">{copy.saveHint}</p>
        </div>
      </div>
    </section>
  );
}
