import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { getCurrentSuffix, generateSessionId } from '@/utils/transactionUtils';
import { TransactionGeneratorMiddleware } from '@/middleware/transactionGenerator';
import { logTransactionAction } from '@/lib/audit';
import { syncSalesOrderWarehouseStageHold } from '@/lib/salesOrderWarehouseStage';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { quotationCode } = body;
    
    if (!quotationCode) {
      return NextResponse.json(
        { success: false, error: 'Quotation code is required' },
        { status: 400 }
      );
    }

    console.log('[API] Converting quotation to Sales Order (draft):', quotationCode);

    // Start transaction
    await dbService.query('START TRANSACTION');

    try {
      // Check if quotation exists and is not already converted
      const quotationCheck = await dbService.query(
        `SELECT trans_code, prefix, cust_code, refer_code, shop_code, 
                total, employee_code, remark, create_date, valid_until_date,
                is_convert
         FROM t_transaction_h 
         WHERE trans_code = ? AND prefix = 'QTA'`,
        [quotationCode]
      );

      if (!quotationCheck.data || quotationCheck.data.length === 0) {
        await dbService.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'Quotation not found' },
          { status: 404 }
        );
      }

      const quotation = quotationCheck.data[0];

      // Check if already converted
      if (quotation.is_convert) {
        await dbService.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: 'Quotation has already been converted to Sales Order' },
          { status: 400 }
        );
      }

      // Generate new Sales Order (SO) transaction code
      const suffix = getCurrentSuffix();
      const sessionId = `convert_${Date.now()}_${generateSessionId()}`;
      
      const orderNumberResult = await TransactionGeneratorMiddleware.generateNext({
        prefix: 'SO',
        suffix: suffix,
        sessionId: sessionId
      });
      
      if (!orderNumberResult.success || !orderNumberResult.transactionCode) {
        await dbService.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: orderNumberResult.error || 'Failed to generate Sales Order number' },
          { status: 500 }
        );
      }

      const orderCode = orderNumberResult.transactionCode;
      console.log('[API] Generated Sales Order code:', orderCode);

      // Get quotation details
      const quotationDetails = await dbService.query(
        `SELECT item_code, eng_name, chi_name, qty, unit, price, discount
         FROM t_transaction_d
         WHERE trans_code = ?`,
        [quotationCode]
      );

      // Get quotation payment totals
      const quotationPaymentTotals = await dbService.query(
        `SELECT pm_code, total
         FROM t_transaction_t
         WHERE trans_code = ?`,
        [quotationCode]
      );

      // Insert Sales Order (SO) header as draft (is_settle = 0)
      await dbService.query(
        `INSERT INTO t_transaction_h (
          trans_code, prefix, cust_code, refer_code, shop_code,
          total, employee_code, remark, create_date, modify_date,
          quotation_code, is_void, is_convert, is_settle
        ) VALUES (?, 'SO', ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, 0, 0, 0)`,
        [
          orderCode,
          quotation.cust_code,
          quotation.refer_code,
          quotation.shop_code,
          quotation.total,
          quotation.employee_code,
          quotation.remark,
          quotationCode
        ]
      );

      // Insert Sales Order details
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
              detail.discount
            ]
          );
        }
      }

      // Insert Sales Order payment totals
      if (quotationPaymentTotals.data && quotationPaymentTotals.data.length > 0) {
        for (const payment of quotationPaymentTotals.data) {
          await dbService.query(
            `INSERT INTO t_transaction_t (
              trans_code, pm_code, total,
              create_date, modify_date
            ) VALUES (?, ?, ?, NOW(), NOW())`,
            [
              orderCode,
              payment.pm_code,
              payment.total
            ]
          );
        }
      }

      // Mark quotation as converted and update refer_code to Sales Order code for cross-reference
      await dbService.query(
        `UPDATE t_transaction_h 
         SET is_convert = 1, refer_code = ?, modify_date = NOW()
         WHERE trans_code = ?`,
        [orderCode, quotationCode]
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
        shopCode: String(quotation.shop_code || '').trim(),
        effectivePrefix: 'SO',
        effectiveIsVoid: 0,
        effectiveIsSettle: 0,
        detailQtyByItem: soHoldMap,
      });

      // Commit transaction
      await dbService.query('COMMIT');

      // Commit the Sales Order transaction number
      await dbService.query(
        'UPDATE t_trans_num_generator SET status = "committed" WHERE session_id = ?',
        [sessionId]
      );

      console.log('[API] Quotation converted successfully to Sales Order (draft):', orderCode);
      void logTransactionAction({
        request,
        action: 'CONVERT',
        transCode: quotationCode,
        prefix: 'QTA',
        details: { convertedTo: orderCode },
      });
      void logTransactionAction({
        request,
        action: 'CREATE',
        transCode: orderCode,
        prefix: 'SO',
        details: { convertedFrom: quotationCode },
      });

      return NextResponse.json({
        success: true,
        message: 'Quotation converted to Sales Order (draft) successfully',
        orderCode,
        invoiceCode: orderCode
      });

    } catch (error: unknown) {
      await dbService.query('ROLLBACK');
      console.error('[API] Error converting quotation:', error);
      const msg = error instanceof Error ? error.message : 'Failed to convert quotation to Sales Order';
      return NextResponse.json(
        { success: false, error: msg },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error('[API] Error in convert-quotation endpoint:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}

