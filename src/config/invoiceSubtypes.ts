export const INVOICE_SUBTYPE_STANDARD = 'standard';
export const INVOICE_SUBTYPE_MONTHLY = 'monthly';

export type InvoiceSubtype = typeof INVOICE_SUBTYPE_STANDARD | typeof INVOICE_SUBTYPE_MONTHLY;

export const INVOICE_SUBTYPES: InvoiceSubtype[] = [INVOICE_SUBTYPE_STANDARD, INVOICE_SUBTYPE_MONTHLY];

export function normalizeInvoiceSubtype(value: unknown): InvoiceSubtype {
  const v = String(value ?? '').trim().toLowerCase();
  return v === INVOICE_SUBTYPE_MONTHLY ? INVOICE_SUBTYPE_MONTHLY : INVOICE_SUBTYPE_STANDARD;
}

export function isMonthlyInvoiceSubtype(value: unknown): boolean {
  return normalizeInvoiceSubtype(value) === INVOICE_SUBTYPE_MONTHLY;
}
