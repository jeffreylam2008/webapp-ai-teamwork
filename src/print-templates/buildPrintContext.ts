import { formatCurrency } from '@/utils/formatCurrency';
import {
  PRINT_TEMPLATE_IDS,
  type PrintTemplateId,
  resolvePrintTemplateId,
} from './printTemplateRegistry';
import type { PrintPaymentTotal, PrintTransactionDetail, PrintTransactionHeader } from './types';

export type PrintTemplateOptions = {
  documentTitle: string;
  codeLabel: string;
  templateId?: PrintTemplateId;
  showValidUntil?: boolean;
  hidePricing?: boolean;
};

export type PrintDetailRow = {
  index: number;
  item_code: string;
  item_desc: string;
  qty: string;
  unit: string;
  price: string;
  discount: string;
  line_amount: string;
};

export type PrintInvoiceItemRow = {
  item_code: string;
  chi_name: string;
  eng_name: string;
  unit: string;
  qty: string;
  price: string;
  subtotal: string;
};

export type PrintInvoicePage = {
  pageNumber: number;
  items: PrintInvoiceItemRow[];
  isLastPage: boolean;
};

export type PrintPaymentRow = {
  label: string;
  amount: string;
};

export type PrintDeliveryDetailRow = {
  line1: string;
  line2: string;
  line3: string;
  line4: string;
  line5: string;
  lineRemark: string;
  unit: string;
  qty: string;
};

export type TransactionPrintTemplateContext = {
  documentTitle: string;
  codeLabel: string;
  transCode: string;
  createDate: string;
  validUntil: string;
  showValidUntil: boolean;
  hidePricing: boolean;
  billingPeriodFrom: string;
  billingPeriodTo: string;
  showBillingPeriod: boolean;
  referCode: string;
  showReferCode: boolean;
  partyName: string;
  partyPhone: string;
  partyEmail: string;
  partyCode: string;
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  details: PrintDetailRow[];
  deliveryDetails: PrintDeliveryDetailRow[];
  items: PrintInvoiceItemRow[];
  pages: PrintInvoicePage[];
  paymentTotals: PrintPaymentRow[];
  showPayment: boolean;
  total: string;
  totalAmount: string;
  remark: string;
  hasRemark: boolean;
  customerName: string;
  deliveryAddr: string;
  invoiceDate: string;
  quotation: string;
  custCode: string;
  employeeCode: string;
  paymentMethod: string;
  invoiceNum: string;
  statementRemark: string;
  hasStatementRemark: boolean;
  salesPerson: string;
  paymentMethodDisplay: string;
  deliveryFromTime: string;
  deliveryToTime: string;
  deliveryRemark: string;
  showDeliveryTime: boolean;
  deliveryTimeLabel: string;
  deliveryTimeToLabel: string;
};

const INVOICE_ITEMS_PER_PAGE = 6;

function formatPrintDate(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-GB', { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

/** Match legacy PHP substr($date, 0, -8) — date portion without time suffix. */
function formatInvoiceHeaderDate(value?: string | null): string {
  if (!value) return '';
  const raw = String(value).trim();
  if (raw.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toISOString().slice(0, 10);
  } catch {
    return raw;
  }
}

function lineTotal(row: { qty?: number; price?: number; discount?: number }): number {
  const qty = Number(row.qty);
  const price = Number(row.price);
  const subtotal = (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0);
  const disc = (Number(row.discount) || 0) / 100;
  return subtotal - subtotal * disc;
}

function buildInvoiceItems(details: PrintTransactionDetail[]): PrintInvoiceItemRow[] {
  return (details ?? []).map((row) => ({
    item_code: row.item_code ?? '',
    chi_name: row.chi_name ?? '',
    eng_name: row.eng_name ?? '',
    unit: row.unit ?? '',
    qty: String(row.qty ?? ''),
    price: formatCurrency(row.price),
    subtotal: formatCurrency(lineTotal(row)),
  }));
}

function chunkInvoicePages(items: PrintInvoiceItemRow[]): PrintInvoicePage[] {
  if (items.length === 0) {
    return [{ pageNumber: 1, items: [], isLastPage: true }];
  }

  const pages: PrintInvoicePage[] = [];
  for (let i = 0; i < items.length; i += INVOICE_ITEMS_PER_PAGE) {
    pages.push({
      pageNumber: pages.length + 1,
      items: items.slice(i, i + INVOICE_ITEMS_PER_PAGE),
      isLastPage: false,
    });
  }
  pages[pages.length - 1].isLastPage = true;
  return pages;
}

function buildDeliveryDetailRows(details: PrintTransactionDetail[]): PrintDeliveryDetailRow[] {
  return (details ?? []).map((row) => {
    const chi = String(row.chi_name ?? '').trim();
    const eng = String(row.eng_name ?? '').trim();
    const code = String(row.item_code ?? '').trim();
    const nameLines: string[] = [];
    if (chi) nameLines.push(chi);
    if (eng && eng !== chi) nameLines.push(eng);
    if (nameLines.length === 0 && code) nameLines.push(code);

    return {
      line1: nameLines[0] ?? '',
      line2: nameLines[1] ?? '',
      line3: nameLines[2] ?? '',
      line4: nameLines[3] ?? '',
      line5: nameLines[4] ?? '',
      lineRemark: '',
      unit: String(row.unit ?? '').trim(),
      qty: String(row.qty ?? ''),
    };
  });
}

export function buildPrintContext(
  header: PrintTransactionHeader,
  details: PrintTransactionDetail[],
  paymentTotals: PrintPaymentTotal[],
  options: PrintTemplateOptions
): TransactionPrintTemplateContext {
  const templateId = resolvePrintTemplateId({
    templateId: options.templateId,
    prefix: header.prefix,
    invoiceSubtype: header.invoice_subtype,
  });

  const hidePricing =
    options.hidePricing ?? templateId === PRINT_TEMPLATE_IDS.DELIVERY_NOTE;
  const showValidUntil =
    options.showValidUntil ?? templateId === PRINT_TEMPLATE_IDS.QUOTATION;

  const validUntil = formatPrintDate(header.valid_until_date);
  const remark = (header.remark ?? '').trim();
  const referCode = (header.refer_code ?? '').trim();
  const billingFrom = formatPrintDate(header.billing_period_from);
  const billingTo = formatPrintDate(header.billing_period_to);

  const isPurchaseOrder = templateId === PRINT_TEMPLATE_IDS.PURCHASE_ORDER;
  const partyName = isPurchaseOrder
    ? header.supplier_name ?? header.supp_code ?? '—'
    : header.customer_name ?? header.cust_code ?? '—';
  const partyPhone = isPurchaseOrder ? '' : header.customer_phone ?? '';
  const partyEmail = isPurchaseOrder ? '' : header.customer_email ?? '';
  const partyCode = isPurchaseOrder ? header.supp_code ?? '' : '';

  const detailRows: PrintDetailRow[] = (details ?? []).map((row, index) => {
    const desc = [row.eng_name, row.chi_name].filter(Boolean).join(' / ');
    return {
      index: index + 1,
      item_code: row.item_code ?? '—',
      item_desc: desc ? ` ${desc}` : '',
      qty: String(row.qty ?? '—'),
      unit: row.unit ?? '—',
      price: formatCurrency(row.price),
      discount: `${row.discount ?? 0}%`,
      line_amount: formatCurrency(lineTotal(row)),
    };
  });

  const invoiceItems = buildInvoiceItems(details);
  const invoicePages = chunkInvoicePages(invoiceItems);

  const paymentRows: PrintPaymentRow[] = (paymentTotals ?? []).map((pt) => ({
    label: pt.payment_method ?? pt.pm_code ?? '—',
    amount: formatCurrency(pt.payment_amount ?? 0),
  }));

  const paymentMethod =
    paymentRows[0]?.label ??
    header.payment_method ??
    paymentTotals[0]?.payment_method ??
    paymentTotals[0]?.pm_code ??
    '';

  const headerTotal = Number(header.total);
  const sumFromDetails = (details ?? []).reduce((sum, row) => sum + lineTotal(row), 0);
  const total = Number.isFinite(headerTotal) && headerTotal !== 0 ? headerTotal : sumFromDetails;
  const totalFormatted = formatCurrency(total);

  const statementRemark = (header.customer_statement_remark ?? '').trim();
  const deliveryRemark = (header.customer_delivery_remark ?? '').trim();
  const deliveryFromTime = String(header.customer_from_time ?? '').trim();
  const deliveryToTime = String(header.customer_to_time ?? '').trim();
  const salesPerson =
    (header.customer_attn_1 ?? '').trim() ||
    (header.employee_code ?? '').trim();
  const paymentMethodDisplay =
    (header.payment_method ?? '').trim() ||
    (paymentTotals[0]?.pm_code ?? '').trim() ||
    '1';

  const deliveryDetails = buildDeliveryDetailRows(details);

  return {
    documentTitle: options.documentTitle,
    codeLabel: options.codeLabel,
    transCode: header.trans_code ?? '—',
    createDate: formatPrintDate(header.create_date),
    validUntil,
    showValidUntil: showValidUntil && validUntil !== '—',
    hidePricing,
    billingPeriodFrom: billingFrom,
    billingPeriodTo: billingTo,
    showBillingPeriod:
      templateId === PRINT_TEMPLATE_IDS.MONTHLY_INVOICE &&
      billingFrom !== '—' &&
      billingTo !== '—',
    referCode,
    showReferCode: referCode.length > 0,
    partyName,
    partyPhone,
    partyEmail,
    partyCode,
    shopName: header.shop_name ?? header.shop_code ?? '—',
    shopPhone: header.shop_phone ?? '',
    shopAddress: (header.shop_address ?? '').trim() || '—',
    details: detailRows,
    deliveryDetails,
    items: invoiceItems,
    pages: invoicePages,
    paymentTotals: paymentRows,
    showPayment: !hidePricing && paymentRows.length > 0,
    total: totalFormatted,
    totalAmount: totalFormatted,
    remark,
    hasRemark: remark.length > 0,
    customerName: header.customer_name ?? header.cust_code ?? '',
    deliveryAddr: header.customer_delivery_addr ?? '',
    invoiceDate: formatInvoiceHeaderDate(header.create_date),
    quotation: header.quotation_code ?? header.refer_code ?? '',
    custCode: header.cust_code ?? '',
    employeeCode: header.employee_code ?? '',
    paymentMethod,
    invoiceNum: header.trans_code ?? '',
    statementRemark,
    hasStatementRemark: statementRemark.length > 0,
    salesPerson,
    paymentMethodDisplay,
    deliveryFromTime,
    deliveryToTime,
    deliveryRemark,
    showDeliveryTime: deliveryFromTime.length > 0 || deliveryToTime.length > 0,
    deliveryTimeLabel: '送貨時間:',
    deliveryTimeToLabel: '至',
  };
}
