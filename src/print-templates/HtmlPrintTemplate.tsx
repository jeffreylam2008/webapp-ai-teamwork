'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Spin } from 'antd';
import { buildPrintContext, type PrintTemplateOptions } from './buildPrintContext';
import { DEFAULT_PRINT_TEMPLATE_ID, loadPrintTemplate } from './loadPrintTemplate';
import { resolvePrintTemplateId, type PrintTemplateId } from './printTemplateRegistry';
import { renderHtmlTemplate } from './renderHtmlTemplate';
import type { PrintPaymentTotal, PrintTransactionDetail, PrintTransactionHeader } from './types';

export type HtmlPrintTemplateProps = PrintTemplateOptions & {
  templateId?: PrintTemplateId;
  header: PrintTransactionHeader;
  details: PrintTransactionDetail[];
  paymentTotals?: PrintPaymentTotal[];
  loadingText?: string;
  loadFailedText?: string;
  autoPrint?: boolean;
};

export function HtmlPrintTemplate({
  templateId = DEFAULT_PRINT_TEMPLATE_ID,
  header,
  details,
  paymentTotals = [],
  documentTitle,
  codeLabel,
  showValidUntil,
  hidePricing,
  loadingText = 'Loading template…',
  loadFailedText = 'Failed to load print template',
  autoPrint = false,
}: HtmlPrintTemplateProps) {
  const resolvedTemplateId = useMemo(
    () =>
      resolvePrintTemplateId({
        templateId,
        prefix: header.prefix,
        invoiceSubtype: header.invoice_subtype,
      }),
    [header.invoice_subtype, header.prefix, templateId]
  );

  const [templateHtml, setTemplateHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const html = await loadPrintTemplate(resolvedTemplateId);
        if (!cancelled) {
          setTemplateHtml(html);
        }
      } catch (e) {
        if (!cancelled) {
          setTemplateHtml(null);
          setError(e instanceof Error ? e.message : loadFailedText);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [loadFailedText, mounted, resolvedTemplateId]);

  const renderedHtml = useMemo(() => {
    if (!templateHtml) return '';
    const context = buildPrintContext(header, details, paymentTotals, {
      documentTitle,
      codeLabel,
      templateId: resolvedTemplateId,
      showValidUntil,
      hidePricing,
    });
    return renderHtmlTemplate(templateHtml, context);
  }, [
    codeLabel,
    details,
    documentTitle,
    header,
    hidePricing,
    paymentTotals,
    resolvedTemplateId,
    showValidUntil,
    templateHtml,
  ]);

  const printedRef = useRef(false);

  useEffect(() => {
    if (!mounted || !autoPrint || loading || error || !renderedHtml || printedRef.current) {
      return;
    }
    printedRef.current = true;
    const timer = window.setTimeout(() => {
      window.print();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [autoPrint, error, loading, mounted, renderedHtml]);

  if (loading) {
    return (
      <div className="print-window-loading">
        <Spin />
        <div>{loadingText}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="print-window-error">
        <Alert type="error" showIcon message={loadFailedText} description={error} />
      </div>
    );
  }

  return (
    <div
      className="transaction-print-html-output"
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
