import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { FUNCTION_PERMISSION_ROWS } from '@/config/transactionPermissions';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken, type AuthUser } from '@/lib/authUtils';
import { accessRowsToPermissionKeys, type EmployeeAccessRow } from '@/lib/employeeAccess';

export type TransactionPermissionAction = 'view' | 'create' | 'edit' | 'delete';

/** t_transaction_h.prefix values mapped to FUNCTION_PERMISSION_ROWS.id */
export const DB_PREFIX_TO_FUNCTION_ID: Record<string, (typeof FUNCTION_PERMISSION_ROWS)[number]['id']> = {
  PO: 'po',
  INV: 'invoice',
  SO: 'sales_order',
  QTA: 'quotation',
  GRN: 'grn',
  ST: 'stocktake',
  DN: 'delivery_note',
  ADJ: 'adjustment',
};

function rowForDbPrefix(prefix: string) {
  const funcId = DB_PREFIX_TO_FUNCTION_ID[String(prefix || '').trim().toUpperCase()];
  if (!funcId) return undefined;
  return FUNCTION_PERMISSION_ROWS.find((r) => r.id === funcId);
}

export function permissionKeyForDbPrefix(
  prefix: string,
  action: TransactionPermissionAction
): string | null {
  const row = rowForDbPrefix(prefix);
  if (!row) return null;
  return row[action];
}

export function filterDbPrefixesByView(keys: Set<string>, prefixes: string[]): string[] {
  return prefixes.filter((p) => {
    const key = permissionKeyForDbPrefix(p, 'view');
    return key != null && keys.has(key);
  });
}

export async function loadPermissionKeysForUser(
  employeeCode: string,
  shopCode: string | null
): Promise<Set<string>> {
  const emp = String(employeeCode || '').trim();
  if (!emp) return new Set();

  let result: { data?: EmployeeAccessRow[] } = { data: [] };
  if (shopCode) {
    const res = await dbService
      .query<EmployeeAccessRow>(
        'SELECT employee_code, `function`, a_create, a_edit, a_delete, a_view FROM t_employee_access WHERE shop_code = ? AND employee_code = ?',
        [shopCode, emp]
      )
      .catch(() => null);
    if (res !== null) {
      result = res;
    } else {
      const fallback = await dbService
        .query<EmployeeAccessRow>(
          'SELECT employee_code, `function`, a_create, a_edit, a_delete, a_view FROM t_employee_access WHERE employee_code = ?',
          [emp]
        )
        .catch(() => ({ data: [] }));
      if (fallback?.data) result = fallback;
    }
  } else {
    const res = await dbService
      .query<EmployeeAccessRow>(
        'SELECT employee_code, `function`, a_create, a_edit, a_delete, a_view FROM t_employee_access WHERE employee_code = ?',
        [emp]
      )
      .catch(() => ({ data: [] }));
    if (res?.data) result = res;
  }

  const rows = (result.data || []) as EmployeeAccessRow[];
  return new Set(accessRowsToPermissionKeys(rows));
}

type AuthOk = { ok: true; user: AuthUser; keys: Set<string> };
type AuthFail = { ok: false; response: NextResponse };

export async function getAuthenticatedPermissionKeys(request: NextRequest): Promise<AuthOk | AuthFail> {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  const auth = await verifyToken(token);
  if (!auth.success || !auth.user) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: 401 }),
    };
  }

  const employeeCode = String(auth.user.employee_code ?? '').trim();
  const shopCode = (auth.user.selected_shopcode || auth.user.default_shopcode || '').trim() || null;
  const keys = await loadPermissionKeysForUser(employeeCode, shopCode);
  return { ok: true, user: auth.user, keys };
}

export function forbiddenResponse(message = 'You do not have permission for this action') {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

export function assertDbPrefixPermission(
  keys: Set<string>,
  prefix: string,
  action: TransactionPermissionAction
): boolean {
  const key = permissionKeyForDbPrefix(prefix, action);
  if (!key) return true;
  return keys.has(key);
}
