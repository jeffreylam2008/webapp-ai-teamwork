import { getCurrentSuffix } from '@/utils/transactionUtils';
import { PREFIX_REF, effectivePrefixRef } from '@/lib/prefixRef';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';

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
 * Loads an SO, reserves a new SO number, stores clone payload, commits generator session.
 * @returns New sales order transaction code for navigation to create page.
 */
export async function cloneSalesOrder(params: {
  sourceOrderCode: string;
  token: string | null;
  browserSessionId: string;
}): Promise<string> {
  const sourceOrderCode = String(params.sourceOrderCode || '').trim();
  const browserSessionId = String(params.browserSessionId || '').trim();
  if (!sourceOrderCode) throw new Error('Sales order code is required');
  if (!browserSessionId) throw new Error('Order session is not ready');

  const sourceRes = await fetchWithAuth(
    `/api/transactions/detail/${encodeURIComponent(sourceOrderCode)}`,
    params.token,
    { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
  );
  const sourceJson = (await sourceRes.json()) as DetailResponse;
  if (!sourceRes.ok || !sourceJson.success) {
    throw new Error(sourceJson.error || 'Failed to load sales order');
  }

  const sourceHeader = sourceJson.header || {};
  // Display prefix may be customized (e.g. MSO); match on stable prefix_ref.
  const typeRef = effectivePrefixRef(
    sourceHeader.prefix_ref as string | undefined,
    sourceHeader.prefix as string | undefined
  );
  if (typeRef !== PREFIX_REF.SO) throw new Error('Not a sales order');

  const sourceDetails = Array.isArray(sourceJson.details) ? sourceJson.details : [];
  const sourcePaymentTotals = Array.isArray(sourceJson.paymentTotals) ? sourceJson.paymentTotals : [];
  const pm_code = sourcePaymentTotals[0]?.pm_code;

  const suffix = getCurrentSuffix();
  const nextRes = await fetch('/api/transaction-generator/next', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix_ref: PREFIX_REF.SO, suffix, sessionId: browserSessionId }),
  });
  const nextJson = (await nextRes.json()) as { success: boolean; transactionCode?: string; error?: string };
  if (!nextJson.success || !nextJson.transactionCode) {
    throw new Error(nextJson.error || 'Failed to generate order number');
  }
  const newCode = nextJson.transactionCode;

  const clonePayload = {
    sourceTransCode: sourceOrderCode,
    header: {
      cust_code: sourceHeader.cust_code ?? undefined,
      shop_code: sourceHeader.shop_code ?? undefined,
      refer_code: sourceHeader.refer_code ?? undefined,
      quotation_code: sourceHeader.quotation_code ?? undefined,
      remark: sourceHeader.remark ?? undefined,
      customer_name: sourceHeader.customer_name ?? undefined,
      pm_code: pm_code ?? undefined,
    },
    details: sourceDetails.map((d) => ({
      item_code: d.item_code ?? '',
      eng_name: d.eng_name ?? '',
      chi_name: d.chi_name ?? '',
      qty: Number(d.qty || 0),
      unit: d.unit ?? '',
      price: Number(d.price || 0),
      discount: Number(d.discount || 0),
    })),
  };
  sessionStorage.setItem(`order_clone_${newCode}`, JSON.stringify(clonePayload));

  const commitRes = await fetch('/api/transaction-generator/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: browserSessionId }),
  });
  const commitJson = (await commitRes.json()) as { success: boolean; error?: string };
  if (!commitJson.success) {
    sessionStorage.removeItem(`order_clone_${newCode}`);
    throw new Error(commitJson.error || 'Failed to commit order number');
  }

  return newCode;
}

export function getOrCreateOrderBrowserSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem('order_session_id');
  if (!id) {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    id = `browser_${timestamp}${randomStr}`;
    sessionStorage.setItem('order_session_id', id);
  }
  return id;
}
