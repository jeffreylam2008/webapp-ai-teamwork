import {
  FUNCTION_PERMISSION_ROWS,
  isViewOnlyPermissionRow,
  type FunctionPermissionRow,
} from '@/config/transactionPermissions';

export type EmployeeRoleDefinition = {
  role_code: number;
  role_key: string;
  role_name: string;
  description: string;
  sort_order: number;
};

export type AccessFlags = {
  a_create: number;
  a_edit: number;
  a_delete: number;
  a_view: number;
};

export const ADMINISTRATOR_ROLE_CODE = 1;

export function isAdministratorRoleCode(roleCode: number | null | undefined): boolean {
  return roleCode != null && Number.isFinite(roleCode) && Number(roleCode) === ADMINISTRATOR_ROLE_CODE;
}

/** Canonical role list — keep in sync with scripts/lib/role-permission-defaults.js */
export const EMPLOYEE_ROLES: EmployeeRoleDefinition[] = [
  {
    role_code: 1,
    role_key: 'administrator',
    role_name: 'Administrator',
    description: 'Full access to all transaction functions',
    sort_order: 1,
  },
  {
    role_code: 2,
    role_key: 'sales_manager',
    role_name: 'Sales Manager',
    description: 'Access to sales transactions and sales reports',
    sort_order: 2,
  },
  {
    role_code: 3,
    role_key: 'warehouse_manager',
    role_name: 'Warehouse Manager',
    description: 'Access to warehouse stock transactions and warehouse reports',
    sort_order: 3,
  },
];

const SALES_FUNCTION_IDS = new Set([
  'invoice',
  'monthly_invoice',
  'sales_order',
  'quotation',
  'sales_report',
]);
const WAREHOUSE_FUNCTION_IDS = new Set([
  'grn',
  'stocktake',
  'delivery_note',
  'adjustment',
  'warehouse_report',
]);

const NO_ACCESS: AccessFlags = { a_create: 0, a_edit: 0, a_delete: 0, a_view: 0 };
const FULL_ACCESS: AccessFlags = { a_create: 1, a_edit: 1, a_delete: 1, a_view: 1 };
const VIEW_ONLY_ACCESS: AccessFlags = { a_create: 0, a_edit: 0, a_delete: 0, a_view: 1 };

export function getEmployeeRoleByCode(roleCode: number): EmployeeRoleDefinition | undefined {
  return EMPLOYEE_ROLES.find((r) => r.role_code === roleCode);
}

export function getAccessFlagsForRoleAndFunction(
  roleCode: number,
  functionId: string,
  row?: FunctionPermissionRow
): AccessFlags {
  const permRow = row ?? FUNCTION_PERMISSION_ROWS.find((r) => r.id === functionId);
  const viewOnly = permRow ? isViewOnlyPermissionRow(permRow) : false;

  if (roleCode === 1) {
    return viewOnly ? VIEW_ONLY_ACCESS : FULL_ACCESS;
  }
  if (roleCode === 2) {
    if (!SALES_FUNCTION_IDS.has(functionId)) return NO_ACCESS;
    return viewOnly ? VIEW_ONLY_ACCESS : FULL_ACCESS;
  }
  if (roleCode === 3) {
    if (!WAREHOUSE_FUNCTION_IDS.has(functionId)) return NO_ACCESS;
    return viewOnly ? VIEW_ONLY_ACCESS : FULL_ACCESS;
  }

  // Legacy / unknown roles: view-only (matches previous seed behaviour for non-supervisor codes)
  return VIEW_ONLY_ACCESS;
}

export function buildRoleDefaultAccessRows(roleCode: number): Array<{
  role_code: number;
  function: string;
  a_create: number;
  a_edit: number;
  a_delete: number;
  a_view: number;
}> {
  return FUNCTION_PERMISSION_ROWS.map((row) => {
    const flags = getAccessFlagsForRoleAndFunction(roleCode, row.id, row);
    return {
      role_code: roleCode,
      function: row.id,
      ...flags,
    };
  });
}
