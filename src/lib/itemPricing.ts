/**
 * Default unit prices from item master when adding a transaction line.
 * Sales uses `price`; purchasing prefers `purchase_price` then falls back to `price`.
 */
export type ItemPriceSource = {
  price?: number | null;
  purchase_price?: number | null;
};

export function getSalesDefaultPrice(item: ItemPriceSource | null | undefined): number {
  const n = Number(item?.price ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function getPurchaseDefaultPrice(item: ItemPriceSource | null | undefined): number {
  const purchase = Number(item?.purchase_price ?? 0);
  if (Number.isFinite(purchase) && purchase > 0) return purchase;
  return getSalesDefaultPrice(item);
}
