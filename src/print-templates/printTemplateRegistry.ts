/** HTML template ids under print-templates/html/{id}.html */
export const PRINT_TEMPLATE_IDS = {
  INVOICE: 'invoice',
  MONTHLY_INVOICE: 'monthly-invoice',
  SALES_ORDER: 'sales-order',
  QUOTATION: 'quotation',
  PURCHASE_ORDER: 'purchase-order',
  DELIVERY_NOTE: 'delivery-note',
} as const;

export type PrintTemplateId = (typeof PRINT_TEMPLATE_IDS)[keyof typeof PRINT_TEMPLATE_IDS];

export const DEFAULT_PRINT_TEMPLATE_ID: PrintTemplateId = PRINT_TEMPLATE_IDS.INVOICE;

/** Map transaction prefix (+ optional subtype) to print template id. */
export function resolvePrintTemplateId(options: {
  prefix?: string | null;
  invoiceSubtype?: string | null;
  templateId?: string | null;
}): PrintTemplateId {
  if (options.templateId?.trim()) {
    return options.templateId.trim() as PrintTemplateId;
  }

  const prefix = String(options.prefix ?? '').trim().toUpperCase();
  const subtype = String(options.invoiceSubtype ?? '').trim().toLowerCase();

  if (prefix === 'INV' && subtype === 'monthly') {
    return PRINT_TEMPLATE_IDS.MONTHLY_INVOICE;
  }
  if (prefix === 'INV') return PRINT_TEMPLATE_IDS.INVOICE;
  if (prefix === 'QTA') return PRINT_TEMPLATE_IDS.QUOTATION;
  if (prefix === 'SO') return PRINT_TEMPLATE_IDS.SALES_ORDER;
  if (prefix === 'PO') return PRINT_TEMPLATE_IDS.PURCHASE_ORDER;
  if (prefix === 'DN') return PRINT_TEMPLATE_IDS.DELIVERY_NOTE;

  return DEFAULT_PRINT_TEMPLATE_ID;
}
