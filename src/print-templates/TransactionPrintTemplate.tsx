'use client';

import React from 'react';
import { HtmlPrintTemplate } from './HtmlPrintTemplate';
import { PRINT_TEMPLATE_IDS } from './printTemplateRegistry';
import type { PrintTemplateId } from './printTemplateRegistry';
import type { PrintPaymentTotal, PrintTransactionDetail, PrintTransactionHeader } from './types';

export interface TransactionPrintTemplateProps {
  documentTitle: string;
  codeLabel: string;
  templateId?: PrintTemplateId;
  showValidUntil?: boolean;
  hidePricing?: boolean;
  header: PrintTransactionHeader;
  details: PrintTransactionDetail[];
  paymentTotals?: PrintPaymentTotal[];
  autoPrint?: boolean;
}

/**
 * Renders a transaction print document from an HTML template in print-templates/html/.
 */
export function TransactionPrintTemplate({
  templateId,
  documentTitle,
  codeLabel,
  showValidUntil = false,
  hidePricing = false,
  header,
  details,
  paymentTotals = [],
  autoPrint = false,
}: TransactionPrintTemplateProps) {
  return (
    <HtmlPrintTemplate
      templateId={templateId}
      documentTitle={documentTitle}
      codeLabel={codeLabel}
      showValidUntil={showValidUntil}
      hidePricing={hidePricing}
      header={header}
      details={details}
      paymentTotals={paymentTotals}
      autoPrint={autoPrint}
    />
  );
}
