import type { SalesReportGroupBy } from '@/app/reports/sales/groupBy';

function buildPrintWindowFeatures(): string {
  const width = window.screen.availWidth;
  const height = window.screen.availHeight;
  return `popup=yes,width=${width},height=${height},left=0,top=0,scrollbars=yes,resizable=yes`;
}

const PRINT_WINDOW_NAME = 'salesReportPrintPreview';

export type SalesReportPrintParams = {
  startDate?: string;
  endDate?: string;
  shopCode?: string;
  shopLabel?: string;
  groupBy: SalesReportGroupBy;
  lang?: string | null;
};

/**
 * Open a printable sales report in a new popup window using current filter selection.
 */
export function openSalesReportPrintWindow(params: SalesReportPrintParams): Window | null {
  if (typeof window === 'undefined') return null;

  const qs = new URLSearchParams();
  if (params.startDate) qs.set('start_date', params.startDate);
  if (params.endDate) qs.set('end_date', params.endDate);
  if (params.shopCode) qs.set('shop_code', params.shopCode);
  if (params.shopLabel) qs.set('shop_label', params.shopLabel);
  qs.set('group_by', params.groupBy);
  if (params.lang) qs.set('lang', params.lang);

  const url = `/reports/sales/print/preview?${qs.toString()}`;
  const popup = window.open(url, PRINT_WINDOW_NAME, buildPrintWindowFeatures());
  if (popup) {
    popup.focus();
  }
  return popup;
}

export function isSalesReportPrintPopupBlocked(popup: Window | null): boolean {
  return popup == null;
}
