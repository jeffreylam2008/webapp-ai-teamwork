export type WarehouseReportGroupBy =
  | 'document'
  | 'document_detail'
  | 'movement'
  | 'movement_detail'
  | 'product';

export function parseWarehouseReportGroupBy(
  raw: string | null | undefined
): WarehouseReportGroupBy {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'document_detail') return 'document_detail';
  if (value === 'movement') return 'movement';
  if (value === 'movement_detail') return 'movement_detail';
  if (value === 'product' || value === 'item') return 'product';
  return 'document';
}

export function isDocumentGroup(groupBy: WarehouseReportGroupBy): boolean {
  return groupBy === 'document' || groupBy === 'document_detail';
}

export function isMovementGroup(groupBy: WarehouseReportGroupBy): boolean {
  return groupBy === 'movement' || groupBy === 'movement_detail';
}

export function isDetailGroup(groupBy: WarehouseReportGroupBy): boolean {
  return groupBy === 'document_detail' || groupBy === 'movement_detail';
}

export const WAREHOUSE_MOVEMENT_LABELS: Record<string, { en: string; zh: string }> = {
  GRN: { en: 'Goods Received (GRN)', zh: '收貨 (GRN)' },
  DN: { en: 'Delivery Note (DN)', zh: '送貨單 (DN)' },
  ADJ: { en: 'Adjustment (ADJ)', zh: '調整 (ADJ)' },
  ST: { en: 'Stocktake (ST)', zh: '盤點 (ST)' },
};
