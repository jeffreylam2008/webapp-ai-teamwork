'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Spin } from 'antd';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithAuth } from '@/lib/bearerAuthHeaders';
import { useSystemLanguage } from '@/hooks/useSystemLanguage';
import { getSalesReportTexts } from './i18n';
import { formatDisplayDateTime, logTimestamp } from '@/lib/datetime';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  parseSalesReportGroupBy,
  type SalesReportGroupBy,
} from './groupBy';

type GroupBy = SalesReportGroupBy;

type SalesReportSummary = {
  invoice_count: number;
  total_sales: number;
  total_cost: number;
  gross_profit: number;
};

type InvoiceLineDetail = {
  uid?: number;
  item_code: string;
  eng_name?: string;
  chi_name?: string;
  unit?: string;
  qty: number;
  price: number;
  discount: number;
  unit_cost: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
};

type InvoiceReportRow = {
  trans_code: string;
  transaction_date: string;
  customer_code?: string;
  customer_name?: string;
  shop_code?: string;
  shop_name?: string;
  line_count?: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
  details?: InvoiceLineDetail[];
};

type CustomerReportRow = {
  customer_code: string;
  customer_name?: string;
  invoice_count: number;
  line_count?: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
  invoices?: InvoiceReportRow[];
};

type ItemReportRow = {
  item_code: string;
  eng_name?: string;
  chi_name?: string;
  unit?: string;
  total_qty: number;
  unit_cost?: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
};

type ReportResponse = {
  success: boolean;
  summary?: SalesReportSummary;
  data?: (InvoiceReportRow | ItemReportRow | CustomerReportRow)[];
  group_by?: GroupBy;
  error?: string;
};

const printStyles = `
  .sales-report-print {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    background: #fff;
    font-size: 12px;
    line-height: 1.4;
  }
  .sales-report-print__body {
    padding: 24px;
  }
  .sales-report-print__title {
    font-size: 20px;
    font-weight: 700;
    margin: 0 0 4px;
  }
  .sales-report-print__meta {
    color: #555;
    margin-bottom: 16px;
  }
  .sales-report-print__meta p {
    margin: 2px 0;
  }
  .sales-report-print__summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .sales-report-print__summary-item {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 10px 12px;
  }
  .sales-report-print__summary-label {
    color: #666;
    font-size: 11px;
    margin-bottom: 4px;
  }
  .sales-report-print__summary-value {
    font-size: 14px;
    font-weight: 700;
  }
  .sales-report-print table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
  }
  .sales-report-print th,
  .sales-report-print td {
    border: 1px solid #ccc;
    padding: 6px 8px;
    vertical-align: top;
  }
  .sales-report-print th {
    background: #f5f5f5;
    font-weight: 600;
    text-align: left;
  }
  .sales-report-print .num {
    text-align: right;
    white-space: nowrap;
  }
  .sales-report-print__section {
    margin-bottom: 20px;
    page-break-inside: avoid;
  }
  .sales-report-print__section-title {
    font-size: 14px;
    font-weight: 700;
    margin: 0 0 8px;
    padding: 6px 8px;
    background: #f0f0f0;
    border: 1px solid #ddd;
  }
  .sales-report-print__invoice-block {
    margin: 0 0 14px 16px;
    page-break-inside: avoid;
  }
  .sales-report-print__invoice-title {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .sales-report-print__line-table {
    margin-left: 12px;
  }
  @media print {
    .sales-report-print__body {
      padding: 0;
    }
    .sales-report-print__toolbar {
      display: none !important;
    }
  }
`;

function customerLabel(row: { customer_code?: string; customer_name?: string }): string {
  const code = String(row.customer_code || '').trim();
  const name = String(row.customer_name || '').trim();
  if (code && name) return `${code} - ${name}`;
  return code || name || '-';
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
  details: InvoiceLineDetail[];
  t: ReturnType<typeof getSalesReportTexts>;
}) {
  if (details.length === 0) {
    return <p className="sales-report-print__line-table">{t.table.noLineItems}</p>;
  }
  return (
    <table className="sales-report-print__line-table">
      <thead>
        <tr>
          <th>{t.table.itemCode}</th>
          <th>{t.table.description}</th>
          <th>{t.table.unit}</th>
          <th className="num">{t.table.qty}</th>
          <th className="num">{t.table.price}</th>
          <th className="num">{t.table.discount}</th>
          <th className="num">{t.table.unitCost}</th>
          <th className="num">{t.table.sales}</th>
          <th className="num">{t.table.cost}</th>
          <th className="num">{t.table.profit}</th>
        </tr>
      </thead>
      <tbody>
        {details.map((line, idx) => (
          <tr key={String(line.uid ?? `${line.item_code}-${idx}`)}>
            <td>{line.item_code}</td>
            <td>{line.eng_name || line.chi_name || '-'}</td>
            <td>{line.unit || '-'}</td>
            <td className="num">{line.qty}</td>
            <td className="num">{formatCurrency(line.price)}</td>
            <td className="num">{Number(line.discount || 0).toFixed(0)}%</td>
            <td className="num">{formatCurrency(line.unit_cost || 0)}</td>
            <td className="num">{formatCurrency(line.sales_amount)}</td>
            <td className="num">{formatCurrency(line.cost_amount)}</td>
            <td className="num">{formatCurrency(line.gross_profit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SalesReportPrintView() {
  const searchParams = useSearchParams();
  const lang = useSystemLanguage(searchParams.get('lang'));
  const t = useMemo(() => getSalesReportTexts(lang), [lang]);
  const { token } = useAuth();
  const hasTriggeredPrint = useRef(false);

  const startDate = (searchParams.get('start_date') || '').trim();
  const endDate = (searchParams.get('end_date') || '').trim();
  const shopCode = (searchParams.get('shop_code') || '').trim();
  const shopLabelParam = (searchParams.get('shop_label') || '').trim();
  const groupByRaw = (searchParams.get('group_by') || 'invoice').trim().toLowerCase();
  const groupBy: GroupBy = parseSalesReportGroupBy(groupByRaw);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SalesReportSummary | null>(null);
  const [rows, setRows] = useState<(InvoiceReportRow | ItemReportRow | CustomerReportRow)[]>([]);

  useEffect(() => {
    if (!token) return;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        let url = `/api/reports/sales?export=1&group_by=${groupBy}`;
        if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;
        if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;
        if (shopCode) url += `&shop_code=${encodeURIComponent(shopCode)}`;
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
  }, [token, groupBy, startDate, endDate, shopCode, t]);

  const groupByLabel =
    groupBy === 'product'
      ? t.filters.byProduct
      : groupBy === 'customer_detail'
        ? t.filters.byCustomerDetail
        : groupBy === 'customer'
          ? t.filters.byCustomer
          : groupBy === 'invoice_detail'
            ? t.filters.byInvoiceDetail
            : t.filters.byInvoice;

  const dateRangeLabel =
    startDate && endDate ? `${startDate} — ${endDate}` : startDate || endDate || '-';

  const shopDisplay = shopLabelParam || shopCode || t.filters.allShops;

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

  const invoiceRows = rows as InvoiceReportRow[];
  const customerRows = rows as CustomerReportRow[];
  const itemRows = rows as ItemReportRow[];

  return (
    <div className="sales-report-print">
      <style>{printStyles}</style>
      <div className="sales-report-print__body">
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3 text-gray-600">
            <Spin />
            <div>{t.print.loading}</div>
          </div>
        ) : error ? (
          <Alert type="error" showIcon message={t.print.failedLoad} description={error} />
        ) : (
          <>
            <h1 className="sales-report-print__title">{t.page.title}</h1>
            <div className="sales-report-print__meta">
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
                <strong>{t.filters.groupBy}:</strong> {groupByLabel}
              </p>
            </div>

            {summary && (
              <div className="sales-report-print__summary">
                <div className="sales-report-print__summary-item">
                  <div className="sales-report-print__summary-label">{t.summary.totalSales}</div>
                  <div className="sales-report-print__summary-value">
                    {formatCurrency(summary.total_sales)}
                  </div>
                </div>
                <div className="sales-report-print__summary-item">
                  <div className="sales-report-print__summary-label">{t.summary.totalCost}</div>
                  <div className="sales-report-print__summary-value">
                    {formatCurrency(summary.total_cost)}
                  </div>
                </div>
                <div className="sales-report-print__summary-item">
                  <div className="sales-report-print__summary-label">{t.summary.grossProfit}</div>
                  <div className="sales-report-print__summary-value">
                    {formatCurrency(summary.gross_profit)}
                  </div>
                </div>
                <div className="sales-report-print__summary-item">
                  <div className="sales-report-print__summary-label">{t.summary.invoiceCount}</div>
                  <div className="sales-report-print__summary-value">{summary.invoice_count}</div>
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
                    <th className="num">{t.table.qty}</th>
                    <th className="num">{t.table.unitCost}</th>
                    <th className="num">{t.table.sales}</th>
                    <th className="num">{t.table.cost}</th>
                    <th className="num">{t.table.profit}</th>
                  </tr>
                </thead>
                <tbody>
                  {itemRows.length === 0 ? (
                    <tr>
                      <td colSpan={8}>{t.table.noLineItems}</td>
                    </tr>
                  ) : (
                    itemRows.map((row) => (
                      <tr key={row.item_code}>
                        <td>{row.item_code}</td>
                        <td>{row.eng_name || row.chi_name || '-'}</td>
                        <td>{row.unit || '-'}</td>
                        <td className="num">{row.total_qty}</td>
                        <td className="num">{formatCurrency(row.unit_cost || 0)}</td>
                        <td className="num">{formatCurrency(row.sales_amount)}</td>
                        <td className="num">{formatCurrency(row.cost_amount)}</td>
                        <td className="num">{formatCurrency(row.gross_profit)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {groupBy === 'invoice' && (
              <table>
                <thead>
                  <tr>
                    <th>{t.table.invoice}</th>
                    <th>{t.table.date}</th>
                    <th>{t.table.customer}</th>
                    <th>{t.table.shop}</th>
                    <th className="num">{t.table.lines}</th>
                    <th className="num">{t.table.sales}</th>
                    <th className="num">{t.table.cost}</th>
                    <th className="num">{t.table.profit}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.length === 0 ? (
                    <tr>
                      <td colSpan={8}>{t.table.noInvoices}</td>
                    </tr>
                  ) : (
                    invoiceRows.map((invoice) => (
                      <tr key={invoice.trans_code}>
                        <td>{invoice.trans_code}</td>
                        <td>{formatDisplayDateTime(invoice.transaction_date)}</td>
                        <td>{customerLabel(invoice)}</td>
                        <td>{shopLabel(invoice)}</td>
                        <td className="num">{invoice.line_count ?? 0}</td>
                        <td className="num">{formatCurrency(invoice.sales_amount)}</td>
                        <td className="num">{formatCurrency(invoice.cost_amount)}</td>
                        <td className="num">{formatCurrency(invoice.gross_profit)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {groupBy === 'invoice_detail' &&
              (invoiceRows.length === 0 ? (
                <p>{t.table.noInvoices}</p>
              ) : (
                invoiceRows.map((invoice) => {
                  const details = Array.isArray(invoice.details) ? invoice.details : [];
                  return (
                    <div key={invoice.trans_code} className="sales-report-print__section">
                      <div className="sales-report-print__section-title">
                        {invoice.trans_code} · {formatDisplayDateTime(invoice.transaction_date)} ·{' '}
                        {customerLabel(invoice)} · {shopLabel(invoice)} · {t.table.sales}:{' '}
                        {formatCurrency(invoice.sales_amount)} · {t.table.profit}:{' '}
                        {formatCurrency(invoice.gross_profit)}
                      </div>
                      <LineItemsTable details={details} t={t} />
                    </div>
                  );
                })
              ))}

            {groupBy === 'customer' && (
              <table>
                <thead>
                  <tr>
                    <th>{t.table.customer}</th>
                    <th className="num">{t.summary.invoiceCount}</th>
                    <th className="num">{t.table.lines}</th>
                    <th className="num">{t.table.sales}</th>
                    <th className="num">{t.table.cost}</th>
                    <th className="num">{t.table.profit}</th>
                  </tr>
                </thead>
                <tbody>
                  {customerRows.length === 0 ? (
                    <tr>
                      <td colSpan={6}>{t.table.noCustomers}</td>
                    </tr>
                  ) : (
                    customerRows.map((customer) => (
                      <tr key={customer.customer_code}>
                        <td>{customerLabel(customer)}</td>
                        <td className="num">{customer.invoice_count ?? 0}</td>
                        <td className="num">{customer.line_count ?? 0}</td>
                        <td className="num">{formatCurrency(customer.sales_amount)}</td>
                        <td className="num">{formatCurrency(customer.cost_amount)}</td>
                        <td className="num">{formatCurrency(customer.gross_profit)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {groupBy === 'customer_detail' &&
              (customerRows.length === 0 ? (
                <p>{t.table.noCustomers}</p>
              ) : (
                customerRows.map((customer) => {
                  const invoices = Array.isArray(customer.invoices) ? customer.invoices : [];
                  return (
                    <div key={customer.customer_code} className="sales-report-print__section">
                      <div className="sales-report-print__section-title">
                        {customerLabel(customer)} · {t.summary.invoiceCount}:{' '}
                        {customer.invoice_count ?? invoices.length} · {t.table.sales}:{' '}
                        {formatCurrency(customer.sales_amount)} · {t.table.profit}:{' '}
                        {formatCurrency(customer.gross_profit)}
                      </div>
                      {invoices.map((invoice) => {
                        const details = Array.isArray(invoice.details) ? invoice.details : [];
                        return (
                          <div key={invoice.trans_code} className="sales-report-print__invoice-block">
                            <div className="sales-report-print__invoice-title">
                              {invoice.trans_code} ·{' '}
                              {formatDisplayDateTime(invoice.transaction_date)} · {shopLabel(invoice)}{' '}
                              · {t.table.sales}: {formatCurrency(invoice.sales_amount)}
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
