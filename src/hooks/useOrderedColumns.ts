'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';

const DEFAULT_PINNED_KEYS = ['actions'];

export function getColumnKey<T>(col: ColumnsType<T>[number], index: number): string {
  if (col.key != null) return String(col.key);
  if ('dataIndex' in col && col.dataIndex != null) {
    return Array.isArray(col.dataIndex) ? col.dataIndex.join('.') : String(col.dataIndex);
  }
  return `col_${index}`;
}

function loadOrder(storageKey: string): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

function saveOrder(storageKey: string, reorderableKeys: string[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(reorderableKeys));
  } catch {
    // ignore quota / private mode
  }
}

function buildOrder(
  columnKeys: string[],
  pinnedColumnKeys: string[],
  reorderableOverride: string[] | null
): string[] {
  const pinned = columnKeys.filter((key) => pinnedColumnKeys.includes(key));
  const reorderable = columnKeys.filter((key) => !pinnedColumnKeys.includes(key));

  let nextReorderable: string[];
  if (reorderableOverride) {
    const valid = reorderableOverride.filter((key) => reorderable.includes(key));
    const missing = reorderable.filter((key) => !valid.includes(key));
    nextReorderable = [...valid, ...missing];
  } else {
    nextReorderable = reorderable;
  }

  return [...pinned, ...nextReorderable];
}

export function resolvePinnedColumnKeys<T>(
  columns: ColumnsType<T>,
  extraPinned: string[] = DEFAULT_PINNED_KEYS
): string[] {
  const pinned: string[] = [];
  columns.forEach((col, index) => {
    const key = getColumnKey(col, index);
    if (extraPinned.includes(key) || col.fixed) {
      pinned.push(key);
    }
  });
  return pinned;
}

export function useOrderedColumns<T>(
  columns: ColumnsType<T>,
  storageKey: string,
  extraPinned: string[] = DEFAULT_PINNED_KEYS
) {
  const extraPinnedSig = extraPinned.join('\0');

  const columnKeys = useMemo(
    () => columns.map((col, index) => getColumnKey(col, index)),
    [columns]
  );

  const columnKeysSig = useMemo(() => columnKeys.join('\0'), [columnKeys]);

  const pinnedColumnKeys = useMemo(
    () => resolvePinnedColumnKeys(columns, extraPinned),
    [columns, extraPinnedSig]
  );

  const pinnedSig = useMemo(() => pinnedColumnKeys.join('\0'), [pinnedColumnKeys]);

  const layoutSig = `${storageKey}\0${columnKeysSig}\0${pinnedSig}`;

  const [dragState, setDragState] = useState<{
    layoutSig: string;
    reorderableKeys: string[];
  } | null>(null);

  const savedReorderableKeys = useMemo(() => {
    const reorderable = columnKeys.filter((key) => !pinnedColumnKeys.includes(key));
    const saved = loadOrder(storageKey);
    if (!saved) return null;
    const savedFiltered = saved.filter((key) => reorderable.includes(key));
    const newKeys = reorderable.filter((key) => !savedFiltered.includes(key));
    return [...savedFiltered, ...newKeys];
  }, [columnKeys, columnKeysSig, pinnedColumnKeys, pinnedSig, storageKey]);

  const reorderableOverride =
    dragState?.layoutSig === layoutSig ? dragState.reorderableKeys : savedReorderableKeys;

  const order = useMemo(
    () => buildOrder(columnKeys, pinnedColumnKeys, reorderableOverride),
    [columnKeys, pinnedColumnKeys, reorderableOverride]
  );

  const orderedColumns = useMemo(() => {
    const byKey = new Map<string, ColumnsType<T>[number]>();
    columns.forEach((col, index) => byKey.set(getColumnKey(col, index), col));
    return order.map((key) => byKey.get(key)).filter(Boolean) as ColumnsType<T>;
  }, [columns, order]);

  const moveColumn = useCallback(
    (sourceKey: string, targetKey: string) => {
      if (
        pinnedColumnKeys.includes(sourceKey) ||
        pinnedColumnKeys.includes(targetKey) ||
        sourceKey === targetKey
      ) {
        return;
      }

      const currentReorderable = order.filter((key) => !pinnedColumnKeys.includes(key));
      const fromIndex = currentReorderable.indexOf(sourceKey);
      const toIndex = currentReorderable.indexOf(targetKey);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

      const nextRest = [...currentReorderable];
      nextRest.splice(fromIndex, 1);
      nextRest.splice(toIndex, 0, sourceKey);

      saveOrder(storageKey, nextRest);
      setDragState({ layoutSig, reorderableKeys: nextRest });
    },
    [layoutSig, order, pinnedColumnKeys, storageKey]
  );

  return { orderedColumns, moveColumn, pinnedColumnKeys };
}
