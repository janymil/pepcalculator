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

/** Tick marks drawn along the barrel (fractions of the capacity). */
const TICKS = [0, 0.25, 0.5, 0.75, 1];

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
          return (
            <line
              key={tick}
              x1={x}
              y1={BARREL_TOP}
              x2={x}
              y2={BARREL_TOP + 9}
              className="syringe__tick"
            />
          );
        })}
      </svg>

      <figcaption className="syringe__caption">
        <strong>{fmt.volume(volumeMl)}</strong> / {fmt.volume(capacityMl)} mL
      </figcaption>
    </figure>
  );
}
