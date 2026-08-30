'use client';

import { Spin } from 'antd';
import { AppSpinIndicator } from '@/components/AppSpinIndicator';

export default function PageLoadingCenter({ minHeight = 280 }: { minHeight?: number }) {
  return (
    <div
      className="flex items-center justify-center w-full"
      style={{ minHeight }}
      aria-busy="true"
      aria-live="polite"
    >
      <Spin indicator={<AppSpinIndicator size={32} />} />
    </div>
  );
}
