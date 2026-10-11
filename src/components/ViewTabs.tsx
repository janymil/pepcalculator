import { useI18n } from '../i18n/I18nContext';
import { VIEWS, type ViewId } from '../lib/views';

const VIEW_ICONS: Record<ViewId, string> = {
  calculator: '🧮',
  vials: '🧪',
  calendar: '📅',
  settings: '⚙️',
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
              {VIEW_ICONS[id]}
            </span>
            <span className="views__label">{strings.views[id]}</span>
          </button>
        );
      })}
    </nav>
  );
}
