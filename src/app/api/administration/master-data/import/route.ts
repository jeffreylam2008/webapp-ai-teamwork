import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromRequest, verifyToken } from '@/lib/authUtils';
import { importMasterData, type ImportMode, type MasterDataType, parseUploadedMasterFile } from '@/lib/masterDataImportExport';
import { systemLogger } from '@/lib/simple-logger';

export async function POST(request: NextRequest) {
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
    const allowedTypes: MasterDataType[] = [
      'customers',
      'suppliers',
      'districts',
      'prefixes',
      'payment-methods',
      'payment-terms',
    ];
    if (!allowedTypes.includes(type)) {
      return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
    }

    const modeRaw = (searchParams.get('mode') || 'upsert').toLowerCase();
    if (modeRaw === 'replace') {
      return NextResponse.json(
        {
          success: false,
          error: 'Replace import is not allowed. Import merges by key and does not remove existing records.',
        },
        { status: 400 }
      );
    }
    if (modeRaw !== 'upsert') {
      return NextResponse.json(
        { success: false, error: 'Invalid import mode. Only merge import is supported.' },
        { status: 400 }
      );
    }
    const mode: ImportMode = 'upsert';

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'File is required' }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseUploadedMasterFile(text, type);

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No rows found in uploaded file' }, { status: 400 });
    }

    systemLogger.info('Master data import requested', { type, mode, rowCount: rows.length, filename: file.name });

    // Actual DB merge import
    const result = await importMasterData({
      type,
      mode,
      rows,
      user: { uid: auth.user.uid, username: auth.user.username },
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      type,
      mode,
      importedAt: new Date().toISOString(),
      summary: result,
    });
  } catch (error) {
    systemLogger.error('[API] master-data import error', error as Error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to import master data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

