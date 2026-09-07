'use client';

import PluginRouteGuard from '@install/plugins/PluginRouteGuard';
import CreateInvoicePageContent from '@/features/invoices/CreateInvoicePageContent';

export default function CreateMonthlyInvoicePage() {
  return (
    <PluginRouteGuard fallbackHref="/sales/invoices">
      <CreateInvoicePageContent mode="monthly" />
    </PluginRouteGuard>
  );
}
