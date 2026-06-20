import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';

const FALLBACK_QUOTATION_VALID_DAYS = 30;
const MIN_DAYS = 1;
const MAX_DAYS = 3650;

function parseDays(value: unknown): number | null {
  const num = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(num)) return null;
  return num;
}

async function requireAuth(request: NextRequest) {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const result = await verifyToken(token);
  if (!result.success) {
    return { ok: false as const, response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  return { ok: true as const };
}

async function ensureQuotationValidDaysColumn() {
  const colResult = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME as column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_systems'
       AND COLUMN_NAME = 'quotation_valid_days'`
  );

  if (!colResult.data || colResult.data.length === 0) {
    await dbService.query(
      `ALTER TABLE t_systems ADD COLUMN quotation_valid_days INT DEFAULT ${FALLBACK_QUOTATION_VALID_DAYS}`
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    await ensureQuotationValidDaysColumn();

    const result = await dbService.query<{ quotation_valid_days: number | null }>(
      'SELECT quotation_valid_days FROM t_systems LIMIT 1'
    );
    const raw = Number(result.data?.[0]?.quotation_valid_days ?? FALLBACK_QUOTATION_VALID_DAYS);
    const quotation_valid_days = Number.isFinite(raw) ? raw : FALLBACK_QUOTATION_VALID_DAYS;

    return NextResponse.json({
      success: true,
      data: { quotation_valid_days },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : (error as { message?: string } | null)?.message || 'Unknown error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    await ensureQuotationValidDaysColumn();

    const body = await request.json().catch(() => ({}));
    const parsed = parseDays(body?.quotation_valid_days);
    if (parsed === null) {
      return NextResponse.json(
        { success: false, error: 'Invalid quotation_valid_days. It must be a number.' },
        { status: 400 }
      );
    }

    const quotation_valid_days = Math.min(Math.max(MIN_DAYS, parsed), MAX_DAYS);

    const existing = await dbService.query('SELECT 1 FROM t_systems LIMIT 1');
    if (!existing.data || existing.data.length === 0) {
      await dbService.query('INSERT INTO t_systems (quotation_valid_days) VALUES (?)', [quotation_valid_days]);
    } else {
      await dbService.query('UPDATE t_systems SET quotation_valid_days = ?', [quotation_valid_days]);
    }

    return NextResponse.json({
      success: true,
      message: 'Quotation validity updated',
      data: { quotation_valid_days },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : (error as { message?: string } | null)?.message || 'Unknown error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

