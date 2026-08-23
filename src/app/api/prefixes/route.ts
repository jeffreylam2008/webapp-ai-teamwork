import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';
import { ensurePrefixDateColumns, ensurePrefixRefColumn } from '@/lib/ensurePrefixRefColumn';
import { DISPLAY_TO_PREFIX_REF } from '@/lib/prefixRef';
import { logPrefixAction } from '@/lib/audit';

function toStatusLabel(status: unknown): string {
  return Number(status) === 1 ? 'Active' : 'Inactive';
}

type PrefixRow = {
  uid: number;
  prefix: string;
  prefix_ref: string;
  desc: string;
  status: number;
  create_date?: string | Date | null;
  modify_date?: string | Date | null;
};

// GET - Fetch all prefixes
export async function GET(request: NextRequest) {
  try {
    await ensurePrefixRefColumn();
    await ensurePrefixDateColumns();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const sortColumn = searchParams.get('sortColumn') || 'prefix_name';
    const sortDirection = searchParams.get('sortDirection') || 'asc';

    let query =
      'SELECT uid, prefix as prefix_code, prefix_ref, `desc` as prefix_name, status, create_date, modify_date FROM t_prefix';
    let countQuery = 'SELECT COUNT(*) as total FROM t_prefix';
    const params: (string | number)[] = [];
    const countParams: (string | number)[] = [];

    const whereConditions: string[] = [];
    if (search) {
      whereConditions.push('(prefix LIKE ? OR prefix_ref LIKE ? OR `desc` LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (whereConditions.length > 0) {
      const whereClause = ' WHERE ' + whereConditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }

    const validSortColumns = [
      'prefix_code',
      'prefix_ref',
      'prefix_name',
      'status',
      'create_date',
      'modify_date',
    ];
    const sanitizedSortColumn = validSortColumns.includes(sortColumn) ? sortColumn : 'prefix_name';
    const dbSort =
      sanitizedSortColumn === 'prefix_code'
        ? 'prefix'
        : sanitizedSortColumn === 'prefix_name'
          ? '`desc`'
          : sanitizedSortColumn;
    const sanitizedSortDirection = ['asc', 'desc'].includes(sortDirection.toLowerCase())
      ? sortDirection.toLowerCase()
      : 'asc';

    query += ` ORDER BY ${dbSort} ${sanitizedSortDirection}`;

    if (limit) {
      const limitNum = parseInt(limit);
      const offsetNum = offset ? parseInt(offset) : 0;
      query += ' LIMIT ? OFFSET ?';
      params.push(limitNum, offsetNum);
    }

    const result = await dbService.query(query, params);
    const countResult = await dbService.query(countQuery, countParams);
    const totalCount = (countResult.data as unknown as Array<{ total: number }>)[0]?.total || 0;

    return NextResponse.json({
      success: true,
      data: result.data,
      total: totalCount,
      limit: limit ? parseInt(limit) : null,
      offset: offset ? parseInt(offset) : 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch prefixes',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST - Add new prefix
export async function POST(request: NextRequest) {
  try {
    await ensurePrefixRefColumn();
    const body = await request.json();
    const { prefix_code, prefix_name, prefix_desc, prefix_ref, status } = body;

    if (!prefix_code || !prefix_name) {
      return NextResponse.json(
        {
          success: false,
          error: 'Prefix code and prefix name are required',
        },
        { status: 400 }
      );
    }

    const code = String(prefix_code).trim().toUpperCase();
    const refRaw = String(prefix_ref || DISPLAY_TO_PREFIX_REF[code] || `_${code}`).trim().toUpperCase();
    const ref = refRaw.startsWith('_') ? refRaw : `_${refRaw}`;
    const statusVal = status === 'Active' || status === 1 ? 1 : 0;

    const existing = await dbService.query(
      'SELECT prefix FROM t_prefix WHERE UPPER(TRIM(prefix)) = ? OR UPPER(TRIM(prefix_ref)) = ?',
      [code, ref]
    );

    if (existing.data.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Prefix code or prefix_ref already exists',
        },
        { status: 409 }
      );
    }

    await dbService.query(
      'INSERT INTO t_prefix (prefix, prefix_ref, `desc`, status) VALUES (?, ?, ?, ?)',
      [code, ref, prefix_name, statusVal]
    );

    void logPrefixAction({
      request,
      action: 'CREATE',
      prefixRef: ref,
      prefixCode: code,
      details: {
        after: {
          prefix_code: code,
          prefix_ref: ref,
          prefix_name,
          status: statusVal,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Prefix added successfully',
      prefix: {
        prefix_code: code,
        prefix_ref: ref,
        prefix_name,
        prefix_desc,
        status,
      },
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to add prefix',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// PATCH - Update prefix (display code / name / status). prefix_ref is immutable after create.
export async function PATCH(request: NextRequest) {
  try {
    await ensurePrefixRefColumn();
    const body = await request.json();

    const keyRef = String(body.prefix_ref || '').trim();
    const keyCode = String(body.prefix_code || body.original_prefix_code || '').trim();
    if (!keyRef && !keyCode) {
      return NextResponse.json(
        { success: false, error: 'prefix_ref or prefix_code is required' },
        { status: 400 }
      );
    }

    const beforeRes = await dbService.query<PrefixRow>(
      keyRef
        ? `SELECT uid, prefix, prefix_ref, \`desc\`, status, create_date, modify_date
           FROM t_prefix WHERE UPPER(TRIM(prefix_ref)) = UPPER(TRIM(?)) LIMIT 1`
        : `SELECT uid, prefix, prefix_ref, \`desc\`, status, create_date, modify_date
           FROM t_prefix WHERE UPPER(TRIM(prefix)) = UPPER(TRIM(?)) LIMIT 1`,
      [keyRef || keyCode]
    );
    const before = beforeRes.data?.[0];
    if (!before) {
      return NextResponse.json({ success: false, error: 'Prefix not found' }, { status: 404 });
    }

    const updateFields: string[] = [];
    const params: (string | number)[] = [];
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (body.prefix_code !== undefined && body.prefix_code !== null) {
      const newCode = String(body.prefix_code).trim().toUpperCase();
      if (!newCode) {
        return NextResponse.json({ success: false, error: 'prefix_code cannot be empty' }, { status: 400 });
      }
      const existing = await dbService.query<{ prefix: string; prefix_ref: string }>(
        'SELECT prefix, prefix_ref FROM t_prefix WHERE UPPER(TRIM(prefix)) = ?',
        [newCode]
      );
      const row = existing.data?.[0];
      if (row) {
        const sameRow =
          String(row.prefix_ref).toUpperCase() === String(before.prefix_ref).toUpperCase() ||
          String(row.prefix).toUpperCase() === String(before.prefix).toUpperCase();
        if (!sameRow) {
          return NextResponse.json(
            { success: false, error: 'Prefix code already exists' },
            { status: 409 }
          );
        }
      }
      if (String(before.prefix).toUpperCase() !== newCode) {
        updateFields.push('prefix = ?');
        params.push(newCode);
        changes.prefix_code = { from: before.prefix, to: newCode };
      }
    }

    if (body.prefix_name !== undefined) {
      const newName = String(body.prefix_name);
      if (String(before.desc ?? '') !== newName) {
        updateFields.push('`desc` = ?');
        params.push(newName);
        changes.prefix_name = { from: before.desc, to: newName };
      }
    }
    if (body.status !== undefined) {
      const newStatus = body.status === 'Active' || body.status === 1 ? 1 : 0;
      if (Number(before.status) !== newStatus) {
        updateFields.push('status = ?');
        params.push(newStatus);
        changes.status = { from: Number(before.status), to: newStatus };
      }
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ success: true, message: 'No changes detected' });
    }

    updateFields.push('modify_date = NOW()');

    await dbService.query(
      `UPDATE t_prefix SET ${updateFields.join(', ')} WHERE uid = ?`,
      [...params, before.uid]
    );

    void logPrefixAction({
      request,
      action: 'EDIT',
      prefixRef: String(before.prefix_ref),
      prefixCode: String(changes.prefix_code?.to ?? before.prefix),
      details: {
        before: {
          prefix_code: before.prefix,
          prefix_ref: before.prefix_ref,
          prefix_name: before.desc,
          status: Number(before.status),
        },
        after: {
          prefix_code: changes.prefix_code?.to ?? before.prefix,
          prefix_ref: before.prefix_ref,
          prefix_name: changes.prefix_name?.to ?? before.desc,
          status: changes.status?.to ?? Number(before.status),
        },
        changes,
        note: changes.prefix_code
          ? 'Prefix code change affects new transaction numbers and displayed transaction type'
          : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Prefix updated successfully',
      status_label:
        body.status !== undefined
          ? toStatusLabel(body.status === 'Active' || body.status === 1 ? 1 : 0)
          : undefined,
    });
  } catch (error) {
    console.error('Error updating prefix:', error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  }
}

// DELETE is not allowed — prefixes are permanent master data (deactivate via status instead).
export async function DELETE() {
  return NextResponse.json(
    {
      success: false,
      error: 'Deleting prefixes is not allowed. Set status to Inactive instead.',
    },
    { status: 405 }
  );
}
