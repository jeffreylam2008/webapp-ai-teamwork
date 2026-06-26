export function normalizeItemCode(code: string | undefined | null): string {
  return String(code ?? '').trim().toLowerCase();
}

export function calcLineTotal(qty: number, price: number, discount: number): number {
  const lineSubtotal = qty * price;
  return lineSubtotal - lineSubtotal * (discount / 100);
}

export type QuickItemProduct = {
  item_code: string;
  eng_name: string;
  chi_name: string;
  unit?: string;
  price?: number;
  cate_code?: string;
};

export function findProductByItemCode(
  products: QuickItemProduct[],
  code: string
): QuickItemProduct | undefined {
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  const key = normalizeItemCode(trimmed);
  return products.find((item) => normalizeItemCode(item.item_code) === key);
}

export function buildQuickItemCodeOptions(
  products: QuickItemProduct[],
  query: string,
  limit = 15
): Array<{ value: string; label: string }> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return products
    .filter((item) => String(item.item_code ?? '').toLowerCase().startsWith(q))
    .slice(0, limit)
    .map((item) => ({
      value: item.item_code,
      label: [item.item_code, item.eng_name || item.chi_name].filter(Boolean).join(' — '),
    }));
}
