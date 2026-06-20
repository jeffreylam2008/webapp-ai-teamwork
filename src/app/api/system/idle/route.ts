import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';

const FALLBACK_IDLE_MINUTES = 10;
const MIN_IDLE_MINUTES = 1;
const MAX_IDLE_MINUTES = 1440;

function parseIdle(value: unknown): number | null {
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

async function ensureIdleColumn() {
  const colResult = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME as column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_systems'
       AND COLUMN_NAME = 'idle'`
  );

  if (!colResult.data || colResult.data.length === 0) {
    await dbService.query(`ALTER TABLE t_systems ADD COLUMN idle INT DEFAULT ${FALLBACK_IDLE_MINUTES}`);
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    await ensureIdleColumn();

    const result = await dbService.query<{ idle: number | null }>('SELECT idle FROM t_systems LIMIT 1');
    const idleRaw = Number(result.data?.[0]?.idle ?? FALLBACK_IDLE_MINUTES);
    const idle = Number.isFinite(idleRaw) ? idleRaw : FALLBACK_IDLE_MINUTES;

    return NextResponse.json({
      success: true,
      data: { idle },
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

    await ensureIdleColumn();

    const body = await request.json().catch(() => ({}));
    const idleParsed = parseIdle(body?.idle);
    if (idleParsed === null) {
      return NextResponse.json({ success: false, error: 'Invalid idle value. idle must be a number.' }, { status: 400 });
    }

    const idle = Math.min(Math.max(MIN_IDLE_MINUTES, idleParsed), MAX_IDLE_MINUTES);

    const existing = await dbService.query('SELECT 1 FROM t_systems LIMIT 1');
    if (!existing.data || existing.data.length === 0) {
      await dbService.query('INSERT INTO t_systems (idle) VALUES (?)', [idle]);
    } else {
      await dbService.query('UPDATE t_systems SET idle = ?', [idle]);
    }

    return NextResponse.json({
      success: true,
      message: 'Idle setting updated',
      data: { idle },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : (error as { message?: string } | null)?.message || 'Unknown error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

