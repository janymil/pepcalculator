import { useEffect, useState } from 'react';

/**
 * A `useState` that mirrors its value into localStorage, so the user's numbers
 * survive a page reload. Every storage call is wrapped in try/catch because
 * storage can be unavailable (private windows, disabled cookies, ...).
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore — the app still works, it just won't remember this value */
    }
  }, [key, value]);

  return [value, setValue];
}
