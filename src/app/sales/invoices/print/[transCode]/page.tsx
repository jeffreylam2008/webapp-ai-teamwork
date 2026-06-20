'use client';

import { useSearchParams } from 'next/navigation';
import { TransactionPrintPageContent } from '@/print-templates';
import { PRINT_TEMPLATE_IDS } from '@/print-templates/printTemplateRegistry';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getInvoiceTexts } from '../../i18n';

export default function InvoicePrintPage() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getInvoiceTexts(lang);
  return (
    <TransactionPrintPageContent
      templateId={PRINT_TEMPLATE_IDS.INVOICE}
      documentTitle={t.print.documentTitle}
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
