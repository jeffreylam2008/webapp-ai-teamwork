import { NextRequest, NextResponse } from 'next/server';
import {
  assertTransactionPermission,
  forbiddenResponse,
  loadPermissionKeysForUser,
} from '@/lib/transactionPermissionAuth';
import dbService from '@/lib/database';
import { formatSqlDateTime } from '@/lib/datetime';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  getShopScopeFromAuth,
  isTransactionInShopScope,
  shopScopeRequiredResponse,
  transactionOutOfShopScopeResponse,
} from '@/lib/shopScope';
import { logTransactionAction } from '@/lib/audit';
import { syncSalesOrderWarehouseStageHold } from '@/lib/salesOrderWarehouseStage';
import { markSalesOrderInvoiced } from '@/lib/salesOrderInvoiceConversion';
import { rollbackQuotationIfSalesOrderFromConversion } from '@/lib/salesOrderQuotationRollback';
import { applyWarehouseQtyDeltas } from '@/lib/warehouseStock';
import { deductWarehouseForConfirmedSalesOrder } from '@/lib/salesOrderConfirmWarehouse';
import { ensureInvoiceSubtypeColumns } from '@/lib/ensureInvoiceSubtypeColumns';
import { isMonthlyInvoiceSubtype } from '@/config/invoiceSubtypes';
import {
  ensurePrefixRefColumn,
  resolveDisplayPrefix,
  resolvePrefixPair,
} from '@/lib/ensurePrefixRefColumn';
import {
  PREFIX_REF,
  effectivePrefixRef,
  normalizeToPrefixRef,
  storedTransactionHeaderRef,
  bindEqualsStoredPrefixRef,
  sqlEqualsStoredPrefixRef,
} from '@/lib/prefixRef';

async function loadColumnMap(table: string): Promise<Map<string, string>> {
  const r = await dbService.query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME AS COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [table]
  );
  const m = new Map<string, string>();
  for (const row of (r.data || []) as { COLUMN_NAME: string }[]) {
    m.set(row.COLUMN_NAME.toLowerCase(), row.COLUMN_NAME);
  }
  return m;
}

function hasCol(map: Map<string, string>, name: string): boolean {
  return map.has(name.toLowerCase());
}

function coerceSqlParam(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return Number(value);
  return String(value);
}

function normalizeHeader(
  raw: Record<string, unknown>,
  colMap: Map<string, string>,
  transCode: string
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  delete out.trans_code;

  const tx = out.transaction_date ?? out.quotation_date;
  if (tx != null) {
    const formatted = formatSqlDateTime(tx);
    if (hasCol(colMap, 'quotation_date')) {
      out.quotation_date = formatted;
    } else if (hasCol(colMap, 'transaction_date')) {
      out.transaction_date = formatted;
    }
    delete out.transaction_date;
  }

  const vu = out.valid_until ?? out.valid_until_date;
  if (vu != null && hasCol(colMap, 'valid_until_date')) {
    out.valid_until_date = formatSqlDateTime(vu);
    delete out.valid_until;
  }

  for (const key of ['billing_period_from', 'billing_period_to'] as const) {
    if (out[key] != null && hasCol(colMap, key)) {
      out[key] = formatSqlDateTime(out[key]);
    }
  }

  out.trans_code = transCode;
  return out;
}

function pickRow(
  colMap: Map<string, string>,
  data: Record<string, unknown>,
  options?: { omitKeys?: string[] }
): Record<string, string | number | boolean | null> {
  const omit = new Set((options?.omitKeys || []).map((k) => k.toLowerCase()));
  const picked: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(data)) {
    if (omit.has(k.toLowerCase())) continue;
    const canon = colMap.get(k.toLowerCase());
    if (!canon) continue;
    picked[canon] = coerceSqlParam(v);
  }
  return picked;
}

function buildInsertSql(table: string, row: Record<string, string | number | boolean | null>): { sql: string; params: (string | number | boolean | null)[] } {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(', ');
  const quoted = cols.map((c) => `\`${c}\``).join(', ');
  const sql = `INSERT INTO \`${table}\` (${quoted}) VALUES (${placeholders})`;
  return { sql, params: cols.map((c) => row[c]!) };
}

function buildUpdateSql(
  table: string,
  row: Record<string, string | number | boolean | null>,
  whereClause: string,
  whereParams: (string | number | boolean | null)[]
): { sql: string; params: (string | number | boolean | null)[] } {
  const cols = Object.keys(row).filter((k) => k.toLowerCase() !== 'trans_code');
  const setClause = cols.map((c) => `\`${c}\` = ?`).join(', ');
  const sql = `UPDATE \`${table}\` SET ${setClause} WHERE ${whereClause}`;
  return { sql, params: [...cols.map((c) => row[c]!), ...whereParams] };
}

function sumDetailQtyByItem(rows: { item_code?: string; qty?: unknown }[] | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows || []) {
    const code = String(r.item_code || '').trim();
    if (!code) continue;
    const q = Number(r.qty || 0);
    if (!Number.isFinite(q)) continue;
    m.set(code, (m.get(code) || 0) + q);
  }
  return m;
}

function mergeQtyDelta(oldMap: Map<string, number>, newMap: Map<string, number>): Map<string, number> {
  const keys = new Set<string>([...oldMap.keys(), ...newMap.keys()]);
  const out = new Map<string, number>();
  for (const k of keys) {
    const d = (newMap.get(k) || 0) - (oldMap.get(k) || 0);
    if (d !== 0 && Number.isFinite(d)) out.set(k, d);
  }
  return out;
}

/** Stable prefix_refs whose detail line qty (signed for ADJ/ST) updates t_warehouse on save/edit/void. */
const WAREHOUSE_QTY_PREFIX_REFS = new Set([PREFIX_REF.GRN, PREFIX_REF.ADJ, PREFIX_REF.ST]);

function usesWarehouseQtySync(prefixOrRef: string): boolean {
  return WAREHOUSE_QTY_PREFIX_REFS.has(normalizeToPrefixRef(prefixOrRef) as (typeof PREFIX_REF)['GRN']);
}

/**
 * Set PO is_settle from GRN-received qty vs PO order qty (non-void GRNs with refer_code = PO).
 * Call after GRN or PO detail/header changes so settlement stays in sync.
 */
async function syncPurchaseOrderSettlementFromGrns(poTransCode: string) {
  const code = String(poTransCode || '').trim();
  if (!code) return;

  const poCheck = await dbService.query<{ prefix: string | null; prefix_ref: string | null }>(
    'SELECT prefix, prefix_ref FROM t_transaction_h WHERE trans_code = ? LIMIT 1',
    [code]
  );
  const ph = poCheck.data?.[0];
  if (!ph || effectivePrefixRef(ph.prefix_ref, ph.prefix) !== PREFIX_REF.PO) return;

  const poLines = await dbService.query<{ item_code: string; order_qty: number }>(
    `SELECT item_code, COALESCE(SUM(qty), 0) AS order_qty
     FROM t_transaction_d
     WHERE trans_code = ?
     GROUP BY item_code
     HAVING order_qty > 0`,
    [code]
  );
  const lines = poLines.data || [];
  if (lines.length === 0) {
    await dbService.query(
      `UPDATE t_transaction_h SET is_settle = 0
       WHERE trans_code = ?
         AND ${sqlEqualsStoredPrefixRef()}`,
      [code, ...bindEqualsStoredPrefixRef(PREFIX_REF.PO)]
    );
    return;
  }

  const grnHeaders = await dbService.query<{ trans_code: string }>(
    `SELECT trans_code FROM t_transaction_h
     WHERE ${sqlEqualsStoredPrefixRef()}
       AND refer_code = ?
       AND (is_void = 0 OR is_void IS NULL)`,
    [...bindEqualsStoredPrefixRef(PREFIX_REF.GRN), code]
  );
  const grnCodes = (grnHeaders.data || []).map((r) => r.trans_code);
  const receivedPerItem: Record<string, number> = {};
  if (grnCodes.length > 0) {
    const placeholders = grnCodes.map(() => '?').join(',');
    const sumResult = await dbService.query<{ item_code: string; total_qty: number }>(
      `SELECT item_code, COALESCE(SUM(qty), 0) AS total_qty
       FROM t_transaction_d
       WHERE trans_code IN (${placeholders})
       GROUP BY item_code`,
      grnCodes
    );
    for (const row of sumResult.data || []) {
      receivedPerItem[String(row.item_code || '').trim()] = Number(row.total_qty || 0);
    }
  }

  const eps = 1e-6;
  let fullyReceived = true;
  for (const line of lines) {
    const ic = String(line.item_code || '').trim();
    if (!ic) continue;
    const ordered = Number(line.order_qty || 0);
    const recv = receivedPerItem[ic] ?? 0;
    if (recv + eps < ordered) {
      fullyReceived = false;
      break;
    }
  }

  await dbService.query(
    `UPDATE t_transaction_h SET is_settle = ?
     WHERE trans_code = ?
       AND ${sqlEqualsStoredPrefixRef()}`,
    [fullyReceived ? 1 : 0, code, ...bindEqualsStoredPrefixRef(PREFIX_REF.PO)]
  );
}

export async function PUT(request: NextRequest) {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const auth = await verifyToken(token);
  if (!auth.success || !auth.user) {
    return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
  }

  const scopeShop = getShopScopeFromAuth(auth.user);
  if (!scopeShop) return shopScopeRequiredResponse();

  let body: {
    transCode?: string;
    headerData?: Record<string, unknown>;
    detailsData?: unknown[];
    paymentTotalsData?: unknown[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const transCode = String(body.transCode || '').trim();
  const headerRaw = (body.headerData || {}) as Record<string, unknown>;
  const detailsProvided = Object.prototype.hasOwnProperty.call(body, 'detailsData');
  const paymentTotalsProvided = Object.prototype.hasOwnProperty.call(body, 'paymentTotalsData');
  const detailsData = detailsProvided && Array.isArray(body.detailsData) ? body.detailsData : [];
  const paymentTotalsData =
    paymentTotalsProvided && Array.isArray(body.paymentTotalsData) ? body.paymentTotalsData : [];

  if (!transCode) {
    return NextResponse.json({ success: false, error: 'transCode is required' }, { status: 400 });
  }

  try {
    await ensureInvoiceSubtypeColumns();
    await ensurePrefixRefColumn();
    const hMap = await loadColumnMap('t_transaction_h');
    const dMap = await loadColumnMap('t_transaction_d');
    const tMap = await loadColumnMap('t_transaction_t');

    const existsRes = await dbService.query<{ c: number }>(
      'SELECT COUNT(*) AS c FROM t_transaction_h WHERE trans_code = ? LIMIT 1',
      [transCode]
    );
    const existsCnt = Number(((existsRes.data || [])[0] as { c: number })?.c || 0);

    const prevHeaderRes = await dbService.query<{
      prefix: string | null;
      prefix_ref: string | null;
      is_void: number | null;
      is_settle: number | null;
      wh_code: string | null;
      shop_code: string | null;
      invoice_subtype: string | null;
    }>(
      'SELECT prefix, prefix_ref, is_void, is_settle, wh_code, shop_code, invoice_subtype FROM t_transaction_h WHERE trans_code = ? LIMIT 1',
      [transCode]
    );
    const prevH = prevHeaderRes.data?.[0];
    if (existsCnt > 0 && !isTransactionInShopScope(prevH?.shop_code, scopeShop)) {
      return transactionOutOfShopScopeResponse();
    }

    // Always bind document to the logged-in shop (prevents cross-shop create/edit).
    headerRaw.shop_code = scopeShop;

    const prevDetailsRes = await dbService.query<{ item_code: string; qty: number }>(
      'SELECT item_code, qty FROM t_transaction_d WHERE trans_code = ?',
      [transCode]
    );

    const rawPrefixInput =
      headerRaw.prefix_ref !== undefined
        ? headerRaw.prefix_ref
        : headerRaw.prefix !== undefined
          ? headerRaw.prefix
          : prevH?.prefix_ref || prevH?.prefix;
    const resolved = await resolvePrefixPair(String(rawPrefixInput ?? ''));
    const displayPrefix =
      resolved?.prefix ||
      String(headerRaw.prefix ?? prevH?.prefix ?? '')
        .trim();
    const prefixRefValue =
      resolved?.prefix_ref ||
      effectivePrefixRef(prevH?.prefix_ref, prevH?.prefix) ||
      normalizeToPrefixRef(displayPrefix);
    const storedRef = storedTransactionHeaderRef(prefixRefValue);

    // Always persist both: prefix_ref is canonical; prefix mirrors it for legacy readers / NOT NULL columns
    headerRaw.prefix_ref = storedRef;
    headerRaw.prefix = storedRef;

    const normalizedHeader = normalizeHeader(headerRaw, hMap, transCode);

    const effectivePrefix = prefixRefValue;
    const effectivePrefixDisplay =
      resolved?.prefix ||
      (await resolveDisplayPrefix(prefixRefValue)) ||
      String(displayPrefix || '').trim();

    if (
      effectivePrefix === PREFIX_REF.INV &&
      isMonthlyInvoiceSubtype(normalizedHeader.invoice_subtype ?? headerRaw.invoice_subtype)
    ) {
      if (!normalizedHeader.billing_period_from || !normalizedHeader.billing_period_to) {
        return NextResponse.json(
          { success: false, error: 'Monthly invoices require billing period from and to dates' },
          { status: 400 }
        );
      }
    }

    const rawIsVoid = headerRaw.is_void !== undefined ? headerRaw.is_void : prevH?.is_void;
    const effectiveIsVoid =
      rawIsVoid === true || rawIsVoid === 1 || String(rawIsVoid).toLowerCase() === 'true' ? 1 : 0;

    const rawIsSettle = headerRaw.is_settle !== undefined ? headerRaw.is_settle : prevH?.is_settle;
    const effectiveIsSettle =
      rawIsSettle === true || rawIsSettle === 1 || String(rawIsSettle).toLowerCase() === 'true' ? 1 : 0;

    if (effectivePrefix === PREFIX_REF.PO && effectiveIsVoid === 1 && Number(prevH?.is_settle ?? 0) === 1) {
      return NextResponse.json(
        { success: false, error: 'Cannot void a settled purchase order' },
        { status: 400 }
      );
    }

    const employeeCode = String(auth.user.employee_code ?? '').trim();
    const shopCode = scopeShop;
    const permKeys = await loadPermissionKeysForUser(employeeCode, shopCode);
    const permAction =
      effectiveIsVoid === 1 ? 'delete' : existsCnt > 0 ? 'edit' : 'create';
    if (
      effectivePrefix &&
      !assertTransactionPermission(permKeys, effectivePrefix, permAction, {
        invoiceSubtype:
          (normalizedHeader.invoice_subtype as string | undefined) ??
          (headerRaw.invoice_subtype as string | undefined) ??
          prevH?.invoice_subtype,
      })
    ) {
      return forbiddenResponse('You do not have permission for this transaction action');
    }

    if (effectivePrefix === PREFIX_REF.SO && effectiveIsVoid === 1 && Number(prevH?.is_settle ?? 0) === 1) {
      return NextResponse.json(
        { success: false, error: 'Cannot void a confirmed sales order' },
        { status: 400 }
      );
    }

    if (effectivePrefix === PREFIX_REF.INV && effectiveIsVoid === 1 && Number(prevH?.is_settle ?? 0) === 1) {
      return NextResponse.json(
        { success: false, error: 'Cannot void a settled invoice' },
        { status: 400 }
      );
    }

    const prevPrefixUpper = effectivePrefixRef(prevH?.prefix_ref, prevH?.prefix);
    const prevWasWarehouseQty =
      !!prevH && usesWarehouseQtySync(prevPrefixUpper) && !Number(prevH?.is_void ?? 0);

    const oldWarehouseQtyMap = prevWasWarehouseQty
      ? sumDetailQtyByItem(prevDetailsRes.data || [])
      : new Map<string, number>();
    const detailRowsForWarehouse =
      detailsProvided && Array.isArray(body.detailsData)
        ? (body.detailsData as { item_code?: string; qty?: unknown }[])
        : (prevDetailsRes.data as { item_code?: string; qty?: unknown }[]) || [];
    const newWarehouseQtyMap =
      usesWarehouseQtySync(effectivePrefix) && effectiveIsVoid === 0
        ? sumDetailQtyByItem(detailRowsForWarehouse)
        : new Map<string, number>();

    const shouldSyncWarehouseQty = usesWarehouseQtySync(effectivePrefix) || prevWasWarehouseQty;
    const warehouseQtyDeltaByItem = shouldSyncWarehouseQty
      ? mergeQtyDelta(oldWarehouseQtyMap, newWarehouseQtyMap)
      : new Map<string, number>();

    const whFromPayload =
      headerRaw.wh_code !== undefined ? String(headerRaw.wh_code ?? '').trim() : String(prevH?.wh_code ?? '').trim();
    const shopFromPayload =
      headerRaw.shop_code !== undefined
        ? String(headerRaw.shop_code ?? '').trim()
        : String(prevH?.shop_code ?? '').trim();
    const stockShopCode = whFromPayload || shopFromPayload;

    const newlyConfirmedSo =
      existsCnt > 0 &&
      !!prevH &&
      effectivePrefix === PREFIX_REF.SO &&
      effectiveIsVoid === 0 &&
      Number(prevH.is_settle ?? 0) === 0 &&
      effectiveIsSettle === 1;

    if (newlyConfirmedSo && !String(stockShopCode || '').trim()) {
      return NextResponse.json(
        { success: false, error: 'Sales order is missing shop or warehouse code for stock deduction' },
        { status: 400 }
      );
    }

    await dbService.withTransaction(async () => {
    let headerRow = pickRow(hMap, normalizedHeader);
    if (hasCol(hMap, 'modify_date') && existsCnt > 0) {
      headerRow = { ...headerRow, [hMap.get('modify_date')!]: formatSqlDateTime(new Date()) };
    }

    if (existsCnt === 0) {
      if (hasCol(hMap, 'is_void') && headerRow[hMap.get('is_void')!] === undefined) {
        headerRow[hMap.get('is_void')!] = 0;
      }
      if (hasCol(hMap, 'is_convert') && headerRow[hMap.get('is_convert')!] === undefined) {
        headerRow[hMap.get('is_convert')!] = 0;
      }
      if (hasCol(hMap, 'is_settle') && headerRow[hMap.get('is_settle')!] === undefined) {
        headerRow[hMap.get('is_settle')!] = 0;
      }
      if (hasCol(hMap, 'create_date') && headerRow[hMap.get('create_date')!] === undefined) {
        headerRow[hMap.get('create_date')!] = formatSqlDateTime(new Date());
      }
      const ins = buildInsertSql('t_transaction_h', headerRow);
      await dbService.query(ins.sql, ins.params);
    } else {
      const hdr = { ...headerRow };
      const tk = hMap.get('trans_code');
      if (tk) delete hdr[tk];
      const upd = buildUpdateSql('t_transaction_h', hdr, 'trans_code = ?', [transCode]);
      await dbService.query(upd.sql, upd.params);
    }

    if (detailsProvided) {
      await dbService.query('DELETE FROM t_transaction_d WHERE trans_code = ?', [transCode]);
      for (const raw of detailsData) {
        const row = { ...(typeof raw === 'object' && raw !== null ? raw : {}), trans_code: transCode } as Record<string, unknown>;
        const detailPick = pickRow(dMap, row, { omitKeys: ['uid'] });
        if (hasCol(dMap, 'create_date')) {
          const cn = dMap.get('create_date')!;
          if (detailPick[cn] === undefined || detailPick[cn] === null) {
            detailPick[cn] = formatSqlDateTime(new Date());
          }
        }
        if (hasCol(dMap, 'modify_date')) {
          const mn = dMap.get('modify_date')!;
          detailPick[mn] = formatSqlDateTime(new Date());
        }
        const dIns = buildInsertSql('t_transaction_d', detailPick);
        await dbService.query(dIns.sql, dIns.params);
      }
    }

    if (paymentTotalsProvided) {
      await dbService.query('DELETE FROM t_transaction_t WHERE trans_code = ?', [transCode]);
      for (const raw of paymentTotalsData) {
        const row = { ...(typeof raw === 'object' && raw !== null ? raw : {}), trans_code: transCode } as Record<string, unknown>;
        const payPick = pickRow(tMap, row, { omitKeys: ['uid'] });
        if (hasCol(tMap, 'create_date')) {
          payPick[tMap.get('create_date')!] = formatSqlDateTime(new Date());
        }
        if (hasCol(tMap, 'modify_date')) {
          payPick[tMap.get('modify_date')!] = formatSqlDateTime(new Date());
        }
        const tIns = buildInsertSql('t_transaction_t', payPick);
        await dbService.query(tIns.sql, tIns.params);
      }
    }

    if (warehouseQtyDeltaByItem.size > 0) {
      if (!String(stockShopCode || '').trim()) {
        throw new Error('shop_code or wh_code is required for warehouse stock update');
      }
      await applyWarehouseQtyDeltas(stockShopCode, warehouseQtyDeltaByItem);
    }

    const soDetailRowsForHold: { item_code?: string; qty?: unknown }[] =
      detailsProvided && Array.isArray(body.detailsData)
        ? (body.detailsData as { item_code?: string; qty?: unknown }[])
        : ((prevDetailsRes.data || []) as { item_code?: string; qty?: unknown }[]);
    const soDetailQtyMap = sumDetailQtyByItem(soDetailRowsForHold);

    await syncSalesOrderWarehouseStageHold({
      transCode,
      shopCode: stockShopCode,
      effectivePrefix: effectivePrefixDisplay || effectivePrefix,
      effectiveIsVoid,
      effectiveIsSettle,
      detailQtyByItem: soDetailQtyMap,
    });

    if (newlyConfirmedSo) {
      await deductWarehouseForConfirmedSalesOrder(transCode, stockShopCode);
    }

    if (existsCnt === 0 && effectivePrefix === PREFIX_REF.INV && effectiveIsVoid === 0) {
      const soRef = String(normalizedHeader.refer_code ?? headerRaw.refer_code ?? '').trim();
      if (soRef) {
        const refRes = await dbService.query<{ prefix_ref: string | null; prefix: string | null }>(
          'SELECT prefix_ref, prefix FROM t_transaction_h WHERE trans_code = ? LIMIT 1',
          [soRef]
        );
        const refRow = refRes.data?.[0];
        const refType = effectivePrefixRef(refRow?.prefix_ref, refRow?.prefix);
        if (refType === PREFIX_REF.SO) {
          await markSalesOrderInvoiced(soRef);
        }
      }
    }

    if (effectivePrefix === PREFIX_REF.SO && effectiveIsVoid === 1 && Number(prevH?.is_void ?? 0) === 0) {
      await rollbackQuotationIfSalesOrderFromConversion(transCode);
    }

    if (effectivePrefix === PREFIX_REF.GRN) {
      const refRes = await dbService.query<{ refer_code: string | null }>(
        'SELECT refer_code FROM t_transaction_h WHERE trans_code = ? LIMIT 1',
        [transCode]
      );
      const poRef = String(refRes.data?.[0]?.refer_code ?? '').trim();
      if (poRef) {
        await syncPurchaseOrderSettlementFromGrns(poRef);
      }
    } else if (effectivePrefix === PREFIX_REF.PO) {
      await syncPurchaseOrderSettlementFromGrns(transCode);
    }

    });

    void logTransactionAction({
      request,
      action: existsCnt > 0 ? 'EDIT' : 'CREATE',
      transCode,
      prefix: effectivePrefix || undefined,
      details: {
        lineItems: detailsProvided ? detailsData.length : undefined,
        lineItemsUnchanged: !detailsProvided,
        payments: paymentTotalsProvided ? paymentTotalsData.length : undefined,
        paymentsUnchanged: !paymentTotalsProvided,
      },
    });

    return NextResponse.json({ success: true, transCode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Database error';
    console.error('[transactions/update]', err);
    if (msg.startsWith('Insufficient warehouse stock')) {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
