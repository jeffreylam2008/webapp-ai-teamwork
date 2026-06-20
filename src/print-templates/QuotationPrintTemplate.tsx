'use client';

import React from 'react';
import { HtmlPrintTemplate } from './HtmlPrintTemplate';
import { PRINT_TEMPLATE_IDS } from './printTemplateRegistry';
import type { QuotationPrintData } from './types';

/** Quotation print preset using quotation.html template. */
export function QuotationPrintTemplate({ header, details, paymentTotals = [] }: QuotationPrintData) {
  return (
    <HtmlPrintTemplate
      templateId={PRINT_TEMPLATE_IDS.QUOTATION}
      documentTitle="Quotation"
      codeLabel="Quotation No.:"
      showValidUntil
      header={header}
      details={details}
      paymentTotals={paymentTotals}
    />
  );
}
