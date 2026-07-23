'use client';

import { Suspense } from 'react';
import { SalesReportPrintView } from '../../SalesReportPrintView';

export default function SalesReportPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-600">
          Loading…
        </div>
      }
    >
      <SalesReportPrintView />
    </Suspense>
  );
}
