import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';

const FALLBACK_DEFAULT_PAGE_SIZE = 100;
const FALLBACK_MAX_PAGE_SIZE = 500;

function parsePageSize(value: unknown): number | null {
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

async function ensurePaginationColumns() {
  const colResult = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME as column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_systems'
       AND COLUMN_NAME IN ('page_size_default', 'page_size_max')`
  );
  const cols = new Set((colResult.data || []).map(r => String((r as unknown as { column_name?: string }).column_name)));

  if (!cols.has('page_size_default')) {
    await dbService.query(`ALTER TABLE t_systems ADD COLUMN page_size_default INT DEFAULT ${FALLBACK_DEFAULT_PAGE_SIZE}`);
  }
  if (!cols.has('page_size_max')) {
    await dbService.query(`ALTER TABLE t_systems ADD COLUMN page_size_max INT DEFAULT ${FALLBACK_MAX_PAGE_SIZE}`);
  }
}

export async function GET(_request: NextRequest) {
  try {
    // Intentionally no auth required for GET (UI can read page size settings)
    await ensurePaginationColumns();

    const result = await dbService.query<{ page_size_default: number | null; page_size_max: number | null }>(
      'SELECT page_size_default, page_size_max FROM t_systems LIMIT 1'
    );

    const page_size_default = Number(result.data?.[0]?.page_size_default ?? FALLBACK_DEFAULT_PAGE_SIZE);
    const page_size_max = Number(result.data?.[0]?.page_size_max ?? FALLBACK_MAX_PAGE_SIZE);

    return NextResponse.json({
      success: true,
      data: {
        page_size_default: Number.isFinite(page_size_default) ? page_size_default : FALLBACK_DEFAULT_PAGE_SIZE,
        page_size_max: Number.isFinite(page_size_max) ? page_size_max : FALLBACK_MAX_PAGE_SIZE,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    await ensurePaginationColumns();

    const body = await request.json().catch(() => ({}));
    const pageSizeDefaultRaw = parsePageSize(body?.page_size_default);
    const pageSizeMaxRaw = parsePageSize(body?.page_size_max);

    if (pageSizeDefaultRaw === null || pageSizeMaxRaw === null) {
      return NextResponse.json(
        { success: false, error: 'Invalid pagination values. page_size_default and page_size_max must be numbers.' },
        { status: 400 }
      );
    }

    const page_size_max = Math.min(Math.max(1, pageSizeMaxRaw), FALLBACK_MAX_PAGE_SIZE);
    const page_size_default = Math.min(Math.max(1, pageSizeDefaultRaw), page_size_max);

    // t_systems has a single row in this deployment. If empty, create it.
    const existing = await dbService.query('SELECT 1 FROM t_systems LIMIT 1');
    if (!existing.data || existing.data.length === 0) {
      await dbService.query(
        'INSERT INTO t_systems (page_size_default, page_size_max) VALUES (?, ?)',
        [page_size_default, page_size_max]
      );
    } else {
      await dbService.query('UPDATE t_systems SET page_size_default = ?, page_size_max = ?', [page_size_default, page_size_max]);
    }

    return NextResponse.json({
      success: true,
      message: 'Pagination settings updated',
      data: { page_size_default, page_size_max },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

