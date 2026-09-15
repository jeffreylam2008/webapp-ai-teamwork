import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { getCurrentSuffix, generateSessionId } from '@/utils/transactionUtils';
import { TransactionGeneratorMiddleware } from '@/middleware/transactionGenerator';
import { logTransactionAction } from '@/lib/audit';
import { syncSalesOrderWarehouseStageHold } from '@/lib/salesOrderWarehouseStage';
import { ensurePrefixRefColumn } from '@/lib/ensurePrefixRefColumn';
import { PREFIX_REF, bindEqualsStoredPrefixRef, sqlEqualsStoredPrefixRef } from '@/lib/prefixRef';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  assertTransCodeInShopScope,
  getShopScopeFromAuth,
  shopScopeRequiredResponse,
} from '@/lib/shopScope';

export async function POST(request: NextRequest) {
  try {
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

    await ensurePrefixRefColumn();
    const body = await request.json();
    const { quotationCode } = body;

    if (!quotationCode) {
      return NextResponse.json(
        { success: false, error: 'Quotation code is required' },
        { status: 400 }
      );
    }

    const scopeErr = await assertTransCodeInShopScope(String(quotationCode), scopeShop);
    if (scopeErr) return scopeErr;

    console.log('[API] Converting quotation to Sales Order (draft):', quotationCode);

    const result = await dbService.withTransaction(async () => {
      const quotationCheck = await dbService.query(
        `SELECT trans_code, prefix, prefix_ref, cust_code, refer_code, shop_code, 
                total, employee_code, remark, create_date, valid_until_date,
                is_convert
         FROM t_transaction_h 
         WHERE trans_code = ?
           AND ${sqlEqualsStoredPrefixRef()}
           AND shop_code = ?`,
        [quotationCode, ...bindEqualsStoredPrefixRef(PREFIX_REF.QTA), scopeShop]
      );

      if (!quotationCheck.data || quotationCheck.data.length === 0) {
        return { ok: false as const, status: 404, error: 'Quotation not found' };
      }

      const quotation = quotationCheck.data[0];

      if (quotation.is_convert) {
        return {
          ok: false as const,
          status: 400,
          error: 'Quotation has already been converted to Sales Order',
        };
      }

      const suffix = getCurrentSuffix();
      const sessionId = `convert_${Date.now()}_${generateSessionId()}`;

      const orderNumberResult = await TransactionGeneratorMiddleware.generateNext({
        prefix: PREFIX_REF.SO,
        suffix: suffix,
        sessionId: sessionId,
      });

      if (!orderNumberResult.success || !orderNumberResult.transactionCode) {
        const genErr = !orderNumberResult.success
          ? orderNumberResult.error
          : 'Failed to generate Sales Order number';
        return { ok: false as const, status: 500, error: genErr || 'Failed to generate Sales Order number' };
      }

      const orderCode = orderNumberResult.transactionCode;
      console.log('[API] Generated Sales Order code:', orderCode);

      const quotationDetails = await dbService.query(
        `SELECT item_code, eng_name, chi_name, qty, unit, price, discount
         FROM t_transaction_d
         WHERE trans_code = ?`,
        [quotationCode]
      );

      const quotationPaymentTotals = await dbService.query(
        `SELECT pm_code, total
         FROM t_transaction_t
         WHERE trans_code = ?`,
        [quotationCode]
      );

      await dbService.query(
        `INSERT INTO t_transaction_h (
          trans_code, prefix, prefix_ref, cust_code, refer_code, shop_code,
          total, employee_code, remark, create_date, modify_date,
          quotation_code, is_void, is_convert, is_settle
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, 0, 0, 0)`,
        [
          orderCode,
          PREFIX_REF.SO,
          PREFIX_REF.SO,
          quotation.cust_code,
          quotation.refer_code,
          scopeShop,
          quotation.total,
          quotation.employee_code,
          quotation.remark,
          quotationCode,
        ]
      );

      if (quotationDetails.data && quotationDetails.data.length > 0) {
        for (const detail of quotationDetails.data) {
          await dbService.query(
            `INSERT INTO t_transaction_d (
              trans_code, item_code, eng_name, chi_name,
              qty, unit, price, discount,
              create_date, modify_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              orderCode,
              detail.item_code,
              detail.eng_name,
              detail.chi_name,
              detail.qty,
              detail.unit,
              detail.price,
              detail.discount,
            ]
          );
        }
      }

      if (quotationPaymentTotals.data && quotationPaymentTotals.data.length > 0) {
        for (const payment of quotationPaymentTotals.data) {
          await dbService.query(
            `INSERT INTO t_transaction_t (
              trans_code, pm_code, total,
              create_date, modify_date
            ) VALUES (?, ?, ?, NOW(), NOW())`,
            [orderCode, payment.pm_code, payment.total]
          );
        }
      }

      await dbService.query(
        `UPDATE t_transaction_h 
         SET is_convert = 1, refer_code = ?, modify_date = NOW()
         WHERE trans_code = ? AND shop_code = ?`,
        [orderCode, quotationCode, scopeShop]
      );

      const soHoldMap = new Map<string, number>();
      for (const detail of quotationDetails.data || []) {
        const ic = String((detail as { item_code?: string }).item_code || '').trim();
        if (!ic) continue;
        const q = Number((detail as { qty?: unknown }).qty || 0);
        if (!Number.isFinite(q) || q <= 0) continue;
        soHoldMap.set(ic, (soHoldMap.get(ic) || 0) + q);
      }
      await syncSalesOrderWarehouseStageHold({
        transCode: orderCode,
        shopCode: scopeShop,
        effectivePrefix: 'SO',
        effectiveIsVoid: 0,
        effectiveIsSettle: 0,
        detailQtyByItem: soHoldMap,
      });

      return { ok: true as const, orderCode, sessionId };
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    await dbService.query(
      'UPDATE t_trans_num_generator SET status = "committed" WHERE session_id = ?',
      [result.sessionId]
    );

    console.log(
      '[API] Quotation converted successfully to Sales Order (draft):',
      result.orderCode
    );
    void logTransactionAction({
      request,
      action: 'CONVERT',
      transCode: quotationCode,
      prefix: PREFIX_REF.QTA,
      details: { convertedTo: result.orderCode },
    });
    void logTransactionAction({
      request,
      action: 'CREATE',
      transCode: result.orderCode,
      prefix: PREFIX_REF.SO,
      details: { convertedFrom: quotationCode },
    });

    return NextResponse.json({
      success: true,
      message: 'Quotation converted to Sales Order (draft) successfully',
      orderCode: result.orderCode,
      invoiceCode: result.orderCode,
    });
  } catch (error: unknown) {
    console.error('[API] Error in convert-quotation endpoint:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
