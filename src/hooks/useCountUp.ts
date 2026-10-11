import { useEffect, useRef, useState } from 'react';

/** True when the user has asked the OS to reduce motion. */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Eases a number towards `target` for a short "tick up" on the headline value.
 *
 * SSR/test safe: the **first** render returns `target` unchanged, so server
 * rendering and `renderToString` tests always see the real number. Only later
 * changes animate — and `prefers-reduced-motion` skips the animation entirely.
 */
export function useCountUp(target: number, durationMs = 420): number {
  const [value, setValue] = useState(target);
  const previous = useRef(target);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      previous.current = target;
      setValue(target);
      return;
    }

    if (!Number.isFinite(target) || prefersReducedMotion()) {
      previous.current = target;
      setValue(target);
      return;
    }

    const from = previous.current;
    const delta = target - from;
    if (delta === 0) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      setValue(from + delta * eased);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
      else previous.current = target;
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}
