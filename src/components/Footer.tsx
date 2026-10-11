import { useI18n } from '../i18n/I18nContext';
import { Icon } from './Icon';

/** Safety disclaimer + a small note about where the data lives. */
export function Footer() {
  const { strings } = useI18n();

  return (
    <footer className="app-footer">
      <div className="disclaimer">
        <span className="disclaimer__icon" aria-hidden="true">
          <Icon name="shield" size={20} />
        </span>
        <div className="disclaimer__text">
          <p className="disclaimer__title">{strings.disclaimer.title}</p>
          <p className="disclaimer__body">{strings.disclaimer.body}</p>
        </div>
      </div>

      <p className="app-footer__note">
        {strings.footer.note} <span className="app-footer__version">{strings.footer.version}</span>
      </p>
    </footer>
  );
}
