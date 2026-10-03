'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useBackNavigation } from '@/hooks/useBackNavigation';

type Href = string | { pathname: string };

function hrefToString(href: Href): string {
  return typeof href === 'string' ? href : href.pathname;
}

type UseLeavePageGuardOptions = {
  router: AppRouterInstance;
  allowNavigationRef: MutableRefObject<boolean>;
  pendingNavigateRef: MutableRefObject<string | null>;
  /** Warn only after a transaction number exists. */
  hasTransactionNumber: boolean;
  fallbackPath: string;
  onWarn: () => void;
  onLeaveWithoutNumber?: () => void | Promise<void>;
};

/**
 * Intercepts menu, in-app links, and Back. Skips the leave/discard warning
 * until a transaction number has been generated.
 */
export function useLeavePageGuard({
  router,
  allowNavigationRef,
  pendingNavigateRef,
  hasTransactionNumber,
  fallbackPath,
  onWarn,
  onLeaveWithoutNumber,
}: UseLeavePageGuardOptions): () => void {
  const hasNumberRef = useRef(hasTransactionNumber);
  hasNumberRef.current = hasTransactionNumber;
  const onWarnRef = useRef(onWarn);
  onWarnRef.current = onWarn;
  const onLeaveRef = useRef(onLeaveWithoutNumber);
  onLeaveRef.current = onLeaveWithoutNumber;
  const fallbackRef = useRef(fallbackPath);
  fallbackRef.current = fallbackPath;

  const leaveWithoutWarning = (href: string, navigate: (to: string) => void) => {
    void Promise.resolve(onLeaveRef.current?.()).finally(() => {
      allowNavigationRef.current = true;
      navigate(href);
    });
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const { href } = (e as CustomEvent<{ href: string }>).detail;
      if (!href) return;
      if (!hasNumberRef.current) {
        leaveWithoutWarning(href, (to) => router.push(to));
        return;
      }
      pendingNavigateRef.current = href;
      onWarnRef.current();
    };
    window.addEventListener('app-navigate-request', handler);
    return () => window.removeEventListener('app-navigate-request', handler);
  }, [router, allowNavigationRef, pendingNavigateRef]);

  useEffect(() => {
    const originalPush = router.push.bind(router) as typeof router.push;
    const originalReplace = router.replace.bind(router) as typeof router.replace;

    const intercept = (
      original: typeof originalPush,
      href: Href,
      options?: { scroll?: boolean }
    ) => {
      if (allowNavigationRef.current) {
        allowNavigationRef.current = false;
        return original(href as Parameters<typeof originalPush>[0], options);
      }
      const hrefString = hrefToString(href);
      if (
        typeof window === 'undefined' ||
        hrefString === window.location.pathname ||
        hrefString.startsWith('#')
      ) {
        return original(href as Parameters<typeof originalPush>[0], options);
      }
      if (!hasNumberRef.current) {
        void Promise.resolve(onLeaveRef.current?.()).finally(() => {
          original(href as Parameters<typeof originalPush>[0], options);
        });
        return Promise.resolve(undefined as void);
      }
      pendingNavigateRef.current = hrefString;
      onWarnRef.current();
      return Promise.resolve(undefined as void);
    };

    router.push = (href, options) =>
      intercept(originalPush, href as Href, options);
    router.replace = (href, options) =>
      intercept(originalReplace, href as Href, options);

    return () => {
      router.push = originalPush;
      router.replace = originalReplace;
    };
  }, [router, allowNavigationRef, pendingNavigateRef]);

  return useBackNavigation(() => {
    if (!hasNumberRef.current) {
      leaveWithoutWarning(fallbackRef.current, (to) => router.push(to));
      return;
    }
    pendingNavigateRef.current = fallbackRef.current;
    onWarnRef.current();
  });
}
