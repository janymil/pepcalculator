import type { ReactNode } from 'react';

/**
 * A tiny, dependency-free icon set.
 *
 * The project ships **only react + react-dom** at runtime, so instead of pulling
 * in an icon library we hand-roll the handful of stroke icons the UI needs (the
 * same approach as `SyringeVisual`). Icons are 24×24, `currentColor`, and
 * `aria-hidden` unless an accessible `label` is supplied.
 */
export type IconName =
  | 'sun'
  | 'moon'
  | 'pill'
  | 'calculator'
  | 'flask'
  | 'calendar'
  | 'book'
  | 'settings'
  | 'dna'
  | 'syringe'
  | 'alert'
  | 'error'
  | 'info'
  | 'close'
  | 'check'
  | 'swap'
  | 'chevronLeft'
  | 'chevronRight'
  | 'plus'
  | 'reset'
  | 'search'
  | 'trash'
  | 'edit'
  | 'download'
  | 'upload'
  | 'copy'
  | 'bell'
  | 'shield'
  | 'sparkles';

const PATHS: Record<IconName, ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  pill: (
    <>
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" />
      <path d="M8.5 15.5l7-7" />
    </>
  ),
  calculator: (
    <>
      <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
      <path d="M8 6.5h8" />
      <path d="M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M16 14.5h.01M8 18h.01M12 18h.01M16 18h.01" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6" />
      <path d="M10 3v5.6a2 2 0 0 1-.3 1L5.2 18a2 2 0 0 0 1.7 3h10.2a2 2 0 0 0 1.7-3l-4.5-8.4a2 2 0 0 1-.3-1V3" />
      <path d="M7 14h10" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5Z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </>
  ),
  dna: (
    <>
      <path d="M8 3c0 4.5 8 4.5 8 9s-8 4.5-8 9" />
      <path d="M16 3c0 4.5-8 4.5-8 9s8 4.5 8 9" />
      <path d="M9 7h6M9 17h6" />
    </>
  ),
  syringe: (
    <>
      <path d="M17 3l4 4M19 5 9.5 14.5M14 7l3 3" />
      <path d="m9.5 14.5-2.5 2.5h-2v-2l2.5-2.5zM2 22l2.5-2.5" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6M9 9l6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M20 6 9 17l-5-5" />,
  swap: (
    <>
      <path d="M7 4 3 8l4 4M3 8h13a4 4 0 0 1 4 4" />
      <path d="m17 20 4-4-4-4M21 16H8a4 4 0 0 1-4-4" />
    </>
  ),
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  reset: (
    <>
      <path d="M3 12a9 9 0 1 0 2.6-6.4" />
      <path d="M3 4v5h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6h16M9 6V4h6v2M6 6l1 15h10l1-15" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m0 0 5-5m-5 5-5-5" />
      <path d="M5 21h14" />
    </>
  ),
  upload: (
    <>
      <path d="M12 21V9m0 0 5 5m-5-5-5 5" />
      <path d="M5 3h14" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5Z" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </>
  ),
  shield: <path d="M12 22s8-3.7 8-10V5.5l-8-3-8 3V12c0 6.3 8 10 8 10Z" />,
  sparkles: (
    <>
      <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7Z" />
      <path d="m18.5 15.5.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  /** Pixel size (square). Defaults to 20. */
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** When set, the icon becomes visible to assistive tech with this label. */
  label?: string;
}

export function Icon({ name, size = 20, strokeWidth = 1.75, className, label }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
