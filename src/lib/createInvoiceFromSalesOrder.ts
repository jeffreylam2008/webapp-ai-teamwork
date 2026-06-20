import { getCurrentSuffix } from '@/utils/transactionUtils';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

const INVOICE_SESSION_KEY = 'invoice_session_id';

export function getOrCreateInvoiceBrowserSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem(INVOICE_SESSION_KEY);
  if (!id) {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    id = `browser_${timestamp}${randomStr}`;
    sessionStorage.setItem(INVOICE_SESSION_KEY, id);
  }
  return id;
}

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
 * Loads a settled SO, reserves a new INV number, stores clone payload, commits generator session.
 * @returns New invoice transaction code for navigation to create page.
 */
export async function createInvoiceFromSalesOrder(params: {
  salesOrderCode: string;
  token: string | null;
  browserSessionId: string;
}): Promise<string> {
  const salesOrderCode = String(params.salesOrderCode || '').trim();
  const browserSessionId = String(params.browserSessionId || '').trim();
  if (!salesOrderCode) throw new Error('Sales order code is required');
  if (!browserSessionId) throw new Error('Invoice session is not ready');

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

  const suffix = getCurrentSuffix();
  const nextRes = await fetch('/api/transaction-generator/next', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: 'INV', suffix, sessionId: browserSessionId }),
  });
  const nextJson = (await nextRes.json()) as { success: boolean; transactionCode?: string; error?: string };
  if (!nextJson.success || !nextJson.transactionCode) {
    throw new Error(nextJson.error || 'Failed to generate invoice number');
  }
  const newCode = nextJson.transactionCode;

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
  sessionStorage.setItem(`invoice_clone_${newCode}`, JSON.stringify(clonePayload));

  const commitRes = await fetch('/api/transaction-generator/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: browserSessionId }),
  });
  const commitJson = (await commitRes.json()) as { success: boolean; error?: string };
  if (!commitJson.success) {
    sessionStorage.removeItem(`invoice_clone_${newCode}`);
    throw new Error(commitJson.error || 'Failed to commit invoice number');
  }

  return newCode;
}
