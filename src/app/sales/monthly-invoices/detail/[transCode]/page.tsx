'use client';

import PluginRouteGuard from '@install/plugins/PluginRouteGuard';
import InvoiceDetailPageContent from '@/features/invoices/InvoiceDetailPageContent';

export default function MonthlyInvoiceDetailPage() {
  return (
    <PluginRouteGuard fallbackHref="/sales/invoices">
      <InvoiceDetailPageContent mode="monthly" />
    </PluginRouteGuard>
  );
}
