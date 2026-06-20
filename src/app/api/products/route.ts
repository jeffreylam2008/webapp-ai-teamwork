import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import {
  encodeItemImageBuffer,
  isMaxAllowedPacketError,
  normalizeItemImageBody,
} from '@/lib/itemImageServer';

type ItemRow = {
  uid?: number;
  item_code?: string;
  eng_name?: string;
  chi_name?: string;
  desc?: string | null;
  price?: number | null;
  price_special?: number | null;
  cate_code?: string | null;
  type?: number | null;
  unit?: string | null;
  stock_on_hand?: number | null;
  image_name?: string | null;
  image_body?: string | null;
  create_date?: string | null;
  modify_date?: string | null;
};

function toNum(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

type ColumnName =
  | 'uid'
  | 'item_code'
  | 'eng_name'
  | 'chi_name'
  | 'desc'
  | 'price'
  | 'price_special'
  | 'cate_code'
  | 'type'
  | 'unit'
  | 'image_name'
  | 'image_body'
  | 'create_date'
  | 'modify_date';

const T_ITEMS = 't_items';
const ITEMS_COL_TTL_MS = 60_000;
/** Reject huge base64 images in JSON PATCH (use multipart file upload instead). */
const MAX_JSON_IMAGE_BODY_CHARS = 512 * 1024;
const PATCHABLE_FIELDS = [
  'item_code',
  'eng_name',
  'chi_name',
  'desc',
  'price',
  'price_special',
  'cate_code',
  'type',
  'unit',
  'image_name',
  'image_body',
] as const;
let itemsColCache: { ts: number; cols: Set<string> } | null = null;

async function imageFileToBase64(file: File): Promise<{ image_name: string | null; image_body: string }> {
  const buf = Buffer.from(await file.arrayBuffer());
  return encodeItemImageBuffer(buf, file.name || null);
}

function imageTooLargeResponse() {
  return NextResponse.json(
    {
      success: false,
      error:
        'Image is too large for the database. Use a smaller image (under 1 MB) or re-upload after the app compresses it.',
      timestamp: new Date().toISOString(),
    },
    { status: 413 }
  );
}

async function parsePatchRequest(request: NextRequest): Promise<{
  fields: Record<string, unknown>;
  imageFile: File | null;
}> {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const fields: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (key === 'image' || typeof value !== 'string') continue;
      fields[key] = value;
    }
    if (fields.uid != null && fields.uid !== '') fields.uid = Number(fields.uid);
    if (fields.type != null && fields.type !== '') fields.type = Number(fields.type);
    if (fields.price != null && fields.price !== '') fields.price = Number(fields.price);
    if (fields.price_special != null && fields.price_special !== '') {
      fields.price_special = Number(fields.price_special);
    }
    const img = form.get('image');
    const imageFile = img && typeof img !== 'string' ? (img as File) : null;
    return { fields, imageFile };
  }

  const body = (await request.json()) as Record<string, unknown>;
  if (
    typeof body.image_body === 'string' &&
    body.image_body.length > MAX_JSON_IMAGE_BODY_CHARS
  ) {
    throw new Error('IMAGE_TOO_LARGE');
  }
  return { fields: body, imageFile: null };
}

function buildPatchUpdateData(
  body: Record<string, unknown>,
  allowed: readonly string[]
): Record<string, string | number | boolean | null> {
  const updateData: Record<string, string | number | boolean | null> = {};
  for (const k of allowed) {
    if (body[k] === undefined) continue;
    const v = body[k];
    if (v === null) updateData[k] = null;
    else if (typeof v === 'string') updateData[k] = v;
    else if (typeof v === 'number') updateData[k] = v;
    else if (typeof v === 'boolean') updateData[k] = v;
  }
  return updateData;
}

async function getItemsColumns(): Promise<Set<string>> {
  if (itemsColCache && Date.now() - itemsColCache.ts < ITEMS_COL_TTL_MS) {
    return itemsColCache.cols;
  }
  const r = await dbService.query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
    `,
    [T_ITEMS]
  );
  const cols = new Set<string>((r.data || []).map((x) => String((x as { COLUMN_NAME?: unknown })?.COLUMN_NAME || '').trim()).filter(Boolean));
  itemsColCache = { ts: Date.now(), cols };
  return cols;
}

function selectExpr(col: ColumnName, existing: Set<string>, tableAlias: string): string {
  if (col === 'desc') {
    // `desc` is reserved, but is often used as a column name.
    return existing.has('desc') ? `${tableAlias}.\`desc\` AS \`desc\`` : 'NULL AS `desc`';
  }
  return existing.has(col) ? `${tableAlias}.\`${col}\`` : `NULL AS \`${col}\``;
}

function isTruthy(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
  return false;
}

async function countUsage(itemCode: string): Promise<number> {
  const [d, w, ws] = await Promise.all([
    dbService.query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM t_transaction_d WHERE item_code = ?', [itemCode]),
    dbService.query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM t_warehouse WHERE item_code = ?', [itemCode]),
    dbService.query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM t_warehouse_stage WHERE item_code = ?', [itemCode]),
  ]);
  const n1 = Number((d.data?.[0] as { cnt?: unknown })?.cnt ?? 0) || 0;
  const n2 = Number((w.data?.[0] as { cnt?: unknown })?.cnt ?? 0) || 0;
  const n3 = Number((ws.data?.[0] as { cnt?: unknown })?.cnt ?? 0) || 0;
  return n1 + n2 + n3;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(1, toNum(sp.get('limit'), 10)), 1000);
    const offset = Math.max(0, toNum(sp.get('offset'), 0));
    const search = (sp.get('search') || '').trim();
    const item_code = (sp.get('item_code') || '').trim();
    // useDataTable sends cate_code as `categories`
    const cate_code = (sp.get('categories') || '').trim();

    const where: string[] = ['1=1'];
    const params: (string | number)[] = [];

    if (item_code) {
      where.push('i.item_code = ?');
      params.push(item_code);
    } else if (search) {
      where.push('(i.item_code LIKE ? OR i.eng_name LIKE ? OR i.chi_name LIKE ?)');
      const p = `%${search}%`;
      params.push(p, p, p);
    }
    if (cate_code) {
      where.push('i.cate_code = ?');
      params.push(cate_code);
    }

    const whereClause = where.join(' AND ');

    const countResult = await dbService.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM ${T_ITEMS} i WHERE ${whereClause}`,
      params
    );
    const total = Number((countResult.data?.[0] as { total?: unknown })?.total ?? 0) || 0;

    const cols = await getItemsColumns();
    const itemColsNoStock = (
      [
        'uid',
        'item_code',
        'eng_name',
        'chi_name',
        'desc',
        'price',
        'price_special',
        'cate_code',
        'type',
        'unit',
        'image_name',
        'image_body',
        'create_date',
        'modify_date',
      ] as const
    ).map((c) => selectExpr(c, cols, 'i'));
    // On-hand qty from warehouse (updated by GRN, etc.) + staged, same idea as /api/warehouse/current-stock
    const stockExpr =
      '(COALESCE(w.wh_qty, 0) + COALESCE(st.staged_qty, 0)) AS stock_on_hand';
    const selectList = [...itemColsNoStock, stockExpr].join(', ');

    const dataResult = await dbService.query<ItemRow>(
      `SELECT ${selectList}
       FROM ${T_ITEMS} i
       LEFT JOIN (
         SELECT item_code, SUM(qty) AS wh_qty
         FROM t_warehouse
         GROUP BY item_code
       ) w ON w.item_code = i.item_code
       LEFT JOIN (
         SELECT item_code, COALESCE(SUM(qty), 0) AS staged_qty
         FROM t_warehouse_stage
         GROUP BY item_code
       ) st ON st.item_code = i.item_code
       WHERE ${whereClause}
       ORDER BY i.item_code
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = (dataResult.data || []).map((row) => ({
      ...row,
      image_body: normalizeItemImageBody((row as ItemRow).image_body),
    }));

    return NextResponse.json({
      success: true,
      data,
      total,
      limit,
      offset,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch products',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();

    const item_code = String(form.get('item_code') || '').trim();
    const eng_name = String(form.get('eng_name') || '').trim();
    const chi_name = String(form.get('chi_name') || '').trim();

    if (!item_code || !eng_name || !chi_name) {
      return NextResponse.json({ success: false, error: 'item_code, eng_name, chi_name are required' }, { status: 400 });
    }

    const typeRaw = String(form.get('type') ?? '').trim();
    const type = typeRaw ? Number(typeRaw) : 1;
    const desc = String(form.get('desc') ?? '').trim();
    const unit = String(form.get('unit') ?? '').trim();
    const cate_code = String(form.get('cate_code') ?? '').trim();

    const priceRaw = String(form.get('price') ?? '').trim();
    const price = priceRaw ? Number(priceRaw) : null;
    const priceSpecialRaw = String(form.get('price_special') ?? '').trim();
    const price_special = priceSpecialRaw ? Number(priceSpecialRaw) : null;

    let image_name: string | null = null;
    let image_body: string | null = null;
    const img = form.get('image');
    if (img && typeof img !== 'string') {
      const file = img as File;
      try {
        const encoded = await imageFileToBase64(file);
        image_name = encoded.image_name;
        image_body = encoded.image_body;
      } catch (err) {
        if (err instanceof Error && err.message === 'IMAGE_FILE_TOO_LARGE') {
          return imageTooLargeResponse();
        }
        throw err;
      }
    }

    const insertData: Record<string, string | number | boolean | null> = {
      item_code,
      eng_name,
      chi_name,
      type: Number.isFinite(type) ? type : 1,
      desc: desc || null,
      unit: unit || null,
      cate_code: cate_code || null,
      price: Number.isFinite(Number(price)) ? Number(price) : null,
      price_special: Number.isFinite(Number(price_special)) ? Number(price_special) : null,
      image_name,
      image_body,
    };

    await dbService.insert('t_items', insertData);

    return NextResponse.json({
      success: true,
      message: 'Item created',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errMsg = errorMessage(error);
    if (errMsg === 'IMAGE_FILE_TOO_LARGE' || isMaxAllowedPacketError(errMsg)) {
      return imageTooLargeResponse();
    }
    return NextResponse.json(
      {
        success: false,
        error: errMsg || 'Failed to create item',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '';
}

export async function PATCH(request: NextRequest) {
  try {
    const { fields: body, imageFile } = await parsePatchRequest(request);
    const uid = body.uid != null ? Number(body.uid) : null;
    const item_code = typeof body.item_code === 'string' ? body.item_code.trim() : '';

    if (!uid && !item_code) {
      return NextResponse.json({ success: false, error: 'uid or item_code is required' }, { status: 400 });
    }

    const cols = await getItemsColumns();
    const allowed = PATCHABLE_FIELDS.filter((k) => cols.has(k));

    const updateData = buildPatchUpdateData(body, allowed);

    if (imageFile) {
      try {
        const { image_name, image_body } = await imageFileToBase64(imageFile);
        if (cols.has('image_name')) updateData.image_name = image_name;
        if (cols.has('image_body')) updateData.image_body = image_body;
      } catch (err) {
        if (err instanceof Error && err.message === 'IMAGE_FILE_TOO_LARGE') {
          return imageTooLargeResponse();
        }
        throw err;
      }
    }

    // Update metadata first (small query), then image alone if present (avoids huge multi-column writes)
    const imageOnly: Record<string, string | number | boolean | null> = {};
    if (updateData.image_body !== undefined) imageOnly.image_body = updateData.image_body;
    if (updateData.image_name !== undefined) imageOnly.image_name = updateData.image_name;
    delete updateData.image_body;
    delete updateData.image_name;

    const where = uid ? 'uid = ?' : 'item_code = ?';
    const whereParams = uid ? [uid] : [item_code];

    let updated = false;
    if (Object.keys(updateData).length > 0) {
      await dbService.update('t_items', updateData, where, whereParams);
      updated = true;
    }
    if (Object.keys(imageOnly).length > 0) {
      await dbService.update('t_items', imageOnly, where, whereParams);
      updated = true;
    }

    if (!updated) {
      return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Item updated', timestamp: new Date().toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === 'IMAGE_TOO_LARGE') {
      return NextResponse.json(
        {
          success: false,
          error: 'Image is too large to send as JSON. Save other fields first, then upload the image as a file.',
          timestamp: new Date().toISOString(),
        },
        { status: 413 }
      );
    }
    const errMsg = errorMessage(error);
    if (errMsg === 'IMAGE_FILE_TOO_LARGE' || isMaxAllowedPacketError(errMsg)) {
      return imageTooLargeResponse();
    }
    return NextResponse.json(
      {
        success: false,
        error: errMsg || 'Failed to update item',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const item_code = typeof body.item_code === 'string' ? body.item_code.trim() : '';
    const confirm = isTruthy(body.confirm);

    if (!item_code) {
      return NextResponse.json({ success: false, error: 'item_code is required' }, { status: 400 });
    }

    if (!confirm) {
      const usage = await countUsage(item_code);
      return NextResponse.json({
        success: true,
        canDelete: usage === 0,
        usageCount: usage,
        timestamp: new Date().toISOString(),
      });
    }

    const delResult = await dbService.delete('t_items', 'item_code = ?', [item_code]);
    return NextResponse.json({
      success: true,
      deleted: true,
      affectedRows: delResult.affectedRows ?? 0,
      message: `Item ${item_code} deleted`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete item',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

