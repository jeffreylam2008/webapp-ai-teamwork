export type SalesReportGroupBy =
  | 'invoice'
  | 'invoice_detail'
  | 'customer'
  | 'customer_detail'
  | 'product';

export function parseSalesReportGroupBy(raw: string | null | undefined): SalesReportGroupBy {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'invoice_detail') return 'invoice_detail';
  if (value === 'customer') return 'customer';
  if (value === 'customer_detail') return 'customer_detail';
  if (value === 'product' || value === 'item') return 'product';
  return 'invoice';
}

export function isInvoiceGroup(groupBy: SalesReportGroupBy): boolean {
  return groupBy === 'invoice' || groupBy === 'invoice_detail';
}

export function isCustomerGroup(groupBy: SalesReportGroupBy): boolean {
  return groupBy === 'customer' || groupBy === 'customer_detail';
}

export function isDetailGroup(groupBy: SalesReportGroupBy): boolean {
  return groupBy === 'invoice_detail' || groupBy === 'customer_detail';
}
