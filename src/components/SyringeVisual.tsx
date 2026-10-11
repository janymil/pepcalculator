import { fmt } from '../lib/format';

interface SyringeVisualProps {
  volumeMl: number;
  capacityMl: number;
  ariaLabel: string;
}

const BARREL_LEFT = 96;
const BARREL_RIGHT = 300;
const BARREL_TOP = 16;
const BARREL_BOTTOM = 74;
const BARREL_WIDTH = BARREL_RIGHT - BARREL_LEFT;

/** Graduations along the barrel: eighths, with every quarter a longer "major". */
const TICKS = Array.from({ length: 9 }, (_, index) => index / 8);

/** A tick is "major" at 0, 1/4, 1/2, 3/4 and 1 (float-tolerant). */
function isMajorTick(tick: number): boolean {
  return Math.abs(tick * 4 - Math.round(tick * 4)) < 1e-9;
}

/**
 * A friendly syringe illustration that fills proportionally to the calculated
 * volume. Purely decorative-but-informative: it gives an instant visual sense
 * of "how full" the syringe should be.
 */
export function SyringeVisual({ volumeMl, capacityMl, ariaLabel }: SyringeVisualProps) {
  const fraction = capacityMl > 0 ? Math.min(Math.max(volumeMl / capacityMl, 0), 1) : 0;
  const overflow = capacityMl > 0 && volumeMl > capacityMl;
  const fillWidth = fraction * BARREL_WIDTH;
  const plungerX = BARREL_RIGHT - fillWidth;

  return (
    <figure className="syringe" role="img" aria-label={ariaLabel}>
      <svg viewBox="0 0 340 90" className="syringe__svg" focusable="false" aria-hidden="true">
        <defs>
          <linearGradient id="pepcalc-liquid" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.95" />
          </linearGradient>
        </defs>

        {/* needle + hub */}
        <rect x="300" y="42" width="34" height="4" rx="2" className="syringe__needle" />
        <polygon points="292,34 300,38 300,52 292,56" className="syringe__hub" />

        {/* barrel body (background) */}
        <rect
          x={BARREL_LEFT}
          y={BARREL_TOP}
          width={BARREL_WIDTH}
          height={BARREL_BOTTOM - BARREL_TOP}
          rx="8"
          className="syringe__barrel"
        />

        {/* liquid between the plunger and the needle */}
        {fillWidth > 0 ? (
          <rect
            x={plungerX}
            y={BARREL_TOP + 2}
            width={fillWidth}
            height={BARREL_BOTTOM - BARREL_TOP - 4}
            fill="url(#pepcalc-liquid)"
            className={overflow ? 'syringe__liquid is-overflow' : 'syringe__liquid'}
          />
        ) : null}

        {/* plunger rod + seal + thumb rest */}
        <rect x="30" y="41" width={Math.max(plungerX - 30, 0)} height="8" rx="2" className="syringe__rod" />
        <rect
          x={plungerX - 8}
          y={BARREL_TOP + 2}
          width="8"
          height={BARREL_BOTTOM - BARREL_TOP - 4}
          rx="3"
          className="syringe__plunger"
        />
        <rect x="18" y="8" width="10" height="74" rx="5" className="syringe__thumb" />

        {/* barrel outline drawn on top so it stays crisp */}
        <rect
          x={BARREL_LEFT}
          y={BARREL_TOP}
          width={BARREL_WIDTH}
          height={BARREL_BOTTOM - BARREL_TOP}
          rx="8"
          className="syringe__outline"
        />

        {/* graduations */}
        {TICKS.map((tick) => {
          const x = BARREL_LEFT + tick * BARREL_WIDTH;
          const major = isMajorTick(tick);
          return (
            <line
              key={tick}
              x1={x}
              y1={BARREL_TOP}
              x2={x}
              y2={BARREL_TOP + (major ? 12 : 7)}
              className={major ? 'syringe__tick' : 'syringe__tick syringe__tick--minor'}
            />
          );
        })}

        {/* target marker: exactly where the plunger should sit */}
        <line
          x1={plungerX}
          y1={BARREL_TOP - 5}
          x2={plungerX}
          y2={BARREL_BOTTOM + 5}
          className="syringe__target"
        />
      </svg>

      <figcaption className="syringe__caption">
        <strong>{fmt.volume(volumeMl)}</strong> / {fmt.volume(capacityMl)} mL
      </figcaption>
    </figure>
  );
}
