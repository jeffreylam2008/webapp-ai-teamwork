'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  formatWarehouseLabel,
  isWarehouseShop,
  warehouseCodeForShop,
  type ShopWarehouseRow,
} from '@/lib/resolveOperatingWarehouse';

export type CurrentWarehouseState = {
  loading: boolean;
  shopCode: string;
  shopName: string | null;
  warehouseCode: string | null;
  warehouseName: string | null;
  label: string;
};

const emptyState: CurrentWarehouseState = {
  loading: true,
  shopCode: '',
  shopName: null,
  warehouseCode: null,
  warehouseName: null,
  label: '',
};

async function fetchShop(code: string): Promise<ShopWarehouseRow | null> {
  const response = await fetch(`/api/shops/${encodeURIComponent(code)}`, { cache: 'no-store' });
  const json = (await response.json()) as { success?: boolean; data?: ShopWarehouseRow };
  if (!response.ok || !json.success || !json.data) return null;
  return json.data;
}

export function useCurrentWarehouse(enabled = true): CurrentWarehouseState {
  const { user } = useAuth();
  const shopCode = String(user?.selected_shopcode || user?.default_shopcode || '').trim();
  const [state, setState] = useState<CurrentWarehouseState>({
    ...emptyState,
    shopCode,
    shopName: user?.selected_shopname ?? null,
    loading: Boolean(enabled && shopCode),
  });

  useEffect(() => {
    if (!enabled) {
      setState({ ...emptyState, loading: false, shopCode, shopName: user?.selected_shopname ?? null });
      return;
    }
    if (!shopCode) {
      setState({ ...emptyState, loading: false });
      return;
    }

    let cancelled = false;
    setState((prev) => ({
      ...prev,
      loading: true,
      shopCode,
      shopName: user?.selected_shopname ?? prev.shopName,
    }));

    void (async () => {
      try {
        const shop = await fetchShop(shopCode);
        if (cancelled) return;
        const shopName = String(shop?.name || user?.selected_shopname || '').trim() || null;
        const warehouseCode = warehouseCodeForShop(shop);
        let warehouseName: string | null = null;
        if (warehouseCode) {
          if (isWarehouseShop(shop) && warehouseCode === shopCode) {
            warehouseName = shopName;
          } else {
            const warehouse = await fetchShop(warehouseCode);
            if (cancelled) return;
            warehouseName = String(warehouse?.name || '').trim() || null;
          }
        }
        setState({
          loading: false,
          shopCode,
          shopName,
          warehouseCode: warehouseCode || null,
          warehouseName,
          label: formatWarehouseLabel(warehouseCode, warehouseName),
        });
      } catch {
        if (!cancelled) {
          setState({
            ...emptyState,
            loading: false,
            shopCode,
            shopName: user?.selected_shopname ?? null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, shopCode, user?.selected_shopname]);

  return state;
}
