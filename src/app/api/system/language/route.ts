import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';

const FALLBACK_LANGUAGE = 'en';
const ALLOWED_LANGUAGES = new Set(['en', 'zh-Hant']);

function normalizeLanguage(value: unknown): string {
  if (typeof value !== 'string') return FALLBACK_LANGUAGE;
  const v = value.trim();
  if (!v) return FALLBACK_LANGUAGE;
  if (v.toLowerCase().startsWith('zh')) return 'zh-Hant';
  return 'en';
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

async function ensureLanguageColumn() {
  const colResult = await dbService.query<{ column_name: string }>(
    `SELECT COLUMN_NAME as column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_systems'
       AND COLUMN_NAME = 'language'`
  );
  if (!colResult.data || colResult.data.length === 0) {
    await dbService.query(`ALTER TABLE t_systems ADD COLUMN language VARCHAR(16) DEFAULT '${FALLBACK_LANGUAGE}'`);
  }
}

export async function GET() {
  try {
    await ensureLanguageColumn();
    const result = await dbService.query<{ language: string | null }>('SELECT language FROM t_systems LIMIT 1');
    const raw = result.data?.[0]?.language;
    const language = normalizeLanguage(raw);
    return NextResponse.json({ success: true, data: { language } });
  } catch {
    return NextResponse.json({ success: true, data: { language: FALLBACK_LANGUAGE } });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    await ensureLanguageColumn();

    const body = await request.json().catch(() => ({}));
    const normalized = normalizeLanguage(body?.language);
    if (!ALLOWED_LANGUAGES.has(normalized)) {
      return NextResponse.json(
        { success: false, error: 'Invalid language. Allowed: en, zh-Hant' },
        { status: 400 }
      );
    }

    const existing = await dbService.query('SELECT 1 FROM t_systems LIMIT 1');
    if (!existing.data || existing.data.length === 0) {
      await dbService.query('INSERT INTO t_systems (language) VALUES (?)', [normalized]);
    } else {
      await dbService.query('UPDATE t_systems SET language = ?', [normalized]);
    }

    return NextResponse.json({
      success: true,
      message: 'Language updated',
      data: { language: normalized },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : (error as { message?: string } | null)?.message || 'Unknown error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

