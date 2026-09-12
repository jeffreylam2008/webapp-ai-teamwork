import {
  FUNCTION_PERMISSION_ROWS,
  TRANSACTION_PERMISSIONS,
} from '@/config/transactionPermissions';

export interface EmployeeAccessRow {
  employee_code: string;
  function: string;
  a_create: number;
  a_edit: number;
  a_delete: number;
  a_view: number;
}

/** Convert flat permission keys (e.g. create_po, view_invoice) to t_employee_access rows */
export function permissionKeysToAccessRows(
  employeeCode: string,
  permissionKeys: string[]
): EmployeeAccessRow[] {
  const set = new Set(permissionKeys);
  const emp = String(employeeCode);
  return FUNCTION_PERMISSION_ROWS.map((row) => ({
    employee_code: emp,
    function: row.id,
    a_create: set.has(row.create) ? 1 : 0,
    a_edit: set.has(row.edit) ? 1 : 0,
    a_delete: set.has(row.delete) ? 1 : 0,
    a_view: set.has(row.view) ? 1 : 0,
  }));
}

/** Convert t_employee_access rows to flat permission keys for can() checks */
export function accessRowsToPermissionKeys(rows: EmployeeAccessRow[]): string[] {
  const keys: string[] = [];
  const byFunc = new Map<string, EmployeeAccessRow>();
  rows.forEach((r) => byFunc.set(r.function, r));
  FUNCTION_PERMISSION_ROWS.forEach((row) => {
    const r = byFunc.get(row.id);
    if (!r) return;
    if (r.a_create) keys.push(row.create);
    if (r.a_edit) keys.push(row.edit);
    if (r.a_delete) keys.push(row.delete);
    if (r.a_view) keys.push(row.view);
  });
  return keys;
}

/** True when the user has every transaction permission key (Grant full access). */
export function hasFullTransactionAccess(permissionKeys: Iterable<string>): boolean {
  const set = permissionKeys instanceof Set ? permissionKeys : new Set(permissionKeys);
  return TRANSACTION_PERMISSIONS.every((p) => set.has(p.key));
}

/**
 * Non–full-access editors may keep or revoke existing rights, but cannot add new ones.
 * Returns newly requested keys that the editor is not allowed to grant.
 */
export function getUnauthorizedPermissionGrants(
  editorKeys: Iterable<string>,
  targetExistingKeys: Iterable<string>,
  requestedKeys: Iterable<string>,
  editorCanManageAccess = false
): string[] {
  if (editorCanManageAccess || hasFullTransactionAccess(editorKeys)) return [];
  const existing = new Set(targetExistingKeys);
  const unauthorized: string[] = [];
  for (const key of requestedKeys) {
    if (!existing.has(key)) unauthorized.push(key);
  }
  return unauthorized;
}
