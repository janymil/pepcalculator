import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { SYRINGE_TYPES, unitsPerMlOf, type SyringeTypeId } from '../lib/calc';
import { convertMass, fromClicks, fromMl, fromUnits } from '../lib/convert';
import { fmt, parseNumber } from '../lib/format';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

/** Which way the draw row is read. */
type DrawInput = 'ml' | 'units' | 'clicks';

/**
 * A small, always-available converter for the figures people get wrong in their
 * heads: mg ↔ mcg, and one draw expressed in mL, syringe graduations and dial
 * clicks at once.
 *
 * It deliberately has **no IU row**: an IU is a biological activity, not a mass,
 * so there is no factor to convert with — see `unitFamily` in `lib/calc.ts`.
 */
export function UnitConverter() {
  const { strings } = useI18n();
  const copy = strings.tools;

  const [mass, setMass] = useState('2500');
  const [massUnit, setMassUnit] = useState<'mg' | 'mcg'>('mcg');
  const massValues = convertMass(parseNumber(mass), massUnit);

  const [scale, setScale] = useState<SyringeTypeId>('U100');
  const [clicksPerMl, setClicksPerMl] = useState('100');
  const [drawFrom, setDrawFrom] = useState<DrawInput>('ml');
  const [draw, setDraw] = useState('0.25');

  const unitsPerMl = unitsPerMlOf(scale);
  const clicks = parseNumber(clicksPerMl);
  const value = parseNumber(draw);
  const converted =
    drawFrom === 'ml'
      ? fromMl(value, unitsPerMl, clicks > 0 ? clicks : undefined)
      : drawFrom === 'units'
        ? fromUnits(value, unitsPerMl, clicks > 0 ? clicks : undefined)
        : fromClicks(value, clicks > 0 ? clicks : 100, unitsPerMl);

  const massOptions: SegmentedOption<'mg' | 'mcg'>[] = [
    { value: 'mg', label: strings.units.mg },
    { value: 'mcg', label: strings.units.mcg },
  ];
  const drawOptions: SegmentedOption<DrawInput>[] = [
    { value: 'ml', label: strings.units.ml },
    { value: 'units', label: strings.results.unitsWord },
    { value: 'clicks', label: strings.results.clicksWord },
  ];
  const scaleOptions: SegmentedOption<SyringeTypeId>[] = SYRINGE_TYPES.map((type) => ({
    value: type.id,
    label: type.label,
  }));

  return (
    <div className="converter">
      <p className="converter__title">{copy.title}</p>
      <p className="converter__subtitle">{copy.subtitle}</p>

      <div className="converter__row">
        <span className="converter__label">{copy.mass}</span>
        <input
          className="field__input converter__input"
          type="text"
          inputMode="decimal"
          value={mass}
          aria-label={copy.mass}
          onChange={(event) => setMass(event.target.value)}
        />
        <SegmentedControl
          ariaLabel={copy.mass}
          size="sm"
          options={massOptions}
          value={massUnit}
          onChange={setMassUnit}
        />
        <span className="converter__out">
          = {fmt.mass(massValues.mg)} {strings.units.mg} · {fmt.mass(massValues.mcg)}{' '}
          {strings.units.mcg}
        </span>
      </div>

      <div className="converter__row">
        <span className="converter__label">{copy.draw}</span>
        <input
          className="field__input converter__input"
          type="text"
          inputMode="decimal"
          value={draw}
          aria-label={copy.draw}
          onChange={(event) => setDraw(event.target.value)}
        />
        <SegmentedControl
          ariaLabel={copy.draw}
          size="sm"
          options={drawOptions}
          value={drawFrom}
          onChange={setDrawFrom}
        />
        <span className="converter__out">
          = {fmt.volume(converted.ml)} {strings.units.ml} · {fmt.units(converted.units)}{' '}
          {strings.results.unitsWord}
          {converted.clicks === null
            ? ''
            : ` · ${fmt.count(converted.clicks)} ${strings.results.clicksWord}`}
        </span>
      </div>

      <div className="converter__row converter__row--sub">
        {/* Both readings are always shown side by side, so both inputs are
            always relevant, whichever way the value above is given. */}
        <label className="converter__field">
          <span className="field__label">{strings.fields.syringeType.label}</span>
          <SegmentedControl
            ariaLabel={strings.fields.syringeType.label}
            size="sm"
            options={scaleOptions}
            value={scale}
            onChange={setScale}
          />
        </label>

        <label className="converter__field">
          <span className="field__label">{strings.fields.clicksPerMl.label}</span>
          <input
            className="field__input converter__input"
            type="text"
            inputMode="numeric"
            value={clicksPerMl}
            aria-label={strings.fields.clicksPerMl.label}
            onChange={(event) => setClicksPerMl(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
