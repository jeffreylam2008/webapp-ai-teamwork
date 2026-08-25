import { useState, useEffect } from 'react';

export interface ItemType {
  type_code: string;
  name: string;
}

export interface ItemTypeOption {
  value: number;
  label: string;
}

const ITEM_TYPES_FETCH_LIMIT = 1000;

let itemTypesCache: ItemType[] | null = null;
let itemTypesPromise: Promise<ItemType[]> | null = null;

export function invalidateItemTypesCache() {
  itemTypesCache = null;
  itemTypesPromise = null;
}

async function loadItemTypes(): Promise<ItemType[]> {
  if (itemTypesCache) {
    return itemTypesCache;
  }

  if (!itemTypesPromise) {
    itemTypesPromise = fetch(`/api/item-types?limit=${ITEM_TYPES_FETCH_LIMIT}`)
      .then(async (res) => {
        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
          const data = result.data as ItemType[];
          itemTypesCache = data;
          return data;
        }
        throw new Error(result.error || 'Failed to fetch item types');
      })
      .catch((err) => {
        itemTypesCache = null;
        throw err;
      })
      .finally(() => {
        itemTypesPromise = null;
      });
  }

  return itemTypesPromise;
}

export function useItemTypes() {
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadItemTypes()
      .then((data) => {
        if (!cancelled) {
          setItemTypes(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load item types');
          setItemTypes([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options: ItemTypeOption[] = itemTypes
    .map((t) => {
      const value = Number(t.type_code);
      if (!Number.isFinite(value) || value <= 0) return null;
      return { value, label: `${t.name} (${t.type_code})` };
    })
    .filter((o): o is ItemTypeOption => o != null);

  return { itemTypes, options, loading, error, refresh: invalidateItemTypesCache };
}
