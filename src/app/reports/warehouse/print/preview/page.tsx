'use client';

import { Suspense } from 'react';
import { WarehouseReportPrintView } from '../../WarehouseReportPrintView';

export default function WarehouseReportPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-600">
          Loading…
        </div>
      }
    >
      <WarehouseReportPrintView />
    </Suspense>
  );
}
