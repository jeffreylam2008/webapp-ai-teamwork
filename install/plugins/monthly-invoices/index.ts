import type { AppPluginDefinition } from '../types';

/**
 * Monthly invoices plugin.
 * Core UI lives under features/invoices + /sales/monthly-invoices routes.
 * Disable this plugin to hide monthly menu/routes without deleting feature code.
 */
export const monthlyInvoicesPlugin: AppPluginDefinition = {
  id: 'monthly-invoices',
  name: {
    en: 'Monthly Invoices',
    'zh-Hant': '月結發票',
  },
  description: {
    en: 'Recurring / period billing invoices (billing period, auto-generate next period, monthly item type).',
    'zh-Hant': '月結／期間帳單發票（帳單期間、自動產生下期、月費品類型）。',
  },
  version: '1.0.0',
  category: 'sales',
  defaultEnabled: true,
  menuHrefs: ['/sales/monthly-invoices'],
  routePrefixes: ['/sales/monthly-invoices'],
  notes: {
    en: 'Can be omitted for projects that only need standard invoices.',
    'zh-Hant': '僅需標準發票的專案可關閉此外掛。',
  },
};

export const MONTHLY_INVOICES_PLUGIN_ID = monthlyInvoicesPlugin.id;
