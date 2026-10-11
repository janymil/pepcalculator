import { createContext, useContext, type ReactNode } from 'react';
import type { Lang, Strings } from './types';

export interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  strings: Strings;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  value,
  children,
}: {
  value: I18nValue;
  children: ReactNode;
}) {
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the active language and its dictionary from any component. */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
