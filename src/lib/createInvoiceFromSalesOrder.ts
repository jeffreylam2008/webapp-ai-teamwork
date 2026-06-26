import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { INVOICE_DRAFT_TRANS_CODE } from '@/features/invoices/invoiceModule';

const INVOICE_CLONE_KEY = `invoice_clone_${INVOICE_DRAFT_TRANS_CODE}`;

type DetailResponse = {
  success: boolean;
  header?: Record<string, unknown>;
  details?: Array<{
    item_code?: string;
    eng_name?: string;
    chi_name?: string;
    qty?: number;
    unit?: string;
    price?: number;
    discount?: number;
  }>;
  paymentTotals?: Array<{ pm_code?: string }>;
  error?: string;
};

/**
 * Loads a settled SO and stores clone payload for the draft invoice create page.
 * Invoice number is reserved when the user saves on the create page.
 */
export async function createInvoiceFromSalesOrder(params: {
  salesOrderCode: string;
  token: string | null;
}): Promise<string> {
  const salesOrderCode = String(params.salesOrderCode || '').trim();
  if (!salesOrderCode) throw new Error('Sales order code is required');

  const sourceRes = await fetchWithAuth(
    `/api/transactions/detail/${encodeURIComponent(salesOrderCode)}`,
    params.token,
    { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
  );
  const sourceJson = (await sourceRes.json()) as DetailResponse;
  if (!sourceRes.ok || !sourceJson.success) {
    throw new Error(sourceJson.error || 'Failed to load sales order');
  }

  const sourceHeader = sourceJson.header || {};
  const prefix = String(sourceHeader.prefix || '').trim().toUpperCase();
  if (prefix !== 'SO') throw new Error('Not a sales order');
  if (Number(sourceHeader.is_void ?? 0) === 1) throw new Error('Cannot create invoice from a void sales order');
  if (Number(sourceHeader.is_settle ?? 0) !== 1) {
    throw new Error('Sales order must be settled before creating an invoice');
  }

  const sourceDetails = Array.isArray(sourceJson.details) ? sourceJson.details : [];
  const lineDetails = sourceDetails
    .map((d) => ({
      item_code: d.item_code ?? '',
      eng_name: d.eng_name ?? '',
      chi_name: d.chi_name ?? '',
      qty: Number(d.qty || 0),
      unit: d.unit ?? '',
      price: Number(d.price || 0),
      discount: Number(d.discount || 0),
    }))
    .filter((d) => d.item_code && d.qty > 0);
  if (lineDetails.length === 0) throw new Error('Sales order has no line items');

  const sourcePaymentTotals = Array.isArray(sourceJson.paymentTotals) ? sourceJson.paymentTotals : [];
  const pm_code = sourcePaymentTotals[0]?.pm_code;

  const clonePayload = {
    sourceTransCode: salesOrderCode,
    header: {
      cust_code: sourceHeader.cust_code ?? undefined,
      shop_code: sourceHeader.shop_code ?? undefined,
      refer_code: salesOrderCode,
      quotation_code: sourceHeader.quotation_code ?? undefined,
      remark: sourceHeader.remark ?? undefined,
      pm_code: pm_code ?? undefined,
      customer_name: sourceHeader.customer_name ?? undefined,
    },
    details: lineDetails,
  };
  sessionStorage.setItem(INVOICE_CLONE_KEY, JSON.stringify(clonePayload));

  return INVOICE_DRAFT_TRANS_CODE;
}
