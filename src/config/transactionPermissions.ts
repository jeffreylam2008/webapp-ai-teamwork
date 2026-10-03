import { PREFIX_REF, normalizeToPrefixRef } from '@/lib/prefixRef';
import { isMonthlyInvoiceSubtype } from '@/config/invoiceSubtypes';

/**
 * Transaction function keys for access control.
 * Used in t_user_permission and in UI to gate view/create/edit/delete per transaction type.
 */

export type FunctionPermissionRow = {
  id: string;
  label: string;
  create: string;
  view: string;
  edit: string;
  delete: string;
  /** When true, only the View checkbox is used (e.g. read-only reports). */
  viewOnly?: boolean;
};

export type InvoicePermissionKeys = {
  view: string;
  create: string;
  edit: string;
  delete: string;
};

/** One row in the permissions table: function name + keys for view, create, edit, delete/void */
export const FUNCTION_PERMISSION_ROWS: FunctionPermissionRow[] = [
  {
    id: 'customer',
    label: 'Customers',
    create: 'create_customer',
    view: 'view_customer',
    edit: 'edit_customer',
    delete: 'delete_customer',
  },
  {
    id: 'supplier',
    label: 'Suppliers',
    create: 'create_supplier',
    view: 'view_supplier',
    edit: 'edit_supplier',
    delete: 'delete_supplier',
  },
  {
    id: 'item',
    label: 'Items',
    create: 'create_item',
    view: 'view_item',
    edit: 'edit_item',
    delete: 'delete_item',
  },
  {
    id: 'category',
    label: 'Categories',
    create: 'create_category',
    view: 'view_category',
    edit: 'edit_category',
    delete: 'delete_category',
  },
  {
    id: 'item_type',
    label: 'Item Types',
    create: 'create_item_type',
    view: 'view_item_type',
    edit: 'edit_item_type',
    delete: 'delete_item_type',
  },
  { id: 'po', label: 'Purchase Order', create: 'create_po', view: 'view_po', edit: 'edit_po', delete: 'void_po' },
  { id: 'invoice', label: 'Invoice', create: 'create_invoice', view: 'view_invoice', edit: 'edit_invoice', delete: 'void_invoice' },
  {
    id: 'monthly_invoice',
    label: 'Monthly Invoice',
    create: 'create_monthly_invoice',
    view: 'view_monthly_invoice',
    edit: 'edit_monthly_invoice',
    delete: 'void_monthly_invoice',
  },
  { id: 'sales_order', label: 'Sales Order', create: 'create_sales_order', view: 'view_sales_order', edit: 'edit_sales_order', delete: 'void_sales_order' },
  { id: 'quotation', label: 'Quotation', create: 'create_quotation', view: 'view_quotation', edit: 'edit_quotation', delete: 'void_quotation' },
  { id: 'grn', label: 'GRN', create: 'create_grn', view: 'view_grn', edit: 'edit_grn', delete: 'void_grn' },
  { id: 'stocktake', label: 'Stocktake', create: 'create_stocktake', view: 'view_stocktake', edit: 'edit_stocktake', delete: 'void_stocktake' },
  { id: 'delivery_note', label: 'Delivery Note', create: 'create_delivery_note', view: 'view_delivery_note', edit: 'edit_delivery_note', delete: 'void_delivery_note' },
  { id: 'adjustment', label: 'Adjustment', create: 'create_adjustment', view: 'view_adjustment', edit: 'edit_adjustment', delete: 'void_adjustment' },
  {
    id: 'sales_report',
    label: 'Sales Report',
    create: 'create_sales_report',
    view: 'view_sales_report',
    edit: 'edit_sales_report',
    delete: 'void_sales_report',
    viewOnly: true,
  },
  {
    id: 'warehouse_report',
    label: 'Warehouse Report',
    create: 'create_warehouse_report',
    view: 'view_warehouse_report',
    edit: 'edit_warehouse_report',
    delete: 'void_warehouse_report',
    viewOnly: true,
  },
  {
    id: 'master_data',
    label: 'Import/Export',
    create: 'create_master_data',
    view: 'view_master_data',
    edit: 'edit_master_data',
    delete: 'void_master_data',
    viewOnly: true,
  },
  {
    id: 'district',
    label: 'Districts',
    create: 'create_district',
    view: 'view_district',
    edit: 'edit_district',
    delete: 'void_district',
    viewOnly: true,
  },
  {
    id: 'prefix',
    label: 'Prefixes',
    create: 'create_prefix',
    view: 'view_prefix',
    edit: 'edit_prefix',
    delete: 'void_prefix',
    viewOnly: true,
  },
  {
    id: 'payment_method',
    label: 'Payment Methods',
    create: 'create_payment_method',
    view: 'view_payment_method',
    edit: 'edit_payment_method',
    delete: 'void_payment_method',
    viewOnly: true,
  },
  {
    id: 'payment_term',
    label: 'Payment Terms',
    create: 'create_payment_term',
    view: 'view_payment_term',
    edit: 'edit_payment_term',
    delete: 'void_payment_term',
    viewOnly: true,
  },
  {
    id: 'shop',
    label: 'Shops',
    create: 'create_shop',
    view: 'view_shop',
    edit: 'edit_shop',
    delete: 'void_shop',
    viewOnly: true,
  },
  {
    id: 'users',
    label: 'Users',
    create: 'create_users',
    view: 'view_users',
    edit: 'edit_users',
    delete: 'void_users',
    viewOnly: true,
  },
  {
    id: 'system',
    label: 'System',
    create: 'create_system',
    view: 'view_system',
    edit: 'edit_system',
    delete: 'void_system',
    viewOnly: true,
  },
];

export function getInvoicePermissionKeys(subtype: string | null | undefined): InvoicePermissionKeys {
  if (isMonthlyInvoiceSubtype(subtype)) {
    return {
      view: 'view_monthly_invoice',
      create: 'create_monthly_invoice',
      edit: 'edit_monthly_invoice',
      delete: 'void_monthly_invoice',
    };
  }
  return {
    view: 'view_invoice',
    create: 'create_invoice',
    edit: 'edit_invoice',
    delete: 'void_invoice',
  };
}

export function isViewOnlyPermissionRow(row: FunctionPermissionRow): boolean {
  return row.viewOnly === true;
}

/** Default UI areas for the access-control matrix (roles / users pages). */
export type FunctionAccessAreaId = 'sales' | 'purchase' | 'warehouse' | 'system';

export type FunctionAccessArea = {
  id: FunctionAccessAreaId;
  label: string;
  /** Function row ids belonging to this area (order preserved). */
  functionIds: string[];
};

export const FUNCTION_ACCESS_AREAS: FunctionAccessArea[] = [
  {
    id: 'sales',
    label: 'Sales',
    functionIds: [
      'customer',
      'invoice',
      'monthly_invoice',
      'sales_order',
      'quotation',
      'sales_report',
    ],
  },
  {
    id: 'purchase',
    label: 'Purchase Order',
    functionIds: ['supplier', 'po'],
  },
  {
    id: 'warehouse',
    label: 'Warehouse',
    functionIds: [
      'item',
      'category',
      'item_type',
      'grn',
      'stocktake',
      'delivery_note',
      'adjustment',
      'warehouse_report',
    ],
  },
  {
    id: 'system',
    label: 'System',
    functionIds: [
      'master_data',
      'district',
      'prefix',
      'payment_method',
      'payment_term',
      'shop',
      'users',
      'system',
    ],
  },
];

export function getFunctionRowsForAccessArea(area: FunctionAccessArea): FunctionPermissionRow[] {
  const byId = new Map(FUNCTION_PERMISSION_ROWS.map((r) => [r.id, r]));
  return area.functionIds
    .map((id) => byId.get(id))
    .filter((r): r is FunctionPermissionRow => r != null);
}

export function getDefaultAccessFlags(row: FunctionPermissionRow): {
  a_create: number;
  a_edit: number;
  a_delete: number;
  a_view: number;
} {
  if (isViewOnlyPermissionRow(row)) {
    return { a_create: 0, a_edit: 0, a_delete: 0, a_view: 1 };
  }
  return { a_create: 1, a_edit: 1, a_delete: 1, a_view: 1 };
}

/** Flat list of all permission keys (for API/usePermissions compatibility) */
export const TRANSACTION_PERMISSIONS = (() => {
  const list: { key: string; label: string }[] = [];
  FUNCTION_PERMISSION_ROWS.forEach((row) => {
    list.push({ key: row.view, label: `View ${row.label}` });
    if (!isViewOnlyPermissionRow(row)) {
      list.push({ key: row.create, label: `Create ${row.label}` });
      list.push({ key: row.edit, label: `Edit ${row.label}` });
      list.push({ key: row.delete, label: `Delete/Void ${row.label}` });
    }
  });
  return list;
})();

/**
 * Map menu path (href) to the view permission required to see that menu item.
 * Sidebar uses this to show/hide menu items: if path is listed here, user must have the
 * corresponding permission (e.g. view_po) or the item is hidden.
 * Paths not in this map are shown to everyone (e.g. Home, Customers, Administration).
 * Must match every gated href in src/data/base-menu.json.
 */
/** t_prefix.prefix_ref (or legacy display) → permission row id */
export function getPermissionRowForTransactionType(transactionType: string) {
  const map: Record<string, FunctionPermissionRow['id']> = {
    [PREFIX_REF.PO]: 'po',
    [PREFIX_REF.INV]: 'invoice',
    [PREFIX_REF.SO]: 'sales_order',
    [PREFIX_REF.QTA]: 'quotation',
    [PREFIX_REF.GRN]: 'grn',
    [PREFIX_REF.ST]: 'stocktake',
    [PREFIX_REF.DN]: 'delivery_note',
    [PREFIX_REF.ADJ]: 'adjustment',
  };
  const ref = normalizeToPrefixRef(transactionType);
  const id = map[ref];
  if (!id) return undefined;
  return FUNCTION_PERMISSION_ROWS.find((r) => r.id === id);
}

/** prefix_ref list for warehouse stock list API based on view permissions */
export function buildWarehouseStockPrefixList(can: (key: string) => boolean): string {
  const parts: string[] = [];
  if (can('view_grn')) parts.push(PREFIX_REF.GRN);
  if (can('view_delivery_note')) parts.push(PREFIX_REF.DN);
  if (can('view_stocktake')) parts.push(PREFIX_REF.ST);
  if (can('view_adjustment')) parts.push(PREFIX_REF.ADJ);
  return parts.join(',');
}

export function canViewWarehouseTransactionType(
  can: (key: string) => boolean,
  transactionType: string
): boolean {
  const row = getPermissionRowForTransactionType(transactionType);
  if (!row) return can('view_grn');
  return can(row.view);
}

/** Warehouse Stock hub menu: show if user has any access to GRN, DN, stocktake, or adjustment */
const WAREHOUSE_STOCK_MENU_FUNCTION_IDS = new Set([
  'grn',
  'delivery_note',
  'stocktake',
  'adjustment',
]);

export function canAccessWarehouseStockMenu(can: (key: string) => boolean): boolean {
  return FUNCTION_PERMISSION_ROWS.some(
    (row) =>
      WAREHOUSE_STOCK_MENU_FUNCTION_IDS.has(row.id) &&
      (can(row.create) || can(row.view) || can(row.edit) || can(row.delete))
  );
}

/** Settings hub / parent menu: show if user can view any settings function. */
const SETTINGS_MENU_FUNCTION_IDS = new Set([
  'district',
  'prefix',
  'payment_method',
  'payment_term',
  'shop',
]);

export function canAccessSettingsMenu(can: (key: string) => boolean): boolean {
  return FUNCTION_PERMISSION_ROWS.some(
    (row) => SETTINGS_MENU_FUNCTION_IDS.has(row.id) && can(row.view)
  );
}

/**
 * Stock page action bar create buttons (GRN, DN, adjustment, stocktake).
 */
export const WAREHOUSE_CREATE_MENU_PERMISSIONS = {
  grn: 'create_grn',
  delivery_note: 'create_delivery_note',
  adjustment: 'create_adjustment',
  stocktake: 'create_stocktake',
} as const;

export type WarehouseCreateActionId = keyof typeof WAREHOUSE_CREATE_MENU_PERMISSIONS;

export function canCreateWarehouseAction(
  can: (key: string) => boolean,
  action: WarehouseCreateActionId
): boolean {
  return can(WAREHOUSE_CREATE_MENU_PERMISSIONS[action]);
}

export const MENU_PATH_VIEW_PERMISSION: Record<string, string> = {
  '/customers': 'view_customer',
  '/suppliers': 'view_supplier',
  '/products/items': 'view_item',
  '/products/categories': 'view_category',
  '/products/item-types': 'view_item_type',
  '/purchasing/purchases': 'view_po',
  '/sales/invoices': 'view_invoice',
  '/sales/monthly-invoices': 'view_monthly_invoice',
  '/sales/orders': 'view_sales_order',
  '/sales/quotations': 'view_quotation',
  '/reports/sales': 'view_sales_report',
  '/reports/warehouse': 'view_warehouse_report',
  '/administration/master-data': 'view_master_data',
  '/administration/settings/district': 'view_district',
  '/administration/settings/prefix': 'view_prefix',
  '/administration/settings/payment-method': 'view_payment_method',
  '/administration/settings/payment-term': 'view_payment_term',
  '/administration/settings/shops': 'view_shop',
  '/administration/users': 'view_users',
  '/administration/settings/system': 'view_system',
};
