/** Query flag for template-only print popup (no toolbar, auto print dialog). */
export const PRINT_BARE_QUERY = 'bare';

export function isBarePrintMode(searchParams: URLSearchParams | { get: (key: string) => string | null }): boolean {
  return searchParams.get(PRINT_BARE_QUERY) === '1';
}

/** Build URL for the bare print popup from the current preview URL. */
export function buildBarePrintUrl(previewUrl: string): string {
  const url = new URL(previewUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  url.searchParams.set(PRINT_BARE_QUERY, '1');
  return url.toString();
}

export const PRINT_POPUP_FEATURES = 'width=820,height=900,scrollbars=yes';

export function openBarePrintWindow(previewUrl: string): void {
  window.open(buildBarePrintUrl(previewUrl), '_blank', PRINT_POPUP_FEATURES);
}

/** Close a print preview popup opened via window.open(); fallback if the browser blocks close. */
export function closePrintPreviewWindow(fallback?: () => void): void {
  window.close();
  window.setTimeout(() => {
    if (!window.closed) {
      if (window.history.length > 1) {
        window.history.back();
      } else if (fallback) {
        fallback();
      }
    }
  }, 150);
}
