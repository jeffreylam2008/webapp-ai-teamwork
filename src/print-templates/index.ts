/**
 * Print templates for documents (quotations, invoices, etc.).
 */

export { QuotationPrintTemplate } from './QuotationPrintTemplate';
export { TransactionPrintTemplate } from './TransactionPrintTemplate';
export { HtmlPrintTemplate } from './HtmlPrintTemplate';
export { TransactionPrintPageContent } from './TransactionPrintPageContent';
export { buildPrintContext } from './buildPrintContext';
export { renderHtmlTemplate } from './renderHtmlTemplate';
export {
  openBarePrintWindow,
  closePrintPreviewWindow,
  buildBarePrintUrl,
  isBarePrintMode,
  PRINT_BARE_QUERY,
  PRINT_POPUP_FEATURES,
} from './openBarePrintWindow';
export {
  PRINT_TEMPLATE_IDS,
  resolvePrintTemplateId,
  type PrintTemplateId,
} from './printTemplateRegistry';
export type { TransactionPrintPageContentProps } from './TransactionPrintPageContent';
export type { TransactionPrintTemplateProps } from './TransactionPrintTemplate';
export type { HtmlPrintTemplateProps } from './HtmlPrintTemplate';
export type {
  PrintTransactionHeader,
  PrintTransactionDetail,
  PrintPaymentTotal,
  QuotationPrintData,
} from './types';
