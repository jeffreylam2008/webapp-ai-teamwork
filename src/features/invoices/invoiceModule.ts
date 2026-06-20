import {
  INVOICE_SUBTYPE_MONTHLY,
  INVOICE_SUBTYPE_STANDARD,
  type InvoiceSubtype,
} from '@/config/invoiceSubtypes';

export type InvoiceModuleMode = 'standard' | 'monthly';

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

export function invoiceDetailPath(config: InvoiceModuleConfig, transCode: string): string {
  return `${config.basePath}/detail/${encodeURIComponent(transCode)}`;
}

export function invoicePrintPath(config: InvoiceModuleConfig, transCode: string): string {
  return `${config.basePath}/print/${encodeURIComponent(transCode)}`;
}
