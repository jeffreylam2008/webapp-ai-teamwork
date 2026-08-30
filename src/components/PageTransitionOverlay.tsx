'use client';

import { Spin } from 'antd';
import { AppSpinIndicator } from '@/components/AppSpinIndicator';

export default function PageTransitionOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="page-transition-overlay" aria-busy="true" aria-live="polite">
      <Spin indicator={<AppSpinIndicator size={36} />} />
    </div>
  );
}
