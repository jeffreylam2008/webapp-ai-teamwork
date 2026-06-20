'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { TransactionPrintPageContent } from '@/print-templates';
import { PRINT_TEMPLATE_IDS } from '@/print-templates/printTemplateRegistry';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getStockTransactionTexts } from '../../i18n';

function DeliveryNotePrintContent() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getStockTransactionTexts(lang), [lang]);

  return (
    <TransactionPrintPageContent
      templateId={PRINT_TEMPLATE_IDS.DELIVERY_NOTE}
      documentTitle={t.print.documentTitle}
      codeLabel={t.print.codeLabel}
      loadingText={t.print.loading}
      missingCodeText={t.print.missingCode}
      documentNotFoundText={t.print.notFound}
      loadFailedText={t.print.loadFailed}
      printButtonText={t.print.print}
      closeButtonText={t.print.close}
      hidePricing
    />
  );
}

export default function DeliveryNotePrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-600">
          Loading…
        </div>
      }
    >
      <DeliveryNotePrintContent />
    </Suspense>
  );
}
