import { interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import type { Owner } from '../lib/owners';
import { Icon } from './Icon';

interface PeoplePanelProps {
  owners: Owner[];
  /** Live (non-deleted) vial count per owner id. */
  vialCounts: Record<string, number>;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}

/**
 * Manage the people whose stacks the app keeps apart: rename them, or remove
 * one that is empty. A person who still holds vials (or the only person) cannot
 * be removed, so a stack can never be silently merged or lost.
 */
export function PeoplePanel({ owners, vialCounts, onRename, onRemove }: PeoplePanelProps) {
  const { strings } = useI18n();
  const copy = strings.people;

  return (
    <section className="people" aria-labelledby="people-title">
      <p className="people__title" id="people-title">
        {copy.title}
      </p>
      <p className="people__text">{copy.subtitle}</p>

      <ul className="people__list">
        {owners.map((owner) => {
          const count = vialCounts[owner.id] ?? 0;
          const blocked = count > 0 || owners.length <= 1;
          return (
            <li className="people__row" key={owner.id}>
              <Icon name="person" size={18} />
              <input
                className="people__input"
                type="text"
                value={owner.name}
                placeholder={copy.me}
                aria-label={copy.namePlaceholder}
                onChange={(event) => onRename(owner.id, event.target.value)}
              />
              <span className="people__count">{interpolate(copy.vials, { count })}</span>
              <button
                type="button"
                className="btn btn--sm btn--ghost btn--danger"
                disabled={blocked}
                title={blocked ? copy.removeBlocked : undefined}
                onClick={() => onRemove(owner.id)}
              >
                {copy.remove}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
