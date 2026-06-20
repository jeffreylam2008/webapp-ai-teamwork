/**
 * Customer-specific add-on: quotation "Tips" modal for previous customer items.
 * Kept separate from core sales modules so custom builds can omit this folder.
 */
export { CustomerTipsActionButton } from './components/CustomerTipsActionButton';
export { CustomerTipsModal } from './components/CustomerTipsModal';
export { useCustomerTipsToggle } from './hooks/useCustomerTipsToggle';
export { getCustomerTipsTexts } from './i18n';
export type { CustomerPreviousItem, CustomerTipsProduct } from './types';
