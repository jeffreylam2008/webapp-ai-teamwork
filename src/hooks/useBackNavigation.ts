'use client';

import { useCallback, useEffect, useRef } from 'react';

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Mirrors the page's main Back action: browser Back, Alt+←, Cmd+←, and Backspace (when not in an input).
 * Pass the same callback your Back button uses (e.g. router.push or opening a discard modal).
 */
export function useBackNavigation(onNavigate: () => void): () => void {
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const goBack = useCallback(() => {
    onNavigateRef.current();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      onNavigateRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        onNavigateRef.current();
        return;
      }
      if (e.metaKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        onNavigateRef.current();
        return;
      }
      if (e.key === 'Backspace' && !isEditableTarget(e.target)) {
        e.preventDefault();
        onNavigateRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return goBack;
}
