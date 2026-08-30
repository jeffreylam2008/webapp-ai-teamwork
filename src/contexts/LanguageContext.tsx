'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  type AppLanguage,
  DEFAULT_APP_LANGUAGE,
  cacheAppLanguage,
  getCachedAppLanguage,
  getPreferredAppLanguage,
  resolveAppLanguage,
} from '@/lib/i18n/language';

type LanguageContextValue = {
  language: AppLanguage;
  ready: boolean;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function readInitialLanguage(): AppLanguage {
  return getCachedAppLanguage() ?? DEFAULT_APP_LANGUAGE;
}

function readInitialReady(): boolean {
  return getCachedAppLanguage() != null;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(readInitialLanguage);
  const [ready, setReady] = useState<boolean>(readInitialReady);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const preferred = await getPreferredAppLanguage();
      if (cancelled) return;
      setLanguage(preferred);
      setReady(true);
      cacheAppLanguage(preferred);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onLanguageChanged = (event: Event) => {
      const detail = (event as CustomEvent<AppLanguage | string | undefined>).detail;
      if (!detail) return;
      const next = resolveAppLanguage(typeof detail === 'string' ? detail : detail);
      setLanguage(next);
      setReady(true);
      cacheAppLanguage(next);
    };

    window.addEventListener('app-language-changed', onLanguageChanged);
    return () => window.removeEventListener('app-language-changed', onLanguageChanged);
  }, []);

  const value = useMemo(() => ({ language, ready }), [language, ready]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useAppLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useAppLanguage must be used within a LanguageProvider');
  }
  return context;
}
