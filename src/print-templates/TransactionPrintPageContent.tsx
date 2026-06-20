/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { CloseOutlined, PrinterOutlined } from '@ant-design/icons';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import type { PrintPaymentTotal, PrintTransactionDetail, PrintTransactionHeader } from './types';
import type { PrintTemplateId } from './printTemplateRegistry';
import { isBarePrintMode, closePrintPreviewWindow, openBarePrintWindow } from './openBarePrintWindow';
import { TransactionPrintTemplate } from './TransactionPrintTemplate';

export type TransactionPrintPageContentProps = {
  documentTitle: string;
  codeLabel: string;
  /** HTML template id under print-templates/html/{id}.html */
  templateId?: PrintTemplateId;
  loadingText?: string;
  printButtonText?: string;
  closeButtonText?: string;
  missingCodeText?: string;
  loadFailedText?: string;
  documentNotFoundText?: string;
  showValidUntil?: boolean;
  hidePricing?: boolean;
};

type ApiResponse = {
  success: boolean;
  header?: PrintTransactionHeader;
  details?: PrintTransactionDetail[];
  paymentTotals?: PrintPaymentTotal[];
  error?: string;
};

function PrintPageShell({
  isBarePrint,
  printButtonText,
  closeButtonText,
  loadingText,
  printDisabled,
  onPrint,
  onClose,
}: {
  isBarePrint: boolean;
  printButtonText: string;
  closeButtonText: string;
  loadingText: string;
  printDisabled: boolean;
  onPrint?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="min-h-screen bg-white">
      {!isBarePrint && (
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex gap-2">
          <Button
            icon={<PrinterOutlined />}
            type="primary"
            onClick={onPrint}
            disabled={printDisabled}
          >
            {printButtonText}
          </Button>
          <Button icon={<CloseOutlined />} onClick={onClose}>
            {closeButtonText}
          </Button>
        </div>
      )}
      <div className={isBarePrint ? undefined : 'px-6 py-4'}>
        <div className="print-window-loading">
          <Spin />
          <div>{loadingText}</div>
        </div>
      </div>
    </div>
  );
}

export function TransactionPrintPageContent(props: TransactionPrintPageContentProps) {
  const {
    documentTitle,
    codeLabel,
    templateId,
    loadingText = 'Loading…',
    printButtonText = 'Print',
    closeButtonText = 'Close',
    missingCodeText = 'Missing transaction code',
    loadFailedText = 'Failed to load document',
    documentNotFoundText = 'Document not found',
    showValidUntil,
    hidePricing,
  } = props;

  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const transCode = String((params?.transCode as string | undefined) || '').trim();
  const isBarePrint = isBarePrintMode(searchParams);

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [header, setHeader] = useState<PrintTransactionHeader | null>(null);
  const [details, setDetails] = useState<PrintTransactionDetail[]>([]);
  const [paymentTotals, setPaymentTotals] = useState<PrintPaymentTotal[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const className = isBarePrint ? 'transaction-print-window' : 'transaction-print-preview';
    document.body.classList.add(className);
    return () => {
      document.body.classList.remove(className);
    };
  }, [isBarePrint, mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (!transCode) {
      setError(missingCodeText);
      setLoading(false);
      return;
    }

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithAuth(`/api/transactions/detail/${encodeURIComponent(transCode)}`, token, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        const json = (await res.json()) as ApiResponse;
        if (!res.ok || !json.success) {
          throw new Error(json.error || loadFailedText);
        }
        setHeader(json.header ?? null);
        setDetails(Array.isArray(json.details) ? json.details : []);
        setPaymentTotals(Array.isArray(json.paymentTotals) ? json.paymentTotals : []);
      } catch (e) {
        setHeader(null);
        setDetails([]);
        setPaymentTotals([]);
        setError(e instanceof Error ? e.message : loadFailedText);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [loadFailedText, missingCodeText, mounted, token, transCode]);

  const hasDoc = useMemo(() => !!header?.trans_code, [header?.trans_code]);

  const handlePrint = () => {
    openBarePrintWindow(window.location.href);
  };

  const handleClose = () => {
    closePrintPreviewWindow(() => router.back());
  };

  if (!mounted) {
    return (
      <PrintPageShell
        isBarePrint={isBarePrint}
        printButtonText={printButtonText}
        closeButtonText={closeButtonText}
        loadingText={loadingText}
        printDisabled
        onClose={handleClose}
      />
    );
  }

  const previewToolbar = !isBarePrint ? (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex gap-2">
      <Button
        icon={<PrinterOutlined />}
        type="primary"
        onClick={handlePrint}
        disabled={loading || !hasDoc}
      >
        {printButtonText}
      </Button>
      <Button icon={<CloseOutlined />} onClick={handleClose}>
        {closeButtonText}
      </Button>
    </div>
  ) : null;

  const content = loading ? (
    <div className="print-window-loading">
      <Spin />
      <div>{loadingText}</div>
    </div>
  ) : error ? (
    <div className="print-window-error">
      <Alert type="error" showIcon message={loadFailedText} description={error} />
    </div>
  ) : !hasDoc ? (
    <div className="print-window-error">
      <Alert type="warning" showIcon message={documentNotFoundText} />
    </div>
  ) : (
    <div className={isBarePrint ? 'transaction-print-document' : 'transaction-print-preview-body'}>
      <TransactionPrintTemplate
        templateId={templateId}
        documentTitle={documentTitle}
        codeLabel={codeLabel}
        header={header as PrintTransactionHeader}
        details={details}
        paymentTotals={paymentTotals}
        showValidUntil={showValidUntil}
        hidePricing={hidePricing}
        autoPrint={isBarePrint}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      {previewToolbar}
      <div className={isBarePrint ? undefined : 'px-6 py-4'}>{content}</div>
    </div>
  );
}
