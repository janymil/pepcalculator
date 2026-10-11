import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { COMPOUNDS, formatRange, type CompoundClass, type CompoundReference } from '../lib/reference';
import type { SavedVial } from '../lib/vials';
import { PkChart } from './PkChart';
import { ProtocolPlot } from './ProtocolPlot';
import { UnitConverter } from './UnitConverter';

interface ReferencePageProps {
  /** Live vials, so the user's own plan can be plotted from this page too. */
  vials: SavedVial[];
  todayIso: string;
}

/** Which part of the sheet is open. */
type ReferenceSection = 'compounds' | 'converter' | 'plot';

/**
 * The decay curve for a compound's *typical* dose range — the reference version
 * of the same chart the user can now plot for their own plan.
 */
function DecayChart({ compound, ariaLabel }: { compound: CompoundReference; ariaLabel: string }) {
  // A representative dose: the midpoint of the cited range, converted to mg.
  const midMg = (compound.typicalLowMg + compound.typicalHighMg) / 2;
  const doseMg = compound.unit === 'mcg' ? midMg / 1000 : midMg;
  const intervalHours = compound.halfLifeHours * 4;

  return (
    <PkChart
      schedule={{ doseMg, intervalHours, halfLifeHours: compound.halfLifeHours, doses: 4 }}
      ariaLabel={ariaLabel}
    />
  );
}

/**
 * The Reference sheet: a static, clearly-labelled list of typical starting
 * ranges, half-lives and reconstitution volumes. It never feeds the calculator
 * automatically — it is context, and it always carries the disclaimer.
 */
export function ReferencePage({ vials, todayIso }: ReferencePageProps) {
  const { strings } = useI18n();
  const copy = strings.reference;
  const [klass, setKlass] = useState<CompoundClass>('peptide');
  /**
   * Which part of the sheet is open. The converter and the plot used to sit
   * below the entire compound list, where nobody found them — a page-height
   * scroll away and easy to mistake for the end of the page.
   */
  const [section, setSection] = useState<ReferenceSection>('compounds');

  const rows = COMPOUNDS.filter((compound) => compound.klass === klass);

  const halfLifeLabel = (hours: number): string =>
    hours < 24
      ? `${hours} ${copy.halfLifeUnit}`
      : `${Math.round(hours / 24)} ${copy.halfLifeDaysUnit}`;

  const sections: { id: ReferenceSection; label: string }[] = [
    { id: 'compounds', label: copy.tabCompounds },
    { id: 'converter', label: copy.tabConverter },
    { id: 'plot', label: copy.tabPlot },
  ];

  return (
    <section className="settings" aria-labelledby="reference-title">
      <div className="page-head">
        <h2 className="page-title" id="reference-title">
          {copy.title}
        </h2>
        <p className="page-subtitle">{copy.subtitle}</p>
      </div>

      <div className="ref__tabs ref__tabs--sections">
        {sections.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`btn btn--sm${section === entry.id ? ' btn--accent' : ''}`}
            aria-pressed={section === entry.id}
            onClick={() => setSection(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <p className="ref__disclaimer">{strings.disclaimer.pointOfUse}</p>

      {section === 'converter' ? <UnitConverter /> : null}
      {section === 'plot' ? <ProtocolPlot vials={vials} todayIso={todayIso} /> : null}

        {section === 'compounds' ? (
          <>

        <div className="ref__tabs">
          <button
            type="button"
            className={`btn btn--sm${klass === 'peptide' ? ' btn--accent' : ''}`}
            aria-pressed={klass === 'peptide'}
            onClick={() => setKlass('peptide')}
          >
            {strings.kinds.peptide}
          </button>
          <button
            type="button"
            className={`btn btn--sm${klass === 'anabolic' ? ' btn--accent' : ''}`}
            aria-pressed={klass === 'anabolic'}
            onClick={() => setKlass('anabolic')}
          >
            {strings.kinds.anabolic}
          </button>
        </div>

        <ul className="ref__list">
          {rows.map((compound) => (
            <li className="ref__row" key={compound.id}>
              <div className="ref__head">
                <h3 className="ref__name">{compound.name}</h3>
                <span className="ref__range">
                  {copy.typical}: <strong>{formatRange(compound)}</strong>
                </span>
              </div>

              <dl className="ref__facts">
                <div>
                  <dt>{copy.cadence}</dt>
                  <dd>{compound.cadence}</dd>
                </div>
                <div>
                  <dt>{copy.halfLife}</dt>
                  <dd>{halfLifeLabel(compound.halfLifeHours)}</dd>
                </div>
                {compound.commonWaterMl.length > 0 ? (
                  <div>
                    <dt>{copy.water}</dt>
                    <dd>{compound.commonWaterMl.join(' / ')} {strings.units.ml}</dd>
                  </div>
                ) : null}
              </dl>

              <DecayChart
                compound={compound}
                ariaLabel={`${copy.halfLife}: ${compound.name}`}
              />
            </li>
          ))}
        </ul>

        <p className="ref__note">{copy.note}</p>
        </>
      ) : null}
    </section>
  );
}
