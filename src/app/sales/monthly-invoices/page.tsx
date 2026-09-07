'use client';

import PluginRouteGuard from '@install/plugins/PluginRouteGuard';
import InvoicesListPageContent from '@/features/invoices/InvoicesListPageContent';

export default function MonthlyInvoicesPage() {
  return (
    <PluginRouteGuard fallbackHref="/sales/invoices">
      <InvoicesListPageContent mode="monthly" />
    </PluginRouteGuard>
  );
}
