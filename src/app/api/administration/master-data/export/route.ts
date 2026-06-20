import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import dbService from '@/lib/database';
import { exportMasterData, type MasterDataType } from '@/lib/masterDataImportExport';
import { systemLogger, userActionLogger } from '@/lib/simple-logger';

export async function GET(request: NextRequest) {
  try {
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')?.[0]?.trim() ||
      request.headers.get('x-real-ip')?.trim() ||
      undefined;

    const token = extractTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const auth = await verifyToken(token);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const typeRaw = searchParams.get('type');
    const type = (typeRaw || '').trim() as MasterDataType;
    const allowed: MasterDataType[] = [
      'customers',
      'suppliers',
      'districts',
      'prefixes',
      'payment-methods',
      'payment-terms',
    ];
    if (!allowed.includes(type)) {
      return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
    }

    // Basic export count (for audit log)
    const countRes = await dbService.query<{ cnt: number }>(
      (() => {
        switch (type) {
          case 'customers':
            return 'SELECT COUNT(*) as cnt FROM t_customers';
          case 'suppliers':
            return 'SELECT COUNT(*) as cnt FROM t_suppliers';
          case 'districts':
            return 'SELECT COUNT(*) as cnt FROM t_district';
          case 'prefixes':
            return 'SELECT COUNT(*) as cnt FROM t_prefix';
          case 'payment-methods':
            return 'SELECT COUNT(*) as cnt FROM t_payment_method';
          case 'payment-terms':
            return 'SELECT COUNT(*) as cnt FROM t_payment_term';
          default:
            return 'SELECT 0 as cnt';
        }
      })()
    );
    const recordCount = Number(countRes.data?.[0]?.cnt ?? 0);

    const rows = await exportMasterData(type);

    userActionLogger.export(
      String(auth.user.uid),
      auth.user.username,
      `master-data:${type}`,
      'json',
      recordCount,
      ipAddress
    );

    systemLogger.info('Master data export', { type, recordCount });

    return NextResponse.json({
      success: true,
      type,
      format: 'json',
      data: rows,
      exportedAt: new Date().toISOString(),
    });
  } catch (error) {
    systemLogger.error('[API] master-data export error', error as Error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to export master data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

