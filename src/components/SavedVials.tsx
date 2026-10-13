import { useMemo, useState, type ChangeEvent } from 'react';
import { LOCALES, interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { STORAGE_KEYS } from '../config/defaults';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { backupFileName, decryptBackup, encryptBackup, isEncryptedBackup, parseBackup, serializeBackup } from '../lib/backup';
import { daysBetween } from '../lib/dates';
import { fmt, formatDate } from '../lib/format';
import type { Measurement } from '../lib/measure';
import { vialOwnerId, type Owner } from '../lib/owners';
import { viewVial } from '../lib/shares';
import { TIMES_PER_DAY_PRESETS, type VialSchedule } from '../lib/schedule';
import { buildSupply } from '../lib/supply';
import {
  filterVialsByKind,
  searchVials,
  sortVials,
  vialKind,
  vialStatus,
  type KindFilter,
  type SavedVial,
  type VialSort,
} from '../lib/vials';
import { vialColor, vialDotStyle } from '../lib/vialColors';
import { KindFilterControl } from './KindFilterControl';
import { Icon } from './Icon';
import { SupplyPanel } from './SupplyPanel';
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

/** True when the file's text is a passphrase-protected envelope. */
function looksEncrypted(text: string): boolean {
  try {
    return isEncryptedBackup(JSON.parse(text));
  } catch {
    return false;
  }
}

interface SavedVialsProps {
  /** Live vials (all kinds) for the selected person — tombstones filtered out. */
  vials: SavedVial[];
  /** The people, so a backup keeps the stacks separate. */
  owners: Owner[];
  /** The person reading this page — a shared bottle shows *their* plan. */
  viewerId: string;
  /**
   * The body-measurement log, so a backup carries it and a restore brings it
   * back. Optional: the backup is the only feature on this page that uses it.
   */
  measurements?: Measurement[];
  /**
   * **Everything on the device**, for the backup — not the person on screen.
   *
   * `vials` is scoped to the selected person because that is what the page
   * lists, but a backup that contained only them silently lost the rest on a new
   * device (the owner list travelled, their vials did not). Defaults to `vials`
   * for a caller that really does mean everything.
   */
  allVials?: SavedVial[];
  /** The whole measurement log, for the same reason. Defaults to `measurements`. */
  allMeasurements?: Measurement[];
  todayIso: string;
  nowTime: string;
  onUpdate: (vial: SavedVial) => void;
  onRestore: (vials: SavedVial[], owners: Owner[], measurements: Measurement[]) => void;
  onLoad: (vial: SavedVial) => void;
  onAddDose: (id: string) => void;
  onRemoveDose: (id: string) => void;
  onDelete: (id: string) => void;
  /** Jumps to the calculator from the empty state. */
  onGoToCalculator?: () => void;
  /** Opens the GLP-1 care page from a GLP-1 vial card. */
  onOpenGlp1?: () => void;
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
  onOpenGlp1,
  viewerId,
}: {
  vial: SavedVial;
  locale: string;
  onLoad: (vial: SavedVial) => void;
  onEdit: (vial: SavedVial) => void;
  onAddDose: (id: string) => void;
  onRemoveDose: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenGlp1?: () => void;
  /** The person reading this card — a sharer reads the bottle, never edits it. */
  viewerId: string;
}) {
  const { strings } = useI18n();
  const view = viewVial(vial, viewerId);
  const ownedByViewer = vialOwnerId(vial) === viewerId;
  const status = vialStatus(view);
  const kind = vialKind(vial);
  const anabolic = kind === 'anabolic';
  const color = vialColor(vial.id);
  /** Base unit of this vial's family — mg for mass, IU for an HGH/HCG vial. */
  const baseUnit = vial.vialUnit === 'IU' ? strings.units.IU : strings.units.mg;

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
          <span className="vial__dot" style={{ backgroundColor: color, ...vialDotStyle(vial.id) }} aria-hidden="true" />
          {vial.name || strings.vials.untitled}
        </h3>
        <span className={`vial__kind vial__kind--${kind}`}>{strings.kinds[kind]}</span>
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
            {fmt.concentration(status.concentrationPerMl)} {baseUnit}/{strings.units.ml}
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
        <button type="button" className="btn btn--sm" onClick={() => onLoad(view)}>
          {strings.vials.load}
        </button>
        {/* A sharer reads this bottle and draws from it; they never rewrite it. */}
        {ownedByViewer ? (
          <>
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
          </>
        ) : null}
        {kind === 'glp1' && onOpenGlp1 ? (
          <button type="button" className="btn btn--sm btn--ghost" onClick={onOpenGlp1}>
            {strings.glp1.openPage}
          </button>
        ) : null}
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
  owners,
  viewerId,
  measurements = [],
  allVials,
  allMeasurements,
  todayIso,
  nowTime,
  onUpdate,
  onRestore,
  onLoad,
  onAddDose,
  onRemoveDose,
  onDelete,
  onGoToCalculator,
  onOpenGlp1,
}: SavedVialsProps) {
  const { lang, strings } = useI18n();
  const [filter, setFilter] = useLocalStorage<KindFilter>(STORAGE_KEYS.kindFilter, 'all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<VialSort>('newest');
  const [lastBackup, setLastBackup] = useLocalStorage<string>(STORAGE_KEYS.lastBackup, '');
  const [passphrase, setPassphrase] = useState('');

  const visible = sortVials(searchVials(filterVialsByKind(vials, filter), query), sort, todayIso);

  // The stack-level outlook for the selected person, computed once per render.
  const supply = useMemo(
    () => buildSupply(vials, todayIso, nowTime, viewerId),
    [vials, todayIso, nowTime, viewerId],
  );
  const supplyById = useMemo(
    () => new Map(supply.vials.map((row) => [row.vial.id, row])),
    [supply],
  );

  /**
   * Vials that share a name but not a concentration.
   *
   * This is the classic home mix-up: two bottles of the same peptide, one mixed
   * with 1 mL and one with 2 mL. The numbers on the card are then different for
   * what looks like the same thing, so flag every vial in such a group rather
   * than letting the user read the wrong one.
   */
  const ratioOutliers = useMemo(() => {
    const concentrationOf = (vial: SavedVial): number =>
      Number(vialStatus(vial, todayIso).concentrationPerMl.toFixed(4));

    const byName = new Map<string, Set<number>>();
    for (const vial of vials) {
      const name = (vial.name || '').trim().toLowerCase();
      if (name === '') continue;
      const concentration = concentrationOf(vial);
      if (!(concentration > 0)) continue;
      const seen = byName.get(name) ?? new Set<number>();
      seen.add(concentration);
      byName.set(name, seen);
    }

    const flagged = new Set<string>();
    for (const vial of vials) {
      const name = (vial.name || '').trim().toLowerCase();
      if (name === '') continue;
      if ((byName.get(name)?.size ?? 0) > 1) flagged.add(vial.id);
    }
    return flagged;
  }, [vials, todayIso]);

  /** Whole days since the last backup, or null when there has never been one. */
  const backupAge = lastBackup ? daysBetween(lastBackup.slice(0, 10), todayIso) : null;

  /**
   * There is nothing to print until at least one vial has a plan — the sheet
   * would come out saying so. Better to disable the button than to send the user
   * to the printer for a blank page.
   */
  const canPrint = vials.some((vial) => vial.schedule !== undefined);

  const handleSaveEdit = (updated: SavedVial) => {
    onUpdate(updated);
    setEditingId(null);
  };

  /** Downloads every saved vial as a JSON file — encrypted when a passphrase is set. */
  const handleBackup = async () => {
    // Everyone and everything: a backup is a copy of the device, not of the
    // person whose stack happens to be on screen.
    const plain = serializeBackup(
      allVials ?? vials,
      new Date().toISOString(),
      owners,
      allMeasurements ?? measurements,
    );

    let text = plain;
    if (passphrase !== '') {
      try {
        text = await encryptBackup(plain, passphrase);
      } catch {
        // Only reachable when WebCrypto is unavailable (a plain-http origin).
        setNotice(strings.backup.errorNoCrypto);
        return;
      }
    }

    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName(todayIso);
    link.click();
    URL.revokeObjectURL(url);
    setLastBackup(todayIso);
    setNotice(strings.backup.done);
  };

  /** Reads a backup file and merges it in (never deletes what is there). */
  const handleRestore = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    void file.text().then(async (text) => {
      // An encrypted backup has to be opened before it can be parsed, so this
      // step comes first — and a missing passphrase is reported, not guessed.
      let readable = text;
      if (looksEncrypted(text)) {
        if (passphrase === '') {
          setNotice(strings.backup.errorEncrypted);
          return;
        }
        const opened = await decryptBackup(text, passphrase);
        if (!opened.ok) {
          setNotice(
            opened.reason === 'badPassphrase'
              ? strings.backup.errorWrongPassphrase
              : opened.reason === 'noCrypto'
                ? strings.backup.errorNoCrypto
                : strings.backup.errorNotABackup,
          );
          return;
        }
        readable = opened.text;
      }

      const result = parseBackup(readable);
      if (result.ok) {
        onRestore(result.vials, result.owners, result.measurements);
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
      <div className="vials__head">
        <h2 className="card__title" id="vials-title">
          {strings.vials.title}
        </h2>
        {/*
         * Printing used to be a ghost button at the very bottom of this page,
         * inside the *backup* card — the last place anyone would look for a
         * protocol, and the easiest thing on the page to miss. It is a
         * first-class action, so it sits in the header with a label that says
         * exactly what comes out of the printer.
         */}
        <button
          type="button"
          className="btn btn--sm btn--accent vials__print"
          disabled={!canPrint}
          onClick={() => window.print()}
        >
          <Icon name="print" size={16} />
          {strings.print.action}
        </button>
      </div>

      <SupplyPanel summary={supply} />

      <div className="vials__toolbar">
        <KindFilterControl value={filter} onChange={setFilter} />
        <label className="vials__search">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            placeholder={strings.vials.search}
            aria-label={strings.vials.search}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="vials__sort">
          <span className="visually-hidden">{strings.vials.sortLabel}</span>
          <select
            className="vials__sort-select"
            value={sort}
            aria-label={strings.vials.sortLabel}
            onChange={(event) => setSort(event.target.value as VialSort)}
          >
            <option value="newest">{strings.vials.sortNewest}</option>
            <option value="name">{strings.vials.sortName}</option>
            <option value="expiry">{strings.vials.sortExpiry}</option>
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <span className="empty__icon" aria-hidden="true">
            <Icon name="flask" size={26} />
          </span>
          <p className="empty__title">{strings.vials.empty}</p>
          <p className="empty__hint">{strings.vials.emptyHint}</p>
          {onGoToCalculator ? (
            <button type="button" className="btn btn--sm btn--accent empty__cta" onClick={onGoToCalculator}>
              {strings.emptyCta.goToCalculator}
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="vials">
          {visible.map((vial) => {
            // Only the bottle's owner can be editing it — a sharer has no edit
            // button, and this guard means a stale `editingId` cannot become one.
            if (vial.id === editingId && vialOwnerId(vial) === viewerId) {
              return (
                <li className="vial" key={vial.id}>
                  <VialEditor
                    vial={vial}
                    fallbackSchedule={INITIAL_SCHEDULE}
                    owners={owners}
                    todayIso={todayIso}
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
                supply={supplyById.get(vial.id)}
                ratioMismatch={ratioOutliers.has(vial.id)}
                onOpenGlp1={onOpenGlp1}
                owners={owners}
                viewerId={viewerId}
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
                onOpenGlp1={onOpenGlp1}
                viewerId={viewerId}
              />
            );
          })}
        </ul>
      )}

      <div className="backup">
        <p className="backup__title">{strings.backup.title}</p>
        <p className="backup__note">{strings.backup.note}</p>
        <p className="backup__note">{strings.backup.scope}</p>
        <p className="backup__notice">
          {lastBackup
            ? interpolate(strings.backup.lastAt, { when: formatDate(lastBackup.slice(0, 10), LOCALES[lang]) })
            : strings.backup.never}
        </p>
        {backupAge !== null && backupAge >= 30 ? (
          <p className="backup__notice backup__notice--warn">
            {interpolate(strings.backup.nudge, { days: backupAge })}
          </p>
        ) : null}

        <label className="backup__passphrase">
          <span className="field__label">{strings.backup.passphrase}</span>
          <input
            className="field__input"
            type="password"
            value={passphrase}
            autoComplete="new-password"
            onChange={(event) => setPassphrase(event.target.value)}
          />
          <span className="backup__hint">{strings.backup.passphraseHint}</span>
        </label>
        <div className="backup__actions">
          <button type="button" className="btn btn--sm" onClick={() => void handleBackup()}>
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

