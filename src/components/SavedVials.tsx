import { useState, type ChangeEvent } from 'react';
import { LOCALES, interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { backupFileName, parseBackup, serializeBackup } from '../lib/backup';
import { fmt, formatDate } from '../lib/format';
import { TIMES_PER_DAY_PRESETS, type VialSchedule } from '../lib/schedule';
import {
  filterVialsByKind,
  vialKind,
  vialStatus,
  type KindFilter,
  type SavedVial,
} from '../lib/vials';
import { vialColor } from '../lib/vialColors';
import { KindFilterControl } from './KindFilterControl';
import { VialCard } from './VialCard';
import { VialEditor } from './VialEditor';

/** Used when an older vial has no saved plan yet. */
const INITIAL_SCHEDULE: VialSchedule = {
  times: TIMES_PER_DAY_PRESETS[1],
  repeat: 'daily',
  weekdays: [1, 3, 5],
  startsOn: '',
  durationValue: 4,
  durationUnit: 'weeks',
};

interface SavedVialsProps {
  /** Live vials (all kinds) — tombstones are already filtered out. */
  vials: SavedVial[];
  todayIso: string;
  nowTime: string;
  onUpdate: (vial: SavedVial) => void;
  onRestore: (vials: SavedVial[]) => void;
  onLoad: (vial: SavedVial) => void;
  onAddDose: (id: string) => void;
  onRemoveDose: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Fallback card for a vial that was saved without a dose plan. */
function VialCardLegacy({
  vial,
  locale,
  onLoad,
  onEdit,
  onAddDose,
  onRemoveDose,
  onDelete,
}: {
  vial: SavedVial;
  locale: string;
  onLoad: (vial: SavedVial) => void;
  onEdit: (vial: SavedVial) => void;
  onAddDose: (id: string) => void;
  onRemoveDose: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { strings } = useI18n();
  const status = vialStatus(vial);
  const anabolic = vialKind(vial) === 'anabolic';
  const color = vialColor(vial.id);

  const expiryDays = status.daysUntilExpiry;
  const badgeTone =
    expiryDays === null ? 'ok' : status.isExpired ? 'expired' : expiryDays <= 3 ? 'soon' : 'ok';
  const badgeText =
    expiryDays === null
      ? strings.vials.noExpiry
      : status.isExpired
        ? interpolate(strings.vials.expired, { days: Math.abs(expiryDays) })
        : expiryDays === 0
          ? strings.vials.lastDay
          : interpolate(strings.vials.daysLeft, { days: expiryDays });

  const percent = Math.max(0, Math.min(100, Math.round(status.percentLeft * 100)));

  return (
    <li className="vial">
      <div className="vial__head">
        <h3 className="vial__name">
          <span className="vial__dot" style={{ backgroundColor: color }} aria-hidden="true" />
          {vial.name || strings.vials.untitled}
        </h3>
        <span className={`vial__kind vial__kind--${anabolic ? 'anabolic' : 'peptide'}`}>
          {anabolic ? strings.kinds.anabolic : strings.kinds.peptide}
        </span>
        <span className={`vial__badge vial__badge--${badgeTone}`}>{badgeText}</span>
      </div>

      <div
        className="vial__bar"
        role="progressbar"
        aria-label={strings.vials.volumeLeft}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="vial__bar-fill" style={{ width: `${percent}%` }} />
      </div>

      <dl className="vial__stats">
        <div className="vial__stat">
          <dt>{strings.vials.dosesLeft}</dt>
          <dd>{fmt.count(status.dosesLeft)}</dd>
        </div>
        <div className="vial__stat">
          <dt>{strings.vials.volumeLeft}</dt>
          <dd>
            {fmt.volume(status.volumeLeftMl)} {strings.units.ml}
          </dd>
        </div>
        <div className="vial__stat">
          <dt>{strings.results.concentration}</dt>
          <dd>
            {fmt.concentration(status.concentrationMgPerMl)} mg/{strings.units.ml}
          </dd>
        </div>
        <div className="vial__stat">
          <dt>{strings.vials.perDose}</dt>
          <dd>
            {fmt.volume(status.volumePerDoseMl)} {strings.units.ml}
          </dd>
        </div>
      </dl>

      <p className="vial__meta">
        {anabolic
          ? `${strings.vials.dateLabelAnabolic}: ${formatDate(vial.reconstitutedOn, locale)}`
          : interpolate(strings.vials.reconstitutedOn, {
              date: formatDate(vial.reconstitutedOn, locale),
            })}
        {' · '}
        {status.expiresOn
          ? interpolate(strings.vials.useBy, { date: formatDate(status.expiresOn, locale) })
          : strings.vials.noExpiry}
      </p>

      <div className="vial__actions">
        <button type="button" className="btn btn--sm" onClick={() => onLoad(vial)}>
          {strings.vials.load}
        </button>
        <button type="button" className="btn btn--sm" onClick={() => onEdit(vial)}>
          {strings.edit.title}
        </button>
        <button type="button" className="btn btn--sm" onClick={() => onAddDose(vial.id)}>
          {strings.vials.addDose}
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          disabled={status.dosesTaken === 0}
          onClick={() => onRemoveDose(vial.id)}
        >
          {strings.vials.removeDose}
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost btn--danger"
          onClick={() => onDelete(vial.id)}
        >
          {strings.vials.delete}
        </button>
      </div>
    </li>
  );
}

/**
 * The Vials page — "My reconstituted vials": every saved peptide and anabolic,
 * filterable by kind, plus the JSON backup/restore. Saving happens on the
 * Calculator page, so this page is only about looking after what you have.
 */
export function SavedVials({
  vials,
  todayIso,
  nowTime,
  onUpdate,
  onRestore,
  onLoad,
  onAddDose,
  onRemoveDose,
  onDelete,
}: SavedVialsProps) {
  const { lang, strings } = useI18n();
  const [filter, setFilter] = useState<KindFilter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = filterVialsByKind(vials, filter);

  const handleSaveEdit = (updated: SavedVial) => {
    onUpdate(updated);
    setEditingId(null);
  };

  /** Downloads every saved vial as a JSON file. */
  const handleBackup = () => {
    const blob = new Blob([serializeBackup(vials, new Date().toISOString())], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName(todayIso);
    link.click();
    URL.revokeObjectURL(url);
    setNotice(strings.backup.done);
  };

  /** Reads a backup file and merges it in (never deletes what is there). */
  const handleRestore = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    void file.text().then((text) => {
      const result = parseBackup(text);
      if (result.ok) {
        onRestore(result.vials);
        setNotice(interpolate(strings.backup.restored, { count: result.vials.length }));
        return;
      }
      setNotice(
        result.reason === 'invalidJson'
          ? strings.backup.errorInvalidJson
          : result.reason === 'notABackup'
            ? strings.backup.errorNotABackup
            : strings.backup.errorNoVials,
      );
    });
  };

  return (
    <section className="card" aria-labelledby="vials-title">
      <h2 className="card__title" id="vials-title">
        {strings.vials.title}
      </h2>

      <div className="vials__toolbar">
        <KindFilterControl value={filter} onChange={setFilter} />
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <span className="empty__icon" aria-hidden="true">
            🧪
          </span>
          <p className="empty__title">{strings.vials.empty}</p>
          <p className="empty__hint">{strings.vials.emptyHint}</p>
        </div>
      ) : (
        <ul className="vials">
          {visible.map((vial) => {
            if (vial.id === editingId) {
              return (
                <li className="vial" key={vial.id}>
                  <VialEditor
                    vial={vial}
                    fallbackSchedule={INITIAL_SCHEDULE}
                    onSave={handleSaveEdit}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              );
            }

            return vial.schedule ? (
              <VialCard
                key={vial.id}
                vial={vial}
                locale={LOCALES[lang]}
                todayIso={todayIso}
                nowTime={nowTime}
                onLoad={onLoad}
                onEdit={(target) => setEditingId(target.id)}
                onAddDose={onAddDose}
                onRemoveDose={onRemoveDose}
                onDelete={onDelete}
              />
            ) : (
              <VialCardLegacy
                key={vial.id}
                vial={vial}
                locale={LOCALES[lang]}
                onLoad={onLoad}
                onEdit={(target) => setEditingId(target.id)}
                onAddDose={onAddDose}
                onRemoveDose={onRemoveDose}
                onDelete={onDelete}
              />
            );
          })}
        </ul>
      )}

      <div className="backup">
        <p className="backup__title">{strings.backup.title}</p>
        <p className="backup__note">{strings.backup.note}</p>
        <div className="backup__actions">
          <button type="button" className="btn btn--sm" onClick={handleBackup}>
            {strings.backup.download}
          </button>
          <label className="btn btn--sm btn--ghost">
            {strings.backup.restore}
            <input
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              onChange={handleRestore}
            />
          </label>
        </div>
        {notice ? <p className="backup__notice">{notice}</p> : null}
      </div>
    </section>
  );
}

