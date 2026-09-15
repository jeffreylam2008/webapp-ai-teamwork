import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  FUNCTION_PERMISSION_ROWS,
  getInvoicePermissionKeys,
} from '@/config/transactionPermissions';
import dbService from '@/lib/database';
import { extractTokenFromRequest, verifyToken, type AuthUser } from '@/lib/authUtils';
import { accessRowsToPermissionKeys, type EmployeeAccessRow } from '@/lib/employeeAccess';
import { PREFIX_REF, normalizeToPrefixRef } from '@/lib/prefixRef';
import { getShopScopeFromAuth } from '@/lib/shopScope';
import { isMonthlyInvoiceSubtype } from '@/config/invoiceSubtypes';

export type TransactionPermissionAction = 'view' | 'create' | 'edit' | 'delete';

/** t_prefix.prefix_ref (stable) → FUNCTION_PERMISSION_ROWS.id. Display codes also accepted via normalize. */
export const DB_PREFIX_TO_FUNCTION_ID: Record<string, (typeof FUNCTION_PERMISSION_ROWS)[number]['id']> = {
  [PREFIX_REF.PO]: 'po',
  [PREFIX_REF.INV]: 'invoice',
  [PREFIX_REF.SO]: 'sales_order',
  [PREFIX_REF.QTA]: 'quotation',
  [PREFIX_REF.GRN]: 'grn',
  [PREFIX_REF.ST]: 'stocktake',
  [PREFIX_REF.DN]: 'delivery_note',
  [PREFIX_REF.ADJ]: 'adjustment',
  // Legacy display aliases (pre-migration callers)
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
  const raw = String(prefix || '').trim().toUpperCase();
  const ref = normalizeToPrefixRef(raw);
  const funcId = DB_PREFIX_TO_FUNCTION_ID[ref] || DB_PREFIX_TO_FUNCTION_ID[raw];
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

/** Filters a list of display codes or prefix_refs; returns normalized prefix_refs the user can view. */
export function filterDbPrefixesByView(keys: Set<string>, prefixes: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of prefixes) {
    const ref = normalizeToPrefixRef(p);
    if (!ref || seen.has(ref)) continue;
    const key = permissionKeyForDbPrefix(ref, 'view');
    if (key != null && keys.has(key)) {
      seen.add(ref);
      out.push(ref);
    }
  }
  return out;
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

type AuthOk = { ok: true; user: AuthUser; keys: Set<string>; shopCode: string };
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
  const shopCode = getShopScopeFromAuth(auth.user);
  const keys = await loadPermissionKeysForUser(employeeCode, shopCode || null);
  return { ok: true, user: auth.user, keys, shopCode };
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

/** Invoice (INV) permissions depend on standard vs monthly subtype. */
export function assertInvoiceSubtypePermission(
  keys: Set<string>,
  invoiceSubtype: string | null | undefined,
  action: TransactionPermissionAction
): boolean {
  const perm = getInvoicePermissionKeys(invoiceSubtype);
  const key =
    action === 'view'
      ? perm.view
      : action === 'create'
        ? perm.create
        : action === 'edit'
          ? perm.edit
          : perm.delete;
  return keys.has(key);
}

/**
 * Permission check for a transaction prefix, with INV subtype awareness.
 */
export function assertTransactionPermission(
  keys: Set<string>,
  prefix: string,
  action: TransactionPermissionAction,
  options?: { invoiceSubtype?: string | null }
): boolean {
  const ref = normalizeToPrefixRef(prefix);
  if (ref === PREFIX_REF.INV || String(prefix || '').trim().toUpperCase() === 'INV') {
    return assertInvoiceSubtypePermission(keys, options?.invoiceSubtype, action);
  }
  return assertDbPrefixPermission(keys, prefix, action);
}

/** True if user can view at least one invoice type (standard or monthly). */
export function canViewAnyInvoice(keys: Set<string>): boolean {
  return keys.has('view_invoice') || keys.has('view_monthly_invoice');
}

export function invoiceFunctionIdForSubtype(invoiceSubtype: string | null | undefined): string {
  return isMonthlyInvoiceSubtype(invoiceSubtype) ? 'monthly_invoice' : 'invoice';
}

export function getPermissionRowById(id: string) {
  return FUNCTION_PERMISSION_ROWS.find((r) => r.id === id);
}
