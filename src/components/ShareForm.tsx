import type { DoseUnit } from '../lib/calc';
import { parseNumber } from '../lib/format';
import type { Owner } from '../lib/owners';
import { TIMES_PER_DAY_PRESETS, type VialSchedule } from '../lib/schedule';
import { makeShare, type VialShare } from '../lib/shares';
import { useI18n } from '../i18n/I18nContext';
import { ScheduleForm } from './ScheduleForm';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

/** What one person's row holds while the form is open (numbers stay as typed). */
export interface ShareDraftState {
  /** Ticked = they draw from this bottle. */
  on: boolean;
  /** The day sharing starts for them. */
  from: string;
  /**
   * Ticked = they follow the owner's dose **and** cadence. Unticked = they have
   * both of their own: a dose of their own with the owner's cadence is not a
   * state this form produces. `sharesFromDrafts` therefore always writes the two
   * together, so "same plan" has exactly one meaning on the record.
   */
  samePlan: boolean;
  doseAmount: string;
  doseUnit: DoseUnit;
  schedule: VialSchedule;
}

/** One row per person who could share the bottle, keyed by their id. */
export type SharesDraft = Record<string, ShareDraftState>;

/** What a fresh row is seeded from. */
export interface ShareDefaults {
  /** The day the powder was mixed — sharing can never start before it. */
  reconstitutedOn: string;
  /** The day a new share starts by default. */
  from: string;
  /** The dose being described right now, used to seed a sharer's own dose. */
  doseAmount: number;
  doseUnit: DoseUnit;
  /** The owner's cadence, copied into a sharer's plan so it starts familiar. */
  schedule?: VialSchedule;
}

/** The same starting cadence the rest of the app uses: once a day, 4 weeks. */
function defaultSchedule(from: string): VialSchedule {
  return {
    times: TIMES_PER_DAY_PRESETS[1],
    repeat: 'daily',
    weekdays: [1, 3, 5],
    startsOn: from,
    durationValue: 4,
    durationUnit: 'weeks',
  };
}

/** A single unticked row: what one person looks like before anything is chosen. */
export function shareRow(defaults: ShareDefaults): ShareDraftState {
  return {
    on: false,
    from: defaults.from,
    samePlan: true,
    doseAmount: defaults.doseAmount > 0 ? String(defaults.doseAmount) : '',
    doseUnit: defaults.doseUnit,
    schedule: defaults.schedule
      ? { ...defaults.schedule, startsOn: defaults.from }
      : defaultSchedule(defaults.from),
  };
}

/** A row per other person, all unticked: the state of a vial nobody shares yet. */
export function emptySharesDraft(
  owners: Owner[],
  ownerId: string,
  defaults: ShareDefaults,
): SharesDraft {
  const draft: SharesDraft = {};
  for (const owner of owners) {
    if (owner.id === ownerId) continue;
    draft[owner.id] = shareRow(defaults);
  }
  return draft;
}

/**
 * The draft for an existing vial: everybody it is already shared with comes back
 * ticked, with their own dose and cadence where they have them. A share with
 * somebody who is no longer in the person list has no row to show, so it is
 * carried over untouched instead of being silently dropped.
 */
export function sharesDraftFrom(
  shares: VialShare[],
  owners: Owner[],
  ownerId: string,
  defaults: ShareDefaults,
): SharesDraft {
  const draft = emptySharesDraft(owners, ownerId, defaults);
  for (const share of shares) {
    const row = draft[share.ownerId];
    if (!row) continue;
    row.on = true;
    row.from = share.from;
    // "Same plan" is exactly the absence of both overrides — the same rule the
    // model itself uses, so the checkbox and the stored record never disagree.
    row.samePlan = share.doseAmount === undefined && share.schedule === undefined;
    if (share.doseAmount !== undefined) row.doseAmount = String(share.doseAmount);
    if (share.doseUnit !== undefined) row.doseUnit = share.doseUnit;
    if (share.schedule) row.schedule = { ...share.schedule, startsOn: share.from };
  }
  return draft;
}

/** The shares a form should store: only the ticked rows, in the order given. */
export function sharesFromDrafts(draft: SharesDraft, reconstitutedOn: string): VialShare[] {
  return Object.entries(draft)
    .filter(([, row]) => row.on)
    .map(([personId, row]) =>
      makeShare({
        ownerId: personId,
        from: row.from,
        reconstitutedOn,
        samePlan: row.samePlan,
        doseAmount: parseNumber(row.doseAmount),
        doseUnit: row.doseUnit,
        schedule: row.schedule,
      }),
    );
}

/** The people a vial's own owner has to choose between — everyone else. */
export function shareableOwners(owners: Owner[], ownerId: string): Owner[] {
  return owners.filter((owner) => owner.id !== ownerId);
}

interface ShareFormProps {
  owners: Owner[];
  /** The vial's owner, who is never in the list (nobody shares with themselves). */
  ownerId: string;
  value: SharesDraft;
  onChange: (next: SharesDraft) => void;
  defaults: ShareDefaults;
}

/**
 * "Is this vial shared?" — the list of people the bottle can be shared with.
 *
 * This is deliberately one flat list of people rather than a switch hiding a
 * second switch: ticking nobody is "not shared", and every ticked person gets
 * the day they joined plus the option of their own dose and cadence.
 */
export function ShareForm({ owners, ownerId, value, onChange, defaults }: ShareFormProps) {
  const { strings } = useI18n();
  const copy = strings.shares;
  const others = shareableOwners(owners, ownerId);

  const patch = (personId: string, changes: Partial<ShareDraftState>) => {
    const row = value[personId] ?? shareRow(defaults);
    onChange({ ...value, [personId]: { ...row, ...changes } });
  };

  /** Choosing their own plan needs a starting number, so seed one if blank. */
  const setSamePlan = (personId: string, samePlan: boolean) => {
    const row = value[personId] ?? shareRow(defaults);
    const doseAmount =
      !samePlan && row.doseAmount.trim() === '' && defaults.doseAmount > 0
        ? String(defaults.doseAmount)
        : row.doseAmount;
    patch(personId, { samePlan, doseAmount });
  };

  const unitOptions: SegmentedOption<DoseUnit>[] = [
    { value: 'mg', label: strings.units.mg },
    { value: 'mcg', label: strings.units.mcg },
    ...(defaults.doseUnit === 'IU' ? [{ value: 'IU' as DoseUnit, label: strings.units.IU }] : []),
  ];

  return (
    <fieldset className="share">
      <legend className="share__legend">{copy.title}</legend>
      <p className="field__hint">{copy.hint}</p>

      {others.length === 0 ? (
        <p className="field__hint share__empty">{copy.addPeople}</p>
      ) : (
        <ul className="share__list">
          {others.map((owner) => {
            const row = value[owner.id] ?? shareRow(defaults);
            const name = owner.name.trim() || strings.people.me;

            return (
              <li className="share__row" key={owner.id}>
                <label className="share__person">
                  <input
                    type="checkbox"
                    checked={row.on}
                    onChange={(event) => patch(owner.id, { on: event.target.checked })}
                  />
                  <span className="share__name">{name}</span>
                </label>

                {row.on ? (
                  <div className="share__plan">
                    <label className="share__field">
                      <span className="field__label">{copy.from}</span>
                      <input
                        className="field__input"
                        type="date"
                        value={row.from}
                        min={defaults.reconstitutedOn}
                        onChange={(event) => patch(owner.id, { from: event.target.value })}
                      />
                    </label>

                    <label className="share__same">
                      <input
                        type="checkbox"
                        checked={row.samePlan}
                        onChange={(event) => setSamePlan(owner.id, event.target.checked)}
                      />
                      <span>{copy.samePlan}</span>
                    </label>

                    {row.samePlan ? null : (
                      <>
                        <div className="field">
                          <span className="field__label">{copy.dose}</span>
                          <div className="share__dose">
                            <input
                              className="field__input"
                              type="text"
                              inputMode="decimal"
                              value={row.doseAmount}
                              aria-label={`${copy.dose} — ${name}`}
                              onChange={(event) =>
                                patch(owner.id, { doseAmount: event.target.value })
                              }
                            />
                            <SegmentedControl
                              ariaLabel={copy.dose}
                              size="sm"
                              options={unitOptions}
                              value={row.doseUnit}
                              onChange={(doseUnit) => patch(owner.id, { doseUnit })}
                            />
                          </div>
                        </div>

                        <div className="field">
                          <span className="field__label">{copy.theirPlan}</span>
                          <ScheduleForm
                            value={row.schedule}
                            onChange={(schedule) => patch(owner.id, { schedule })}
                            baseDose={parseNumber(row.doseAmount)}
                            doseUnit={row.doseUnit}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
