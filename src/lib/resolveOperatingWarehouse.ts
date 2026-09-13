export type ShopWarehouseRow = {
  shop_code?: string | null;
  name?: string | null;
  is_warehouse?: number | string | boolean | null;
  default_whcode?: string | null;
};

export function isWarehouseShop(row: ShopWarehouseRow | null | undefined): boolean {
  const flag = row?.is_warehouse;
  return flag === true || flag === 1 || flag === '1';
}

export function formatWarehouseLabel(
  code: string | null | undefined,
  name: string | null | undefined
): string {
  const c = String(code || '').trim();
  const n = String(name || '').trim();
  if (c && n && n !== c) return `${c} – ${n}`;
  return c || n || '';
}

/** One shop maps to one warehouse via `is_warehouse` or `default_whcode`. */
export function warehouseCodeForShop(shop: ShopWarehouseRow | null | undefined): string {
  if (!shop) return '';
  if (isWarehouseShop(shop)) return String(shop.shop_code || '').trim();
  return String(shop.default_whcode || '').trim();
}
