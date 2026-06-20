/**
 * Shared types for print templates.
 * Align with API response shapes (e.g. /api/transactions/detail/[transCode]).
 */

export interface PrintTransactionHeader {
  uid?: number;
  trans_code: string;
  prefix?: string;
  cust_code?: string;
  supp_code?: string;
  refer_code?: string;
  quotation_code?: string;
  total?: number;
  employee_code?: string;
  shop_code?: string;
  remark?: string;
  is_void?: number;
  is_convert?: number;
  is_settle?: number;
  create_date?: string;
  modify_date?: string;
  valid_until_date?: string | null;
  invoice_subtype?: string | null;
  billing_period_from?: string | null;
  billing_period_to?: string | null;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_delivery_addr?: string;
  customer_statement_remark?: string;
  supplier_name?: string;
  shop_name?: string;
  shop_phone?: string;
  shop_address?: string;
  payment_method?: string;
}

export interface PrintTransactionDetail {
  uid?: number;
  trans_code?: string;
  item_code: string;
  eng_name?: string;
  chi_name?: string;
  qty: number;
  pstock?: number;
  unit?: string;
  price: number;
  discount?: number;
  create_date?: string;
  modify_date?: string;
}

export interface PrintPaymentTotal {
  uid?: number;
  trans_code?: string;
  pm_code?: string;
  payment_amount?: number;
  payment_method?: string;
  create_date?: string;
  modify_date?: string;
}

export interface QuotationPrintData {
  header: PrintTransactionHeader;
  details: PrintTransactionDetail[];
  paymentTotals?: PrintPaymentTotal[];
}
