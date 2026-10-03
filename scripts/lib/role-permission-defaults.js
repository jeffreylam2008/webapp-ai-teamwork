/**
 * Keep in sync with src/config/rolePermissionDefaults.ts
 * and FUNCTION_PERMISSION_ROWS in src/config/transactionPermissions.ts
 */

const PERMISSION_FUNCTIONS = [
  'customer',
  'supplier',
  'item',
  'category',
  'item_type',
  'po',
  'invoice',
  'monthly_invoice',
  'sales_order',
  'quotation',
  'grn',
  'stocktake',
  'delivery_note',
  'adjustment',
  'sales_report',
  'warehouse_report',
  'master_data',
  'district',
  'prefix',
  'payment_method',
  'payment_term',
  'shop',
  'users',
  'system',
];

const VIEW_ONLY_FUNCTIONS = new Set([
  'sales_report',
  'warehouse_report',
  'master_data',
  'district',
  'prefix',
  'payment_method',
  'payment_term',
  'shop',
  'users',
  'system',
]);
const SALES_FUNCTION_IDS = new Set([
  'customer',
  'item',
  'category',
  'item_type',
  'invoice',
  'monthly_invoice',
  'sales_order',
  'quotation',
  'sales_report',
]);
const WAREHOUSE_FUNCTION_IDS = new Set([
  'supplier',
  'item',
  'category',
  'item_type',
  'grn',
  'stocktake',
  'delivery_note',
  'adjustment',
  'warehouse_report',
]);

const EMPLOYEE_ROLES = [
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

function getAccessFlagsForRoleAndFunction(roleCode, functionId) {
  const viewOnly = VIEW_ONLY_FUNCTIONS.has(functionId);
  const noAccess = { a_create: 0, a_edit: 0, a_delete: 0, a_view: 0 };
  const fullAccess = { a_create: 1, a_edit: 1, a_delete: 1, a_view: 1 };
  const viewOnlyAccess = { a_create: 0, a_edit: 0, a_delete: 0, a_view: 1 };

  if (roleCode === 1) {
    return viewOnly ? viewOnlyAccess : fullAccess;
  }
  if (roleCode === 2) {
    if (!SALES_FUNCTION_IDS.has(functionId)) return noAccess;
    return viewOnly ? viewOnlyAccess : fullAccess;
  }
  if (roleCode === 3) {
    if (!WAREHOUSE_FUNCTION_IDS.has(functionId)) return noAccess;
    return viewOnly ? viewOnlyAccess : fullAccess;
  }
  return viewOnlyAccess;
}

module.exports = {
  PERMISSION_FUNCTIONS,
  EMPLOYEE_ROLES,
  getAccessFlagsForRoleAndFunction,
};
