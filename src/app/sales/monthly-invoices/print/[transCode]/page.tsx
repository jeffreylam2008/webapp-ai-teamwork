'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PluginRouteGuard from '@install/plugins/PluginRouteGuard';
import { TransactionPrintPageContent } from '@/print-templates';
import { PRINT_TEMPLATE_IDS } from '@/print-templates/printTemplateRegistry';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getInvoiceTexts } from '@/app/sales/invoices/i18n';

function MonthlyInvoicePrintContent() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getInvoiceTexts(lang);
  return (
    <TransactionPrintPageContent
      templateId={PRINT_TEMPLATE_IDS.MONTHLY_INVOICE}
      documentTitle={`${t.invoiceSubtype.monthly} ${t.print.documentTitle}`}
      codeLabel={t.print.codeLabel}
      loadingText={t.print.loading}
      missingCodeText={t.print.missingCode}
      documentNotFoundText={t.print.notFound}
      loadFailedText={t.print.loadFailed}
      printButtonText={t.print.print}
      closeButtonText={t.print.close}
    />
  );
}

export default function MonthlyInvoicePrintPage() {
  return (
    <PluginRouteGuard fallbackHref="/sales/invoices">
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center text-gray-600">
            Loading…
          </div>
        }
      >
        <MonthlyInvoicePrintContent />
      </Suspense>
    </PluginRouteGuard>
  );
}
