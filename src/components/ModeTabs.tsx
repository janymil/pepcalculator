import { MODES } from '../config/modes';
import { useI18n } from '../i18n/I18nContext';
import type { ModeId } from '../lib/calc';

interface ModeTabsProps {
  mode: ModeId;
  onChange: (mode: ModeId) => void;
}

/**
 * The mode picker. It renders straight from the `MODES` registry, so adding a
 * workflow in one place makes it appear here automatically.
 */
export function ModeTabs({ mode, onChange }: ModeTabsProps) {
  const { strings } = useI18n();

  return (
    <div className="modes" role="group" aria-label={strings.sections.inputs}>
      {MODES.map((item) => {
        const copy = strings.modes[item.id];
        const active = item.id === mode;
        return (
          <button
            key={item.id}
            type="button"
            className={`mode${active ? ' is-active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(item.id)}
          >
            <span className="mode__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="mode__body">
              <span className="mode__head">
                <span className="mode__title">{copy.title}</span>
                <span className="mode__tag">{copy.tag}</span>
              </span>
              <span className="mode__desc">{copy.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
