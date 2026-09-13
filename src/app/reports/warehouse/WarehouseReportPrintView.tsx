'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Spin } from 'antd';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getWarehouseReportTexts } from './i18n';
import { formatDisplayDateTime, logTimestamp } from '@/lib/datetime';
import {
  parseWarehouseReportGroupBy,
  WAREHOUSE_MOVEMENT_LABELS,
  type WarehouseReportGroupBy,
} from './groupBy';

type GroupBy = WarehouseReportGroupBy;

type WarehouseReportSummary = {
  document_count: number;
  qty_in: number;
  qty_out: number;
  net_qty: number;
};

type DocumentLineDetail = {
  uid?: number;
  item_code: string;
  eng_name?: string;
  chi_name?: string;
  unit?: string;
  qty: number;
  qty_in: number;
  qty_out: number;
  net_qty: number;
};

type DocumentReportRow = {
  trans_code: string;
  transaction_date: string;
  prefix?: string;
  supplier_code?: string;
  supplier_name?: string;
  customer_code?: string;
  customer_name?: string;
  shop_code?: string;
  shop_name?: string;
  line_count?: number;
  qty_in: number;
  qty_out: number;
  net_qty: number;
  details?: DocumentLineDetail[];
};

type MovementReportRow = {
  prefix: string;
  document_count: number;
  line_count?: number;
  qty_in: number;
  qty_out: number;
  net_qty: number;
  documents?: DocumentReportRow[];
};

type ProductReportRow = {
  item_code: string;
  eng_name?: string;
  chi_name?: string;
  unit?: string;
  document_count?: number;
  qty_in: number;
  qty_out: number;
  net_qty: number;
};

type ReportResponse = {
  success: boolean;
  summary?: WarehouseReportSummary;
  data?: (DocumentReportRow | MovementReportRow | ProductReportRow)[];
  error?: string;
};

function formatQty(value: number): string {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

const printStyles = `
  .warehouse-report-print {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    background: #fff;
    font-size: 12px;
    line-height: 1.4;
  }
  .warehouse-report-print__body { padding: 24px; }
  .warehouse-report-print__title { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
  .warehouse-report-print__meta { color: #555; margin-bottom: 16px; }
  .warehouse-report-print__meta p { margin: 2px 0; }
  .warehouse-report-print__summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .warehouse-report-print__summary-item {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 10px 12px;
  }
  .warehouse-report-print__summary-label { color: #666; font-size: 11px; margin-bottom: 4px; }
  .warehouse-report-print__summary-value { font-size: 14px; font-weight: 700; }
  .warehouse-report-print table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .warehouse-report-print th, .warehouse-report-print td {
    border: 1px solid #ccc; padding: 6px 8px; vertical-align: top;
  }
  .warehouse-report-print th { background: #f5f5f5; font-weight: 600; text-align: left; }
  .warehouse-report-print .num { text-align: right; white-space: nowrap; }
  .warehouse-report-print__section { margin-bottom: 20px; page-break-inside: avoid; }
  .warehouse-report-print__section-title {
    font-size: 14px; font-weight: 700; margin: 0 0 8px; padding: 6px 8px;
    background: #f0f0f0; border: 1px solid #ddd;
  }
  .warehouse-report-print__doc-block { margin: 0 0 14px 16px; page-break-inside: avoid; }
  .warehouse-report-print__doc-title { font-weight: 600; margin-bottom: 6px; }
  @media print {
    .warehouse-report-print__body { padding: 0; }
  }
`;

function partyLabel(row: DocumentReportRow): string {
  if (row.supplier_code || row.supplier_name) {
    return row.supplier_name
      ? `${row.supplier_code || ''} - ${row.supplier_name}`
      : row.supplier_code || '-';
  }
  if (row.customer_code || row.customer_name) {
    return row.customer_name
      ? `${row.customer_code || ''} - ${row.customer_name}`
      : row.customer_code || '-';
  }
  return '-';
}

function shopLabel(row: { shop_code?: string; shop_name?: string }): string {
  const code = String(row.shop_code || '').trim();
  const name = String(row.shop_name || '').trim();
  if (code && name) return `${code} - ${name}`;
  return code || name || '-';
}

function LineItemsTable({
  details,
  t,
}: {
  details: DocumentLineDetail[];
  t: ReturnType<typeof getWarehouseReportTexts>;
}) {
  if (details.length === 0) {
    return <p>{t.table.noLineItems}</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          <th>{t.table.itemCode}</th>
          <th>{t.table.description}</th>
          <th>{t.table.unit}</th>
          <th className="num">{t.table.qty}</th>
          <th className="num">{t.table.qtyIn}</th>
          <th className="num">{t.table.qtyOut}</th>
          <th className="num">{t.table.netQty}</th>
        </tr>
      </thead>
      <tbody>
        {details.map((line, idx) => (
          <tr key={String(line.uid ?? `${line.item_code}-${idx}`)}>
            <td>{line.item_code}</td>
            <td>{line.eng_name || line.chi_name || '-'}</td>
            <td>{line.unit || '-'}</td>
            <td className="num">{formatQty(line.qty)}</td>
            <td className="num">{formatQty(line.qty_in)}</td>
            <td className="num">{formatQty(line.qty_out)}</td>
            <td className="num">{formatQty(line.net_qty)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WarehouseReportPrintView() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getWarehouseReportTexts(lang), [lang]);
  const { token } = useAuth();
  const hasTriggeredPrint = useRef(false);

  const startDate = (searchParams.get('start_date') || '').trim();
  const endDate = (searchParams.get('end_date') || '').trim();
  const shopCode = (searchParams.get('shop_code') || '').trim();
  const shopLabelParam = (searchParams.get('shop_label') || '').trim();
  const prefix = (searchParams.get('prefix') || '').trim();
  const prefixLabelParam = (searchParams.get('prefix_label') || '').trim();
  const groupBy: GroupBy = parseWarehouseReportGroupBy(searchParams.get('group_by'));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<WarehouseReportSummary | null>(null);
  const [rows, setRows] = useState<(DocumentReportRow | MovementReportRow | ProductReportRow)[]>(
    []
  );

  const movementLabel = (code: string) => {
    const key = String(code || '').trim().toUpperCase();
    const entry = WAREHOUSE_MOVEMENT_LABELS[key];
    if (!entry) return key || '-';
    return lang === 'zh-Hant' ? entry.zh : entry.en;
  };

  useEffect(() => {
    if (!token) return;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        let url = `/api/reports/warehouse?export=1&group_by=${groupBy}`;
        if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;
        if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;
        if (shopCode) url += `&shop_code=${encodeURIComponent(shopCode)}`;
        if (prefix) url += `&prefix=${encodeURIComponent(prefix)}`;
        url += `&t=${Date.now()}`;

        const res = await fetchWithAuth(url, token, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        const json = (await res.json()) as ReportResponse;
        if (!res.ok || !json.success) {
          throw new Error(json.error || t.print.failedLoad);
        }
        setSummary(json.summary || null);
        setRows(Array.isArray(json.data) ? json.data : []);
      } catch (e) {
        setSummary(null);
        setRows([]);
        setError(e instanceof Error ? e.message : t.print.failedLoad);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [token, groupBy, startDate, endDate, shopCode, prefix, t]);

  const groupByLabel =
    groupBy === 'product'
      ? t.filters.byProduct
      : groupBy === 'movement_detail'
        ? t.filters.byMovementDetail
        : groupBy === 'movement'
          ? t.filters.byMovement
          : groupBy === 'document_detail'
            ? t.filters.byDocumentDetail
            : t.filters.byDocument;

  const dateRangeLabel =
    startDate && endDate ? `${startDate} — ${endDate}` : startDate || endDate || '-';
  const shopDisplay = shopLabelParam || shopCode || t.filters.allShops;
  const prefixDisplay = prefixLabelParam || (prefix ? movementLabel(prefix) : t.filters.allMovements);

  useEffect(() => {
    if (loading || error || hasTriggeredPrint.current) return;
    hasTriggeredPrint.current = true;
    const timer = window.setTimeout(() => {
      window.print();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [error, loading]);

  useEffect(() => {
    const handleAfterPrint = () => {
      if (window.opener) {
        window.close();
      }
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const documentRows = rows as DocumentReportRow[];
  const movementRows = rows as MovementReportRow[];
  const productRows = rows as ProductReportRow[];

  return (
    <div className="warehouse-report-print">
      <style>{printStyles}</style>
      <div className="warehouse-report-print__body">
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3 text-gray-600">
            <Spin />
            <div>{t.print.loading}</div>
          </div>
        ) : error ? (
          <Alert type="error" showIcon message={t.print.failedLoad} description={error} />
        ) : (
          <>
            <h1 className="warehouse-report-print__title">{t.page.title}</h1>
            <div className="warehouse-report-print__meta">
              <p>
                <strong>{t.print.generatedAt}:</strong> {formatDisplayDateTime(logTimestamp())}
              </p>
              <p>
                <strong>{t.filters.dateRange}:</strong> {dateRangeLabel}
              </p>
              <p>
                <strong>{t.filters.shop}:</strong> {shopDisplay}
              </p>
              <p>
                <strong>{t.filters.movementType}:</strong> {prefixDisplay}
              </p>
              <p>
                <strong>{t.filters.groupBy}:</strong> {groupByLabel}
              </p>
            </div>

            {summary && (
              <div className="warehouse-report-print__summary">
                <div className="warehouse-report-print__summary-item">
                  <div className="warehouse-report-print__summary-label">
                    {t.summary.documentCount}
                  </div>
                  <div className="warehouse-report-print__summary-value">
                    {summary.document_count}
                  </div>
                </div>
                <div className="warehouse-report-print__summary-item">
                  <div className="warehouse-report-print__summary-label">{t.summary.qtyIn}</div>
                  <div className="warehouse-report-print__summary-value">
                    {formatQty(summary.qty_in)}
                  </div>
                </div>
                <div className="warehouse-report-print__summary-item">
                  <div className="warehouse-report-print__summary-label">{t.summary.qtyOut}</div>
                  <div className="warehouse-report-print__summary-value">
                    {formatQty(summary.qty_out)}
                  </div>
                </div>
                <div className="warehouse-report-print__summary-item">
                  <div className="warehouse-report-print__summary-label">{t.summary.netQty}</div>
                  <div className="warehouse-report-print__summary-value">
                    {formatQty(summary.net_qty)}
                  </div>
                </div>
              </div>
            )}

            {groupBy === 'product' && (
              <table>
                <thead>
                  <tr>
                    <th>{t.table.itemCode}</th>
                    <th>{t.table.description}</th>
                    <th>{t.table.unit}</th>
                    <th className="num">{t.table.documents}</th>
                    <th className="num">{t.table.qtyIn}</th>
                    <th className="num">{t.table.qtyOut}</th>
                    <th className="num">{t.table.netQty}</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.length === 0 ? (
                    <tr>
                      <td colSpan={7}>{t.table.noProducts}</td>
                    </tr>
                  ) : (
                    productRows.map((row) => (
                      <tr key={row.item_code}>
                        <td>{row.item_code}</td>
                        <td>{row.eng_name || row.chi_name || '-'}</td>
                        <td>{row.unit || '-'}</td>
                        <td className="num">{row.document_count ?? 0}</td>
                        <td className="num">{formatQty(row.qty_in)}</td>
                        <td className="num">{formatQty(row.qty_out)}</td>
                        <td className="num">{formatQty(row.net_qty)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {groupBy === 'document' && (
              <table>
                <thead>
                  <tr>
                    <th>{t.table.document}</th>
                    <th>{t.table.date}</th>
                    <th>{t.table.movementType}</th>
                    <th>{t.table.party}</th>
                    <th>{t.table.shop}</th>
                    <th className="num">{t.table.lines}</th>
                    <th className="num">{t.table.qtyIn}</th>
                    <th className="num">{t.table.qtyOut}</th>
                    <th className="num">{t.table.netQty}</th>
                  </tr>
                </thead>
                <tbody>
                  {documentRows.length === 0 ? (
                    <tr>
                      <td colSpan={9}>{t.table.noDocuments}</td>
                    </tr>
                  ) : (
                    documentRows.map((doc) => (
                      <tr key={doc.trans_code}>
                        <td>{doc.trans_code}</td>
                        <td>{formatDisplayDateTime(doc.transaction_date)}</td>
                        <td>{movementLabel(doc.prefix || '')}</td>
                        <td>{partyLabel(doc)}</td>
                        <td>{shopLabel(doc)}</td>
                        <td className="num">{doc.line_count ?? 0}</td>
                        <td className="num">{formatQty(doc.qty_in)}</td>
                        <td className="num">{formatQty(doc.qty_out)}</td>
                        <td className="num">{formatQty(doc.net_qty)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {groupBy === 'document_detail' &&
              (documentRows.length === 0 ? (
                <p>{t.table.noDocuments}</p>
              ) : (
                documentRows.map((doc) => {
                  const details = Array.isArray(doc.details) ? doc.details : [];
                  return (
                    <div key={doc.trans_code} className="warehouse-report-print__section">
                      <div className="warehouse-report-print__section-title">
                        {doc.trans_code} · {formatDisplayDateTime(doc.transaction_date)} ·{' '}
                        {movementLabel(doc.prefix || '')} · {partyLabel(doc)} · {shopLabel(doc)} ·{' '}
                        {t.table.netQty}: {formatQty(doc.net_qty)}
                      </div>
                      <LineItemsTable details={details} t={t} />
                    </div>
                  );
                })
              ))}

            {groupBy === 'movement' && (
              <table>
                <thead>
                  <tr>
                    <th>{t.table.movementType}</th>
                    <th className="num">{t.summary.documentCount}</th>
                    <th className="num">{t.table.lines}</th>
                    <th className="num">{t.table.qtyIn}</th>
                    <th className="num">{t.table.qtyOut}</th>
                    <th className="num">{t.table.netQty}</th>
                  </tr>
                </thead>
                <tbody>
                  {movementRows.length === 0 ? (
                    <tr>
                      <td colSpan={6}>{t.table.noMovements}</td>
                    </tr>
                  ) : (
                    movementRows.map((row) => (
                      <tr key={row.prefix}>
                        <td>{movementLabel(row.prefix)}</td>
                        <td className="num">{row.document_count ?? 0}</td>
                        <td className="num">{row.line_count ?? 0}</td>
                        <td className="num">{formatQty(row.qty_in)}</td>
                        <td className="num">{formatQty(row.qty_out)}</td>
                        <td className="num">{formatQty(row.net_qty)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {groupBy === 'movement_detail' &&
              (movementRows.length === 0 ? (
                <p>{t.table.noMovements}</p>
              ) : (
                movementRows.map((movement) => {
                  const documents = Array.isArray(movement.documents) ? movement.documents : [];
                  return (
                    <div key={movement.prefix} className="warehouse-report-print__section">
                      <div className="warehouse-report-print__section-title">
                        {movementLabel(movement.prefix)} · {t.summary.documentCount}:{' '}
                        {movement.document_count ?? documents.length} · {t.table.netQty}:{' '}
                        {formatQty(movement.net_qty)}
                      </div>
                      {documents.map((doc) => {
                        const details = Array.isArray(doc.details) ? doc.details : [];
                        return (
                          <div key={doc.trans_code} className="warehouse-report-print__doc-block">
                            <div className="warehouse-report-print__doc-title">
                              {doc.trans_code} · {formatDisplayDateTime(doc.transaction_date)} ·{' '}
                              {shopLabel(doc)} · {t.table.netQty}: {formatQty(doc.net_qty)}
                            </div>
                            <LineItemsTable details={details} t={t} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              ))}
          </>
        )}
      </div>
    </div>
  );
}
