import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import {
  DEFAULT_TIMEZONE,
  normalizeTimezone,
  setAppTimezoneCache,
  SYSTEM_TIMEZONE_OPTIONS,
  isValidTimezone,
} from '@/lib/systemTimezone';
import { ensureTimezoneColumns, refreshAppTimezoneFromDb } from '@/lib/systemTimezoneServer';

const ALLOWED_VALUES = new Set(SYSTEM_TIMEZONE_OPTIONS.map((o) => o.value));

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

export async function GET() {
  try {
    const timezone = await refreshAppTimezoneFromDb();
    return NextResponse.json({ success: true, data: { timezone } });
  } catch {
    return NextResponse.json({ success: true, data: { timezone: DEFAULT_TIMEZONE } });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    await ensureTimezoneColumns();

    const body = await request.json().catch(() => ({}));
    const normalized = normalizeTimezone(body?.timezone);
    if (!ALLOWED_VALUES.has(normalized) && !isValidTimezone(normalized)) {
      return NextResponse.json(
        { success: false, error: 'Invalid timezone' },
        { status: 400 }
      );
    }

    const existing = await dbService.query('SELECT 1 FROM t_systems LIMIT 1');
    if (!existing.data || existing.data.length === 0) {
      await dbService.query('INSERT INTO t_systems (timezone) VALUES (?)', [normalized]);
    } else {
      await dbService.query('UPDATE t_systems SET timezone = ?', [normalized]);
    }

    setAppTimezoneCache(normalized);

    return NextResponse.json({
      success: true,
      message: 'Timezone updated',
      data: { timezone: normalized },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : (error as { message?: string } | null)?.message || 'Unknown error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
