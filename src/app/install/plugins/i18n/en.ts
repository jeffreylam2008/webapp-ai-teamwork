export const en = {
  page: {
    title: 'Plugin Lab',
    description:
      'Select plugins for this browser session. Use this page to test feature packs before Project Setup stores them per deployment.',
  },
  actions: {
    resetDefaults: 'Reset defaults',
    openProjectSetup: 'Project Setup (planned)',
  },
  messages: {
    enabled: (name: string) => `${name} enabled`,
    disabled: (name: string) => `${name} disabled`,
    resetOk: 'Plugin selections reset to defaults',
  },
  table: {
    name: 'Plugin',
    category: 'Category',
    version: 'Version',
    enabled: 'Enabled',
    notes: 'Notes',
  },
  categories: {
    sales: 'Sales',
    warehouse: 'Warehouse',
    system: 'System',
    other: 'Other',
  },
  hint: {
    storage:
      'Selections are stored in this browser (localStorage) for testing only. Project Setup will replace this with a server-side project profile.',
    monthly:
      'Turning Monthly Invoices off hides Sales → Monthly Invoices and blocks those routes.',
  },
};

export type PluginsLabTexts = typeof en;
