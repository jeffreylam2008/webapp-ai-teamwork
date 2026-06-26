import {
  INVOICE_SUBTYPE_MONTHLY,
  INVOICE_SUBTYPE_STANDARD,
  type InvoiceSubtype,
} from '@/config/invoiceSubtypes';
import { getCurrentSuffix } from '@/utils/transactionUtils';

export type InvoiceModuleMode = 'standard' | 'monthly';

/** Placeholder route segment — invoice number is reserved on save, not at page load. */
export const INVOICE_DRAFT_TRANS_CODE = 'new';

export function isInvoiceDraftTransCode(code: string | undefined | null): boolean {
  return String(code || '').trim().toLowerCase() === INVOICE_DRAFT_TRANS_CODE;
}

export async function reserveInvoiceNumber(sessionId: string): Promise<string> {
  const suffix = getCurrentSuffix();
  const response = await fetch('/api/transaction-generator/next', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: 'INV', suffix, sessionId }),
  });
  const result = (await response.json()) as {
    success: boolean;
    transactionCode?: string;
    error?: string;
  };
  if (!result.success || !result.transactionCode) {
    throw new Error(result.error || 'Failed to generate invoice number');
  }
  return result.transactionCode;
}

export type InvoiceModuleConfig = {
  mode: InvoiceModuleMode;
  isMonthly: boolean;
  basePath: string;
  sessionKey: string;
  cloneKeyPrefix: string;
  invoiceSubtype: InvoiceSubtype;
  menuKey: string;
  breadcrumbKey: 'invoices' | 'monthlyInvoices';
};

export function getInvoiceModuleConfig(mode: InvoiceModuleMode): InvoiceModuleConfig {
  const isMonthly = mode === 'monthly';
  return {
    mode,
    isMonthly,
    basePath: isMonthly ? '/sales/monthly-invoices' : '/sales/invoices',
    sessionKey: isMonthly ? 'monthly_invoice_session_id' : 'invoice_session_id',
    cloneKeyPrefix: isMonthly ? 'monthly_invoice_clone_' : 'invoice_clone_',
    invoiceSubtype: isMonthly ? INVOICE_SUBTYPE_MONTHLY : INVOICE_SUBTYPE_STANDARD,
    menuKey: isMonthly ? 'monthly-invoices' : 'invoices',
    breadcrumbKey: isMonthly ? 'monthlyInvoices' : 'invoices',
  };
}

export function invoiceCreatePath(config: InvoiceModuleConfig, transCode: string): string {
  return `${config.basePath}/create/${encodeURIComponent(transCode)}`;
}

export function invoiceDraftCreatePath(config: InvoiceModuleConfig): string {
  return invoiceCreatePath(config, INVOICE_DRAFT_TRANS_CODE);
}

export function invoiceDetailPath(config: InvoiceModuleConfig, transCode: string): string {
  return `${config.basePath}/detail/${encodeURIComponent(transCode)}`;
}

export function invoicePrintPath(config: InvoiceModuleConfig, transCode: string): string {
  return `${config.basePath}/print/${encodeURIComponent(transCode)}`;
}
