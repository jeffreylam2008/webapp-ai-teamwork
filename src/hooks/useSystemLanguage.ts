'use client';

import { useEffect, useState } from 'react';
import type { AppLanguage } from '@/lib/i18n/language';
import { getPreferredAppLanguage } from '@/lib/i18n/language';

/**
 * Shared app language loader:
 * query-string override -> global system language -> browser language.
 */
export function useSystemLanguage(queryLang?: string | null): AppLanguage {
  const [lang, setLang] = useState<AppLanguage>('en');

  useEffect(() => {
    const load = async () => {
      const preferred = await getPreferredAppLanguage(queryLang);
      setLang(preferred);
    };
    void load();
  }, [queryLang]);

  useEffect(() => {
    // Keep already-mounted pages in sync with the sidebar language switch.
    // If the page has an explicit query override (?lang=...), respect it.
    if (typeof window === 'undefined') return;

    const onLanguageChanged = (event: Event) => {
      if (!('detail' in event)) return;
      const next = (event as CustomEvent<AppLanguage>).detail;
      if (!next) return;
      if (queryLang) return;
      setLang(next);
      try {
        sessionStorage.setItem('__app_language', next);
      } catch {
        // ignore
      }
    };

    window.addEventListener('app-language-changed', onLanguageChanged);
    return () => window.removeEventListener('app-language-changed', onLanguageChanged);
  }, [queryLang]);

  return lang;
}

