'use client';

import { useCurrentWarehouse } from '@/hooks/useCurrentWarehouse';

type CurrentWarehouseBannerProps = {
  title: string;
  forShop: (shopLabel: string) => string;
  notAssigned: string;
};

export default function CurrentWarehouseBanner({
  title,
  forShop,
  notAssigned,
}: CurrentWarehouseBannerProps) {
  const current = useCurrentWarehouse();
  const shopLabel = current.shopName
    ? `${current.shopCode} – ${current.shopName}`
    : current.shopCode;

  return (
    <div className="current-warehouse-description" role="status">
      <div className="current-warehouse-description__line">
        <span className="current-warehouse-description__label">{title}:</span>
        {current.loading ? (
          <span>…</span>
        ) : current.label ? (
          <span className="current-warehouse-description__value">{current.label}</span>
        ) : (
          <span className="current-warehouse-description__muted">{notAssigned}</span>
        )}
      </div>
      {shopLabel && current.label ? (
        <div className="current-warehouse-description__shop">{forShop(shopLabel)}</div>
      ) : null}
    </div>
  );
}
