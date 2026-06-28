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

/** One row in the permissions table: function name + keys for view, create, edit, delete/void */
export const FUNCTION_PERMISSION_ROWS: FunctionPermissionRow[] = [
  { id: 'po', label: 'Purchase Order', create: 'create_po', view: 'view_po', edit: 'edit_po', delete: 'void_po' },
  { id: 'invoice', label: 'Invoice', create: 'create_invoice', view: 'view_invoice', edit: 'edit_invoice', delete: 'void_invoice' },
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
];

export function isViewOnlyPermissionRow(row: FunctionPermissionRow): boolean {
  return row.viewOnly === true;
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
/** t_transaction_h.prefix → permission row id (see DB_PREFIX_TO_FUNCTION_ID in transactionPermissionAuth) */
export function getPermissionRowForTransactionType(transactionType: string) {
  const map: Record<string, FunctionPermissionRow['id']> = {
    PO: 'po',
    INV: 'invoice',
    SO: 'sales_order',
    QTA: 'quotation',
    GRN: 'grn',
    ST: 'stocktake',
    DN: 'delivery_note',
    ADJ: 'adjustment',
  };
  const id = map[String(transactionType || '').trim().toUpperCase()];
  if (!id) return undefined;
  return FUNCTION_PERMISSION_ROWS.find((r) => r.id === id);
}

/** Prefixes for warehouse stock list API based on view permissions */
export function buildWarehouseStockPrefixList(can: (key: string) => boolean): string {
  const parts: string[] = [];
  if (can('view_grn')) parts.push('GRN');
  if (can('view_delivery_note')) parts.push('DN');
  if (can('view_stocktake')) parts.push('ST');
  if (can('view_adjustment')) parts.push('ADJ');
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
  '/purchasing/purchases': 'view_po',
  '/sales/invoices': 'view_invoice',
  '/sales/monthly-invoices': 'view_invoice',
  '/sales/orders': 'view_sales_order',
  '/sales/quotations': 'view_quotation',
  '/reports/sales': 'view_sales_report',
};
