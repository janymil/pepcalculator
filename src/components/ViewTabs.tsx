import { useI18n } from '../i18n/I18nContext';
import { VIEWS, type ViewId } from '../lib/views';
import { Icon, type IconName } from './Icon';

const VIEW_ICONS: Record<ViewId, IconName> = {
  calculator: 'calculator',
  vials: 'flask',
  calendar: 'calendar',
  glp1: 'shield',
  reference: 'book',
  guide: 'info',
  settings: 'settings',
};

interface ViewTabsProps {
  view: ViewId;
  onChange: (view: ViewId) => void;
}

/**
 * Top-level page switcher: the calculator and the calendar. It renders straight
 * from `VIEWS`, so adding a page there makes it appear here.
 */
export function ViewTabs({ view, onChange }: ViewTabsProps) {
  const { strings } = useI18n();

  return (
    <nav className="views" aria-label={strings.views.label}>
      {VIEWS.map((id) => {
        const active = id === view;
        return (
          <button
            key={id}
            type="button"
            className={`views__tab${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(id)}
          >
            <span className="views__icon" aria-hidden="true">
              <Icon name={VIEW_ICONS[id]} size={18} />
            </span>
            <span className="views__label">{strings.views[id]}</span>
          </button>
        );
      })}
    </nav>
  );
}
