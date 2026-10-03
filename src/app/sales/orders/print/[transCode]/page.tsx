'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { TransactionPrintPageContent } from '@/print-templates';
import { PRINT_TEMPLATE_IDS } from '@/print-templates/printTemplateRegistry';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getSalesOrderTexts } from '../../i18n';

function SalesOrderPrintContent() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getSalesOrderTexts(lang), [lang]);

  return (
    <TransactionPrintPageContent
      templateId={PRINT_TEMPLATE_IDS.SALES_ORDER}
      documentTitle={t.print.documentTitle}
      codeLabel={t.print.codeLabel}
      loadingText={t.print.loading}
      missingCodeText={t.print.missingCode}
      documentNotFoundText={t.print.notFound}
      loadFailedText={t.print.loadFailed}
    />
  );
}

export default function SalesOrderPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-600">
          Loading…
        </div>
      }
    >
      <SalesOrderPrintContent />
    </Suspense>
  );
}
