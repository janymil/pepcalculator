import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon, type IconName } from './Icon';

const NAMES: IconName[] = [
  'sun',
  'moon',
  'pill',
  'person',
  'calculator',
  'flask',
  'calendar',
  'book',
  'settings',
  'dna',
  'syringe',
  'alert',
  'error',
  'info',
  'close',
  'check',
  'swap',
  'chevronLeft',
  'chevronRight',
  'plus',
  'reset',
  'search',
  'trash',
  'edit',
  'download',
  'upload',
  'copy',
  'bell',
  'shield',
  'sparkles',
];

describe('Icon', () => {
  it('renders a decorative svg by default', () => {
    const html = renderToString(<Icon name="pill" />);
    expect(html).toContain('<svg');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('stroke="currentColor"');
  });

  it('exposes itself to assistive tech when given a label', () => {
    const html = renderToString(<Icon name="bell" label="Reminders" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Reminders"');
    expect(html).not.toContain('aria-hidden="true"');
  });

  it('sizes itself from the size prop', () => {
    const html = renderToString(<Icon name="moon" size={28} />);
    expect(html).toContain('width="28"');
    expect(html).toContain('height="28"');
  });

  it('draws every icon in the set', () => {
    for (const name of NAMES) {
      const html = renderToString(<Icon name={name} />);
      expect(html.length).toBeGreaterThan(60);
    }
  });
});
