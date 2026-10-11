import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { Owner } from '../lib/owners';
import { Icon } from './Icon';

interface OwnerTabsProps {
  owners: Owner[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
}

/**
 * The "whose stack is this?" switcher.
 *
 * Exactly one person is selected at any time — there is deliberately **no
 * "all" option**, because the whole point is that stacks never mix. The kind
 * filter (peptide/anabolic) then narrows *within* the selected person.
 */
export function OwnerTabs({ owners, activeId, onSelect, onAdd }: OwnerTabsProps) {
  const { strings } = useI18n();
  const copy = strings.people;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = draft.trim();
    if (name === '') return;
    onAdd(name);
    setDraft('');
    setAdding(false);
  };

  return (
    <div className="owners" role="group" aria-label={copy.label}>
      <span className="owners__label">{copy.label}</span>

      {owners.map((owner) => {
        const active = owner.id === activeId;
        return (
          <button
            key={owner.id}
            type="button"
            className={`owners__tab${active ? ' is-active' : ''}`}
            aria-pressed={active}
            onClick={() => onSelect(owner.id)}
          >
            <Icon name="person" size={16} />
            <span className="owners__name">{owner.name.trim() || copy.me}</span>
          </button>
        );
      })}

      {adding ? (
        <form className="owners__form" onSubmit={submit}>
          <input
            className="owners__input"
            type="text"
            autoFocus
            value={draft}
            placeholder={copy.namePlaceholder}
            aria-label={copy.namePlaceholder}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="btn btn--sm btn--accent" disabled={draft.trim() === ''}>
            {copy.save}
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => {
              setAdding(false);
              setDraft('');
            }}
          >
            {copy.cancel}
          </button>
        </form>
      ) : (
        <button type="button" className="owners__add" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} />
          {copy.add}
        </button>
      )}
    </div>
  );
}
