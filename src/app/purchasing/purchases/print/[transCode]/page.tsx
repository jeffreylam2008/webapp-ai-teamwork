'use client';

import { useSearchParams } from 'next/navigation';
import { TransactionPrintPageContent } from '@/print-templates';
import { PRINT_TEMPLATE_IDS } from '@/print-templates/printTemplateRegistry';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getPurchaseOrderTexts } from '../../i18n';

export default function PurchaseOrderPrintPage() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = getPurchaseOrderTexts(lang);
  return (
    <TransactionPrintPageContent
      templateId={PRINT_TEMPLATE_IDS.PURCHASE_ORDER}
      documentTitle={t.print.documentTitle}
      codeLabel={t.print.codeLabel}
      loadingText={t.print.loading}
      missingCodeText={t.print.missingCode}
      loadFailedText={t.print.loadFailed}
      documentNotFoundText={t.print.notFound}
      printButtonText={t.print.print}
      closeButtonText={t.print.close}
    />
  );
}
