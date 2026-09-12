import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { ensureShopLogoPicColumn } from '@/lib/ensureShopLogoPicColumn';
import {
  encodeItemImageBuffer,
  isMaxAllowedPacketError,
  normalizeItemImageBody,
} from '@/lib/itemImageServer';
import { getAuthenticatedPermissionKeys } from '@/lib/transactionPermissionAuth';

type LogoRow = {
  shop_code: string;
  name?: string | null;
  logo_pic?: unknown;
};

function imageTooLargeResponse() {
  return NextResponse.json(
    {
      success: false,
      error:
        'Image is too large for the database. Use a smaller image (under 1 MB) or re-upload after the app compresses it.',
    },
    { status: 400 }
  );
}

async function requireAuth(request: NextRequest) {
  return getAuthenticatedPermissionKeys(request);
}

/**
 * GET /api/shops/[shop_code]/logo
 * Returns the shop logo as base64 (public — used on login page and sidebar).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shop_code: string }> }
) {
  try {
    const { shop_code } = await params;
    const code = String(shop_code || '').trim();
    if (!code) {
      return NextResponse.json({ success: false, error: 'Shop code is required' }, { status: 400 });
    }

    await ensureShopLogoPicColumn();
    const result = await dbService.query<LogoRow>(
      'SELECT shop_code, name, logo_pic FROM t_shop WHERE shop_code = ? LIMIT 1',
      [code]
    );
    const row = result.data?.[0];
    if (!row) {
      return NextResponse.json({ success: false, error: 'Shop not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        shop_code: row.shop_code,
        name: row.name ?? null,
        logo_pic: normalizeItemImageBody(row.logo_pic),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[shops/logo GET]', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load shop logo',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/shops/[shop_code]/logo
 * multipart: field `logo` (file) — stores binary JPEG/PNG in t_shop.logo_pic
 * JSON: `{ clear: true }` — clears logo_pic
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ shop_code: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { shop_code } = await params;
    const code = String(shop_code || '').trim();
    if (!code) {
      return NextResponse.json({ success: false, error: 'Shop code is required' }, { status: 400 });
    }

    await ensureShopLogoPicColumn();

    const existing = await dbService.query<{ shop_code: string }>(
      'SELECT shop_code FROM t_shop WHERE shop_code = ? LIMIT 1',
      [code]
    );
    if (!existing.data?.[0]) {
      return NextResponse.json({ success: false, error: 'Shop not found' }, { status: 404 });
    }

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const img = form.get('logo') ?? form.get('image');
      if (!img || typeof img === 'string') {
        return NextResponse.json(
          { success: false, error: 'Logo file is required (field name: logo)' },
          { status: 400 }
        );
      }
      const file = img as File;
      const buf = Buffer.from(await file.arrayBuffer());
      try {
        // Validate size via shared encoder; store raw binary bytes (not base64 text).
        encodeItemImageBuffer(buf, file.name || 'logo.jpg');
      } catch (err) {
        if (err instanceof Error && err.message === 'IMAGE_FILE_TOO_LARGE') {
          return imageTooLargeResponse();
        }
        throw err;
      }

      try {
        await dbService.query(
          'UPDATE t_shop SET logo_pic = ?, modify_date = NOW() WHERE shop_code = ?',
          // Buffer is accepted by mysql2; cast for shared query param typing.
          [buf as unknown as string, code]
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isMaxAllowedPacketError(message)) {
          return imageTooLargeResponse();
        }
        throw err;
      }

      return NextResponse.json({
        success: true,
        message: 'Shop logo updated',
        data: {
          shop_code: code,
          logo_pic: buf.toString('base64'),
        },
        timestamp: new Date().toISOString(),
      });
    }

    const body = (await request.json().catch(() => ({}))) as { clear?: unknown };
    if (body.clear === true || body.clear === 1 || body.clear === '1') {
      await dbService.query(
        'UPDATE t_shop SET logo_pic = NULL, modify_date = NOW() WHERE shop_code = ?',
        [code]
      );
      return NextResponse.json({
        success: true,
        message: 'Shop logo cleared',
        data: { shop_code: code, logo_pic: null },
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Send multipart file field "logo", or JSON { "clear": true }',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('[shops/logo PUT]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (isMaxAllowedPacketError(message)) {
      return imageTooLargeResponse();
    }
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update shop logo',
        details: message,
      },
      { status: 500 }
    );
  }
}

/** DELETE /api/shops/[shop_code]/logo — clear logo_pic */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ shop_code: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.ok) return auth.response;

    const { shop_code } = await params;
    const code = String(shop_code || '').trim();
    if (!code) {
      return NextResponse.json({ success: false, error: 'Shop code is required' }, { status: 400 });
    }

    await ensureShopLogoPicColumn();
    await dbService.query(
      'UPDATE t_shop SET logo_pic = NULL, modify_date = NOW() WHERE shop_code = ?',
      [code]
    );

    return NextResponse.json({
      success: true,
      message: 'Shop logo cleared',
      data: { shop_code: code, logo_pic: null },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[shops/logo DELETE]', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to clear shop logo',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
