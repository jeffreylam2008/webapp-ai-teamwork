export const en = {
  breadcrumb: {
    home: 'Home',
    manage: 'Manage',
    system: 'System',
  },
  page: {
    title: 'System Settings',
    description: 'Configure global system behavior',
    save: 'Save',
    resetDefault: 'Reset default',
  },
  cards: {
    title: 'System Settings',
  },
  messages: {
    loadFailed: 'Failed to load system settings',
    loadDefaultsSuccess: 'Form reset to default values from database',
    loadDefaultsFailed: 'Failed to load defaults',
    saved: 'Saved',
    saveFailed: 'Failed to save',
  },
  errors: {
    systemNameSaveFailed: 'System name save failed',
    idleSaveFailed: 'Idle save failed',
    quotationValiditySaveFailed: 'Quotation validity save failed',
    paginationSaveFailed: 'Pagination save failed',
    languageSaveFailed: 'Language save failed',
    timezoneSaveFailed: 'Timezone save failed',
  },
  sections: {
    systemName: {
      title: 'System name',
      hint: 'Shown on the login page (title and footer).',
      placeholder: 'e.g. ERP System',
    },
    logo: {
      title: 'Logo',
      hint: 'Login / general branding: icon name (e.g. AppstoreAddOutlined) or image URL.',
      placeholder: 'e.g. AppstoreAddOutlined or https://...',
    },
    shopLogo: {
      title: 'Shop logo',
      hint: 'Sidebar branding after sign-in. Icon name or image URL. Falls back to Logo if empty.',
      placeholder: 'e.g. ShopOutlined or /logo-300x300.png',
    },
    language: {
      title: 'System language',
      hint: 'Used by pages that support language texts.',
      rolloutHint: 'Current rollout: quotation and sales order pages text labels.',
      options: {
        en: 'English',
        zhHant: 'Traditional Chinese (繁體中文)',
      },
    },
    timezone: {
      title: 'Timezone',
      hint: 'Wall-clock time for transaction dates, lists, and database timestamps.',
      rolloutHint: 'Default: Asia/Hong_Kong. Affects create/modify times and datetime display across the app.',
    },
    idle: {
      title: 'Idle timeout (minutes)',
      hint: 'Logout after browser inactivity.',
      hint2: 'When the browser is inactive for this duration, the user will be logged out and returned to the login page.',
      required: 'Please enter idle timeout in minutes',
      invalidNumber: 'Invalid number',
      range: 'Idle must be between 1 and 1440 minutes',
    },
    quotationValidity: {
      title: 'Default quotation validity (days)',
      hint: 'Default “Valid Until” offset.',
      hint2: 'Used when creating new quotations: Valid Until = Quotation Date + this number of days.',
      required: 'Please enter default quotation validity in days',
      invalidNumber: 'Invalid number',
      range: 'Days must be between 1 and 3650',
    },
    pagination: {
      title: 'Table pagination',
      hint: 'Default & max selectable rows per page.',
      hint2: 'Applies to list pages with page size selector. Default is used for initial load; max is the largest selectable option.',
      required: 'Required',
      invalidNumber: 'Invalid number',
      defaultRange: 'Default must be 1-500',
      maxRange: 'Max must be 1-500',
      placeholderDefault: 'Default',
      placeholderMax: 'Max',
    },
  },
} as const;

