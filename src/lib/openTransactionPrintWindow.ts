function buildPrintWindowFeatures(): string {
  const width = window.screen.availWidth;
  const height = window.screen.availHeight;
  return `popup=yes,width=${width},height=${height},left=0,top=0,scrollbars=yes,resizable=yes`;
}

const PRINT_WINDOW_NAME = 'transactionPrintPreview';

/**
 * Open a dedicated print preview page in a new popup window.
 * Detail pages should call this instead of navigating in the same tab.
 */
export function openTransactionPrintWindow(
  printPath: string,
  options?: { lang?: string | null }
): Window | null {
  if (typeof window === 'undefined') return null;

  const base = printPath.startsWith('/') ? printPath : `/${printPath}`;
  let url = base;
  if (options?.lang) {
    const sep = url.includes('?') ? '&' : '?';
    url += `${sep}lang=${encodeURIComponent(options.lang)}`;
  }

  const popup = window.open(url, PRINT_WINDOW_NAME, buildPrintWindowFeatures());
  if (popup) {
    popup.focus();
  }
  return popup;
}

export function isPrintPopupBlocked(popup: Window | null): boolean {
  return popup == null;
}
