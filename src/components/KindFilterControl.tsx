import { useI18n } from '../i18n/I18nContext';
import type { KindFilter } from '../lib/vials';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

interface KindFilterControlProps {
  value: KindFilter;
  onChange: (value: KindFilter) => void;
}

/** "All / Peptides / Anabolics" — shared by the Vials page and the Calendar. */
export function KindFilterControl({ value, onChange }: KindFilterControlProps) {
  const { strings } = useI18n();

  const options: SegmentedOption<KindFilter>[] = [
    { value: 'all', label: strings.kinds.all },
    { value: 'peptide', label: strings.kinds.peptide },
    { value: 'anabolic', label: strings.kinds.anabolic },
    { value: 'hormone', label: strings.kinds.hormone },
  ];

  return (
    <SegmentedControl
      ariaLabel={strings.kinds.label}
      size="sm"
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}
