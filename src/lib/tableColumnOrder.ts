import type { ColumnsType } from 'antd/es/table';

const STORAGE_PREFIX = 'table-column-order';

export const PINNED_COLUMN_KEYS = new Set(['actions']);

export function getColumnOrderStorageKey(
  tableKey: string,
  userKey: string | number | null | undefined
): string {
  const user = userKey != null ? String(userKey) : 'anonymous';
  return `${STORAGE_PREFIX}:${user}:${tableKey}`;
}

export function readColumnOrder(storageKey: string): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string')
      : null;
  } catch {
    return null;
  }
}

export function writeColumnOrder(storageKey: string, order: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    // Ignore quota or private-mode errors.
  }
}

export function getColumnKey<T>(column: ColumnsType<T>[number]): string {
  if ('children' in column && column.children?.length) {
    return String(column.key ?? '');
  }
  const dataColumn = column as {
    key?: string | number;
    dataIndex?: string | number | readonly (string | number)[];
  };
  const dataIndex = dataColumn.dataIndex;
  const dataIndexKey = Array.isArray(dataIndex) ? dataIndex.join('.') : dataIndex;
  return String(dataColumn.key ?? dataIndexKey ?? '');
}

export function getDefaultColumnKeys<T>(columns: ColumnsType<T>): string[] {
  return columns.map(getColumnKey).filter(Boolean);
}

export function getDraggableColumnKeys<T>(columns: ColumnsType<T>): string[] {
  return getDefaultColumnKeys(columns).filter((key) => !PINNED_COLUMN_KEYS.has(key));
}

export function mergeColumnOrder(stored: string[], defaultKeys: string[]): string[] {
  const merged = [
    ...stored.filter((key) => defaultKeys.includes(key)),
    ...defaultKeys.filter((key) => !stored.includes(key)),
  ];
  return merged.length ? merged : defaultKeys;
}

export function applyColumnOrder<T>(
  columns: ColumnsType<T>,
  orderKeys: string[] | null | undefined
): ColumnsType<T> {
  if (!orderKeys?.length) return columns;

  const byKey = new Map<string, ColumnsType<T>[number]>();
  for (const column of columns) {
    const key = getColumnKey(column);
    if (key) byKey.set(key, column);
  }

  const pinned = columns.filter((column) => PINNED_COLUMN_KEYS.has(getColumnKey(column)));
  const draggableDefaultKeys = getDraggableColumnKeys(columns);
  const orderedKeys = mergeColumnOrder(orderKeys, draggableDefaultKeys);
  const ordered = orderedKeys
    .map((key) => byKey.get(key))
    .filter((column): column is ColumnsType<T>[number] => column != null);

  return [...pinned, ...ordered];
}

export function reorderColumnKeys(keys: string[], dragKey: string, dropKey: string): string[] {
  if (
    dragKey === dropKey ||
    PINNED_COLUMN_KEYS.has(dragKey) ||
    PINNED_COLUMN_KEYS.has(dropKey)
  ) {
    return keys;
  }

  const from = keys.indexOf(dragKey);
  const to = keys.indexOf(dropKey);
  if (from < 0 || to < 0) return keys;

  const next = [...keys];
  next.splice(from, 1);
  next.splice(to, 0, dragKey);
  return next;
}
