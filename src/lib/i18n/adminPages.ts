import type { AppLanguage } from './language';

export type AdminPagesTexts = {
  usersList: {
    supervisorRequired: string;
    failedLoad: string;
    breadcrumbUsers: string;
    title: string;
    titleWithCount: (n: number) => string;
    description: string;
    refresh: string;
    /** Icon-only row action (product items list style) */
    actionViewUser: string;
    accessButton: string;
    colAccess: string;
    colUsername: string;
    colEmployeeCode: string;
    colDefaultShop: string;
    colRole: string;
    colStatus: string;
    roleSupervisor: string;
    roleUser: string;
    statusActive: string;
    statusInactive: string;
    loading: string;
    empty: string;
  };
  masterData: {
    title: string;
    description: string;
    backToSettings: string;
    importAllSelected: string;
    expectedFormatTitle: string;
    expectedFormatBody: string;
    export: string;
    selectFile: string;
    import: string;
    selectedFile: (fileName: string) => string;
    processingFor: (typeTitle: string) => string;
    labelSuccess: string;
    labelError: string;
    notAuthenticated: string;
    exportFailed: string;
    importFailed: string;
    selectFileFirst: string;
    importAllNeedFile: string;
    noFileSelected: (sample: string) => string;
    exported: (typeLabel: string) => string;
    importedSummary: (typeLabel: string, ins: number, up: number, sk: number) => string;
    typeCustomers: string;
    typeCustomersDesc: string;
    typeSuppliers: string;
    typeSuppliersDesc: string;
    typeDistricts: string;
    typeDistrictsDesc: string;
    typePrefixes: string;
    typePrefixesDesc: string;
    typePaymentMethods: string;
    typePaymentMethodsDesc: string;
    typePaymentTerms: string;
    typePaymentTermsDesc: string;
  };
  userDetail: {
    titleLoading: string;
    titleNotFound: string;
    backToUsers: string;
    save: string;
    grantFull: string;
    resetDefault: string;
    cardTransactionAccess: string;
    cardTransactionHint: string;
    colFunction: string;
    colCreate: string;
    colView: string;
    colEdit: string;
    colDelete: string;
    linkAll: string;
    linkNone: string;
    cardPassword: string;
    cardPasswordHint: string;
    labelNewPassword: string;
    labelConfirmPassword: string;
    phNewPassword: string;
    phConfirmPassword: string;
    titleAccess: (user: string) => string;
    descriptionAccess: (employeeCode: string, defaultShop: string, editingSuffix: string) => string;
    editingForShop: (shop: string) => string;
    failedLoadUsers: string;
    failedLoadUser: string;
    passwordMismatch: string;
    failedUpdateAccess: string;
    accessAndPasswordUpdated: string;
    accessUpdated: string;
    failedUpdatePassword: string;
    failedUpdate: string;
    failedReset: string;
    resetOk: string;
    validatorPasswordMatch: string;
  };
  shopsList: {
    title: string;
    description: string;
    add: string;
    filters: string;
    refresh: string;
    clearAll: string;
    filterOptions: string;
    searchLabel: string;
    searchPh: string;
    search: string;
    loadingData: string;
    noData: string;
    tryAdjustSearch: string;
    errorLabel: string;
    labelSuccess: string;
    labelError: string;
    deleteTitle: string;
    deleteConfirm: (code: string) => string;
    okYes: string;
    cancel: string;
    createTitle: string;
    creating: string;
    createShop: string;
    colShopCode: string;
    colShopName: string;
    colPhone: string;
    colAddress1: string;
    colAddress2: string;
    colDefaultWhcode: string;
    colWarehouseName: string;
    colCreated: string;
    colModified: string;
    titleEdit: string;
    titleDelete: string;
    labelShopCode: string;
    labelShopName: string;
    labelPhone: string;
    labelAddress1: string;
    labelAddress2: string;
    phShopCode: string;
    phShopName: string;
    phPhone: string;
    phAddress1: string;
    phAddress2: string;
    ruleShopCode: string;
    ruleShopName: string;
    rulePhone: string;
    ruleAddress1: string;
    labelIsWarehouse: string;
    labelDefaultWhcode: string;
    phDefaultWhcode: string;
  };
  shopDetail: {
    loadingTitle: string;
    loadingDescription: string;
    loadingShop: string;
    notFoundTitle: string;
    notFoundDescription: string;
    notFoundBody: string;
    back: string;
    editShop: string;
    saveChanges: string;
    cancel: string;
    titleShop: (name: string) => string;
    descriptionShop: (code: string) => string;
    additionalInfo: string;
    labelCreated: string;
    labelModified: string;
    na: string;
    fetchFailed: string;
    updateOk: string;
    updateFailed: string;
    updateError: string;
    labelShopCode: string;
    labelShopName: string;
    labelPhone: string;
    labelAddress1: string;
    labelAddress2: string;
    phShopCode: string;
    phShopName: string;
    phPhone: string;
    phAddress1: string;
    phAddress2: string;
    ruleShopCode: string;
    ruleShopName: string;
    rulePhone: string;
    ruleAddress1: string;
    labelIsWarehouse: string;
    labelDefaultWhcode: string;
    phDefaultWhcode: string;
  };
  paymentMethodList: {
    title: string;
    description: string;
    add: string;
    filters: string;
    refresh: string;
    clearAll: string;
    filterOptions: string;
    searchLabel: string;
    searchPh: string;
    search: string;
    loadingData: string;
    noData: string;
    tryAdjustSearch: string;
    errorLabel: string;
    labelSuccess: string;
    labelError: string;
    deleteTitle: string;
    deleteConfirm: (code: string) => string;
    okYes: string;
    cancel: string;
    createTitle: string;
    creating: string;
    createPm: string;
    colPmCode: string;
    colPmDesc: string;
    colCreated: string;
    colModified: string;
    labelPmCode: string;
    labelPmDesc: string;
    phPmCode: string;
    phPmDesc: string;
    rulePmCode: string;
    rulePmDesc: string;
    titleEdit: string;
    titleDelete: string;
  };
  paymentMethodDetail: {
    back: string;
    saveChanges: string;
    titleEdit: (code: string) => string;
    description: string;
    labelSuccess: string;
    labelError: string;
    loading: string;
    cardInfo: string;
    cardExtra: string;
    labelPmCode: string;
    labelDescription: string;
    phDescription: string;
    ruleDescription: string;
    labelCreateDate: string;
    labelModified: string;
    notFound: string;
    fetchFailed: string;
    updateFailed: string;
    updateError: string;
    redirectUpdated: string;
  };
  paymentTermList: {
    title: string;
    description: string;
    add: string;
    filters: string;
    refresh: string;
    clearAll: string;
    filterOptions: string;
    searchLabel: string;
    searchPh: string;
    search: string;
    loadingData: string;
    noData: string;
    tryAdjustSearch: string;
    errorLabel: string;
    labelSuccess: string;
    labelError: string;
    deleteTitle: string;
    deleteConfirm: (code: string) => string;
    okYes: string;
    cancel: string;
    createTitle: string;
    creating: string;
    createPt: string;
    colPtCode: string;
    colPtDesc: string;
    colCreated: string;
    colModified: string;
    labelPtCode: string;
    labelPtDesc: string;
    phPtCode: string;
    phPtDesc: string;
    rulePtCode: string;
    rulePtDesc: string;
    titleEdit: string;
    titleDelete: string;
  };
  paymentTermDetail: {
    back: string;
    saveChanges: string;
    titleEdit: (code: string) => string;
    description: string;
    labelSuccess: string;
    labelError: string;
    loading: string;
    cardInfo: string;
    cardExtra: string;
    labelPtCode: string;
    labelDescription: string;
    phDescription: string;
    ruleDescription: string;
    labelCreateDate: string;
    notFound: string;
    fetchFailed: string;
    updateFailed: string;
    updateError: string;
    redirectUpdated: string;
  };
  styleProfiles: {
    title: string;
    description: string;
    sectionTitle: string;
    sectionBody: string;
    currentProfile: string;
    descriptionLabel: string;
  };
  profile: {
    breadcrumbProfile: string;
    title: string;
    titleLoading: string;
    description: string;
    failedLoad: string;
    passwordMismatch: string;
    validatorPasswordMatch: string;
    saved: string;
    saveFailed: string;
    saveError: string;
    cardProfile: string;
    labelEmployeeId: string;
    labelUsername: string;
    labelDefaultShop: string;
    labelPlaceholderShop: string;
    cardChangePassword: string;
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
    placeholderLeaveBlank: string;
    placeholderConfirm: string;
    saveProfile: string;
    loading: string;
  };
};

const EN: AdminPagesTexts = {
  usersList: {
    supervisorRequired: 'Supervisor access required',
    failedLoad: 'Failed to load users',
    breadcrumbUsers: 'Users',
    title: 'User access control',
    titleWithCount: (n: number) => `User access control (${n})`,
    description: 'Manage users and their access to transaction edit and void functions',
    refresh: 'Refresh',
    actionViewUser: 'View user',
    accessButton: '',
    colAccess: 'Access',
    colUsername: 'Username',
    colEmployeeCode: 'Employee Code',
    colDefaultShop: 'Default Shop',
    colRole: 'Role',
    colStatus: 'Status',
    roleSupervisor: 'Supervisor',
    roleUser: 'User',
    statusActive: 'Active',
    statusInactive: 'Inactive',
    loading: 'Loading users...',
    empty: 'No users found.',
  },
  masterData: {
    title: 'Master Data Import/Export',
    description:
      'Upload/export master data files. Imports add new rows and update existing records when keys match; full-table replace is not supported.',
    backToSettings: 'Back to Settings',
    importAllSelected: 'Import All Selected',
    expectedFormatTitle: 'Expected file format',
    expectedFormatBody:
      'Upload a JSON or CSV file with a header row matching the field names used in the database columns. Exported files from this page are the most reliable format.',
    export: 'Export',
    selectFile: 'Select File',
    import: 'Import',
    selectedFile: (fileName: string) => `Selected: ${fileName}`,
    processingFor: (typeTitle: string) => `Processing ${typeTitle}…`,
    labelSuccess: '✅ Success:',
    labelError: '❌ Error:',
    notAuthenticated: 'Not authenticated',
    exportFailed: 'Export failed',
    importFailed: 'Import failed',
    selectFileFirst: 'Please select a file first',
    importAllNeedFile: 'Select at least one file to import',
    noFileSelected: (sample: string) => `No file selected (try ${sample}).`,
    exported: (typeLabel: string) => `${typeLabel} exported`,
    importedSummary: (typeLabel: string, ins: number, up: number, sk: number) =>
      `${typeLabel} imported: inserted ${ins}, updated ${up}, skipped ${sk}`,
    typeCustomers: 'Customers',
    typeCustomersDesc: 'Upload/export customer master data.',
    typeSuppliers: 'Suppliers',
    typeSuppliersDesc: 'Upload/export supplier master data.',
    typeDistricts: 'Districts',
    typeDistrictsDesc: 'Upload/export district master data.',
    typePrefixes: 'Prefixes',
    typePrefixesDesc: 'Upload/export transaction prefixes.',
    typePaymentMethods: 'Payment Methods',
    typePaymentMethodsDesc: 'Upload/export payment method master data.',
    typePaymentTerms: 'Payment Terms',
    typePaymentTermsDesc: 'Upload/export payment terms master data.',
  },
  userDetail: {
    titleLoading: 'User access',
    titleNotFound: 'User not found',
    backToUsers: 'Back to Users',
    save: 'Save',
    grantFull: 'Grant full access',
    resetDefault: 'Reset to Default',
    cardTransactionAccess: 'Transaction access',
    cardTransactionHint:
      'Limited users: only tick the functions and actions they may use. Menu and buttons will show only what they can access.',
    colFunction: 'Function',
    colView: 'View',
    colCreate: 'Create',
    colEdit: 'Edit',
    colDelete: 'Delete/Void',
    linkAll: 'All',
    linkNone: 'None',
    cardPassword: 'Change password',
    cardPasswordHint:
      'Optionally set a new password for this user. Leave blank to keep current password. Use the Save button above to apply.',
    labelNewPassword: 'New password',
    labelConfirmPassword: 'Confirm password',
    phNewPassword: 'New password (optional)',
    phConfirmPassword: 'Confirm new password',
    titleAccess: (user: string) => `Access control: ${user}`,
    descriptionAccess: (employeeCode: string, defaultShop: string, editingSuffix: string) =>
      `Employee code: ${employeeCode} · Default shop: ${defaultShop}${editingSuffix}`,
    editingForShop: (shop: string) => ` · Editing for shop: ${shop}`,
    failedLoadUsers: 'Failed to load users',
    failedLoadUser: 'Failed to load user',
    passwordMismatch: 'Passwords do not match',
    failedUpdateAccess: 'Failed to update access control',
    accessAndPasswordUpdated: 'Access control and password updated',
    accessUpdated: 'Access control updated',
    failedUpdatePassword: 'Failed to update password',
    failedUpdate: 'Failed to update',
    failedReset: 'Failed to reset to default',
    resetOk: 'Access control reset to role default',
    validatorPasswordMatch: 'Passwords do not match',
  },
  shopsList: {
    title: 'Shops',
    description: 'Manage shops',
    add: 'Add',
    filters: 'Filters',
    refresh: 'Refresh',
    clearAll: 'Clear All',
    filterOptions: 'Filter Options',
    searchLabel: 'Search:',
    searchPh: 'Search by shop code, name, or address...',
    search: 'Search',
    loadingData: 'Loading data...',
    noData: 'No data found.',
    tryAdjustSearch: 'Try adjusting your search terms.',
    errorLabel: 'Error:',
    labelSuccess: '✅ Success:',
    labelError: '❌ Error:',
    deleteTitle: 'Delete Shop',
    deleteConfirm: (code: string) => `Are you sure you want to delete shop "${code}"?`,
    okYes: 'Yes',
    cancel: 'Cancel',
    createTitle: 'Create New Shop',
    creating: 'Creating...',
    createShop: 'Create Shop',
    colShopCode: 'Shop Code',
    colShopName: 'Shop Name',
    colPhone: 'Phone',
    colAddress1: 'Address 1',
    colAddress2: 'Address 2',
    colDefaultWhcode: 'Warehouse',
    colWarehouseName: 'Warehouse name',
    colCreated: 'Created',
    colModified: 'Last Modified',
    titleEdit: 'Edit',
    titleDelete: 'Delete',
    labelShopCode: 'Shop Code',
    labelShopName: 'Shop Name',
    labelPhone: 'Phone',
    labelAddress1: 'Address 1',
    labelAddress2: 'Address 2',
    phShopCode: 'Enter shop code',
    phShopName: 'Enter shop name',
    phPhone: 'Enter shop phone',
    phAddress1: 'Enter primary address',
    phAddress2: 'Enter secondary address (optional)',
    ruleShopCode: 'Shop code is required',
    ruleShopName: 'Shop name is required',
    rulePhone: 'Phone is required',
    ruleAddress1: 'Address 1 is required',
    labelIsWarehouse: 'Warehouse location',
    labelDefaultWhcode: 'Default warehouse code',
    phDefaultWhcode: 'Enter default warehouse code (optional)',
  },
  shopDetail: {
    loadingTitle: 'Loading...',
    loadingDescription: 'Loading shop details',
    loadingShop: 'Loading shop details...',
    notFoundTitle: 'Shop Not Found',
    notFoundDescription: 'The requested shop could not be found',
    notFoundBody: 'Shop not found',
    back: 'Back',
    editShop: 'Edit Shop',
    saveChanges: 'Save Changes',
    cancel: 'Cancel',
    titleShop: (name: string) => `Shop: ${name}`,
    descriptionShop: (code: string) => `Manage shop details for ${code}`,
    additionalInfo: 'Additional Information',
    labelCreated: 'Created Date',
    labelModified: 'Last Modified',
    na: 'N/A',
    fetchFailed: 'Failed to fetch shop details',
    updateOk: 'Shop updated successfully',
    updateFailed: 'Failed to update shop',
    updateError: 'Error updating shop',
    labelShopCode: 'Shop Code',
    labelShopName: 'Shop Name',
    labelPhone: 'Phone',
    labelAddress1: 'Address 1',
    labelAddress2: 'Address 2',
    phShopCode: 'Enter shop code',
    phShopName: 'Enter shop name',
    phPhone: 'Enter shop phone',
    phAddress1: 'Enter primary address',
    phAddress2: 'Enter secondary address (optional)',
    ruleShopCode: 'Shop code is required',
    ruleShopName: 'Shop name is required',
    rulePhone: 'Phone is required',
    ruleAddress1: 'Address 1 is required',
    labelIsWarehouse: 'Warehouse location',
    labelDefaultWhcode: 'Default warehouse code',
    phDefaultWhcode: 'Enter default warehouse code (optional)',
  },
  paymentMethodList: {
    title: 'Payment Methods',
    description: 'Manage payment methods',
    add: 'Add',
    filters: 'Filters',
    refresh: 'Refresh',
    clearAll: 'Clear All',
    filterOptions: 'Filter Options',
    searchLabel: 'Search:',
    searchPh: 'Search by payment method code or description...',
    search: 'Search',
    loadingData: 'Loading data...',
    noData: 'No data found.',
    tryAdjustSearch: 'Try adjusting your search terms.',
    errorLabel: 'Error:',
    labelSuccess: '✅ Success:',
    labelError: '❌ Error:',
    deleteTitle: 'Delete Payment Method',
    deleteConfirm: (code: string) => `Are you sure you want to delete payment method "${code}"?`,
    okYes: 'Yes',
    cancel: 'Cancel',
    createTitle: 'Create New Payment Method',
    creating: 'Creating...',
    createPm: 'Create Payment Method',
    colPmCode: 'Payment Method Code',
    colPmDesc: 'Payment Method Description',
    colCreated: 'Created',
    colModified: 'Last Modified',
    labelPmCode: 'Payment Method Code',
    labelPmDesc: 'Payment Method Description',
    phPmCode: 'Enter payment method code',
    phPmDesc: 'Enter payment method description',
    rulePmCode: 'Payment method code is required',
    rulePmDesc: 'Payment method description is required',
    titleEdit: 'Edit',
    titleDelete: 'Delete',
  },
  paymentMethodDetail: {
    back: 'Back',
    saveChanges: 'Save Changes',
    titleEdit: (code: string) => `Edit Payment Method: ${code}`,
    description: 'Edit payment method information',
    labelSuccess: '✅ Success:',
    labelError: '❌ Error:',
    loading: 'Loading payment method data...',
    cardInfo: 'Payment Method Information',
    cardExtra: 'Additional Information',
    labelPmCode: 'Payment Method Code',
    labelDescription: 'Description',
    phDescription: 'Enter payment method description',
    ruleDescription: 'Please enter payment method description',
    labelCreateDate: 'Create Date',
    labelModified: 'Last Modified',
    notFound: 'Payment method not found.',
    fetchFailed: 'Failed to fetch payment method data',
    updateFailed: 'Failed to update payment method',
    updateError: 'Error updating payment method',
    redirectUpdated: 'Payment method updated successfully',
  },
  paymentTermList: {
    title: 'Payment Terms',
    description: 'Manage payment terms',
    add: 'Add',
    filters: 'Filters',
    refresh: 'Refresh',
    clearAll: 'Clear All',
    filterOptions: 'Filter Options',
    searchLabel: 'Search:',
    searchPh: 'Search by payment term code or description...',
    search: 'Search',
    loadingData: 'Loading data...',
    noData: 'No data found.',
    tryAdjustSearch: 'Try adjusting your search terms.',
    errorLabel: 'Error:',
    labelSuccess: '✅ Success:',
    labelError: '❌ Error:',
    deleteTitle: 'Delete Payment Term',
    deleteConfirm: (code: string) => `Are you sure you want to delete payment term "${code}"?`,
    okYes: 'Yes',
    cancel: 'Cancel',
    createTitle: 'Create New Payment Term',
    creating: 'Creating...',
    createPt: 'Create Payment Term',
    colPtCode: 'Payment Term Code',
    colPtDesc: 'Payment Term Description',
    colCreated: 'Created',
    colModified: 'Last Modified',
    labelPtCode: 'Payment Term Code',
    labelPtDesc: 'Payment Term Description',
    phPtCode: 'Enter payment term code',
    phPtDesc: 'Enter payment term description',
    rulePtCode: 'Payment term code is required',
    rulePtDesc: 'Payment term description is required',
    titleEdit: 'Edit',
    titleDelete: 'Delete',
  },
  paymentTermDetail: {
    back: 'Back',
    saveChanges: 'Save Changes',
    titleEdit: (code: string) => `Edit Payment Term: ${code}`,
    description: 'Edit payment term information',
    labelSuccess: '✅ Success:',
    labelError: '❌ Error:',
    loading: 'Loading payment term data...',
    cardInfo: 'Payment Term Information',
    cardExtra: 'Additional Information',
    labelPtCode: 'Payment Term Code',
    labelDescription: 'Description',
    phDescription: 'Enter payment term description',
    ruleDescription: 'Please enter payment term description',
    labelCreateDate: 'Create Date',
    notFound: 'Payment term not found.',
    fetchFailed: 'Failed to fetch payment term data',
    updateFailed: 'Failed to update payment term',
    updateError: 'Error updating payment term',
    redirectUpdated: 'Payment term updated successfully',
  },
  styleProfiles: {
    title: 'Style Profiles',
    description: 'Customize visual themes and appearance settings for the application',
    sectionTitle: 'Style Profiles',
    sectionBody:
      'Style profiles allow you to customize the visual appearance of the application. Choose from different themes and color schemes to match your preferences.',
    currentProfile: 'Current Profile:',
    descriptionLabel: 'Description:',
  },
  profile: {
    breadcrumbProfile: 'Profile',
    title: 'User profile',
    titleLoading: 'Profile',
    description: 'Update your default shop and password',
    failedLoad: 'Failed to load profile',
    passwordMismatch: 'New password and confirm password do not match',
    validatorPasswordMatch: 'Passwords do not match',
    saved: 'Profile updated',
    saveFailed: 'Failed to update profile',
    saveError: 'Failed to update profile',
    cardProfile: 'Profile',
    labelEmployeeId: 'Employee ID',
    labelUsername: 'Username',
    labelDefaultShop: 'Default shop',
    labelPlaceholderShop: 'Select default shop',
    cardChangePassword: 'Change password',
    currentPassword: 'Current password',
    newPassword: 'New password',
    confirmPassword: 'Confirm new password',
    placeholderLeaveBlank: 'Leave blank to keep current',
    placeholderConfirm: 'Confirm new password',
    saveProfile: 'Save profile',
    loading: 'Loading profile...',
  },
};

const ZH_HANT: AdminPagesTexts = {
  usersList: {
    supervisorRequired: '需要主管權限',
    failedLoad: '無法載入使用者',
    breadcrumbUsers: '使用者',
    title: '使用者存取控管',
    titleWithCount: (n: number) => `使用者存取控管（${n}）`,
    description: '管理使用者及其交易編輯與作廢權限',
    refresh: '重新整理',
    actionViewUser: '檢視使用者',
    accessButton: '',
    colAccess: '存取',
    colUsername: '使用者名稱',
    colEmployeeCode: '員工編號',
    colDefaultShop: '預設店舖',
    colRole: '角色',
    colStatus: '狀態',
    roleSupervisor: '主管',
    roleUser: '一般使用者',
    statusActive: '啟用',
    statusInactive: '停用',
    loading: '載入使用者中...',
    empty: '找不到使用者。',
  },
  masterData: {
    title: '主資料匯入／匯出',
    description:
      '上傳或匯出主資料檔案。匯入時會新增資料列並在鍵值相符時更新現有紀錄；不支援整表取代。',
    backToSettings: '返回設定',
    importAllSelected: '匯入所選全部',
    expectedFormatTitle: '檔案格式說明',
    expectedFormatBody:
      '請上傳 JSON 或 CSV，標題列需與資料庫欄位名稱一致。由此頁匯出的檔案格式最可靠。',
    export: '匯出',
    selectFile: '選擇檔案',
    import: '匯入',
    selectedFile: (fileName: string) => `已選擇：${fileName}`,
    processingFor: (typeTitle: string) => `正在處理 ${typeTitle}…`,
    labelSuccess: '✅ 成功：',
    labelError: '❌ 錯誤：',
    notAuthenticated: '未登入',
    exportFailed: '匯出失敗',
    importFailed: '匯入失敗',
    selectFileFirst: '請先選擇檔案',
    importAllNeedFile: '請至少選擇一個檔案以匯入',
    noFileSelected: (sample: string) => `未選擇檔案（可參考 ${sample}）。`,
    exported: (typeLabel: string) => `${typeLabel} 已匯出`,
    importedSummary: (typeLabel: string, ins: number, up: number, sk: number) =>
      `${typeLabel} 已匯入：新增 ${ins}、更新 ${up}、略過 ${sk}`,
    typeCustomers: '客戶',
    typeCustomersDesc: '上傳／匯出客戶主資料。',
    typeSuppliers: '供應商',
    typeSuppliersDesc: '上傳／匯出供應商主資料。',
    typeDistricts: '地區',
    typeDistrictsDesc: '上傳／匯出地區主資料。',
    typePrefixes: '前綴',
    typePrefixesDesc: '上傳／匯出交易前綴。',
    typePaymentMethods: '付款方式',
    typePaymentMethodsDesc: '上傳／匯出付款方式主資料。',
    typePaymentTerms: '付款條件',
    typePaymentTermsDesc: '上傳／匯出付款條件主資料。',
  },
  userDetail: {
    titleLoading: '使用者存取',
    titleNotFound: '找不到使用者',
    backToUsers: '返回使用者列表',
    save: '儲存',
    grantFull: '授予完整權限',
    resetDefault: '重設為預設',
    cardTransactionAccess: '交易存取',
    cardTransactionHint:
      '一般使用者：僅勾選可使用的功能與動作。選單與按鈕僅顯示其有權限者。',
    colFunction: '功能',
    colView: '檢視',
    colCreate: '新增',
    colEdit: '編輯',
    colDelete: '刪除/作廢',
    linkAll: '全選',
    linkNone: '全不選',
    cardPassword: '變更密碼',
    cardPasswordHint:
      '可選擇為此使用者設定新密碼；留空則維持原密碼。請按上方儲存套用。',
    labelNewPassword: '新密碼',
    labelConfirmPassword: '確認密碼',
    phNewPassword: '新密碼（選填）',
    phConfirmPassword: '再次輸入新密碼',
    titleAccess: (user: string) => `存取控管：${user}`,
    descriptionAccess: (employeeCode: string, defaultShop: string, editingSuffix: string) =>
      `員工編號：${employeeCode} · 預設店舖：${defaultShop}${editingSuffix}`,
    editingForShop: (shop: string) => ` · 編輯店舖：${shop}`,
    failedLoadUsers: '無法載入使用者',
    failedLoadUser: '無法載入使用者資料',
    passwordMismatch: '兩次密碼不一致',
    failedUpdateAccess: '無法更新存取控管',
    accessAndPasswordUpdated: '存取控管與密碼已更新',
    accessUpdated: '存取控管已更新',
    failedUpdatePassword: '無法更新密碼',
    failedUpdate: '無法更新',
    failedReset: '無法重設為預設',
    resetOk: '存取控管已重設為角色預設',
    validatorPasswordMatch: '密碼不一致',
  },
  shopsList: {
    title: '店舖',
    description: '管理店舖',
    add: '新增',
    filters: '篩選',
    refresh: '重新整理',
    clearAll: '清除全部',
    filterOptions: '篩選選項',
    searchLabel: '搜尋：',
    searchPh: '以店舖編號、名稱或地址搜尋…',
    search: '搜尋',
    loadingData: '載入資料中…',
    noData: '沒有資料。',
    tryAdjustSearch: '請嘗試調整搜尋條件。',
    errorLabel: '錯誤：',
    labelSuccess: '✅ 成功：',
    labelError: '❌ 錯誤：',
    deleteTitle: '刪除店舖',
    deleteConfirm: (code: string) => `確定要刪除店舖「${code}」？`,
    okYes: '是',
    cancel: '取消',
    createTitle: '新增店舖',
    creating: '建立中…',
    createShop: '建立店舖',
    colShopCode: '店舖編號',
    colShopName: '店舖名稱',
    colPhone: '電話',
    colAddress1: '地址一',
    colAddress2: '地址二',
    colDefaultWhcode: '倉庫',
    colWarehouseName: '倉庫名稱',
    colCreated: '建立時間',
    colModified: '最後修改',
    titleEdit: '編輯',
    titleDelete: '刪除',
    labelShopCode: '店舖編號',
    labelShopName: '店舖名稱',
    labelPhone: '電話',
    labelAddress1: '地址一',
    labelAddress2: '地址二',
    phShopCode: '輸入店舖編號',
    phShopName: '輸入店舖名稱',
    phPhone: '輸入電話',
    phAddress1: '輸入主要地址',
    phAddress2: '輸入次要地址（選填）',
    ruleShopCode: '請填寫店舖編號',
    ruleShopName: '請填寫店舖名稱',
    rulePhone: '請填寫電話',
    ruleAddress1: '請填寫地址一',
    labelIsWarehouse: '倉庫據點',
    labelDefaultWhcode: '預設倉庫編號',
    phDefaultWhcode: '輸入預設倉庫編號（選填）',
  },
  shopDetail: {
    loadingTitle: '載入中…',
    loadingDescription: '載入店舖資料',
    loadingShop: '載入店舖資料中…',
    notFoundTitle: '找不到店舖',
    notFoundDescription: '查無此店舖',
    notFoundBody: '找不到店舖',
    back: '返回',
    editShop: '編輯店舖',
    saveChanges: '儲存變更',
    cancel: '取消',
    titleShop: (name: string) => `店舖：${name}`,
    descriptionShop: (code: string) => `管理店舖 ${code} 的資料`,
    additionalInfo: '其他資訊',
    labelCreated: '建立時間',
    labelModified: '最後修改',
    na: '無',
    fetchFailed: '無法取得店舖資料',
    updateOk: '店舖已更新',
    updateFailed: '無法更新店舖',
    updateError: '更新店舖時發生錯誤',
    labelShopCode: '店舖編號',
    labelShopName: '店舖名稱',
    labelPhone: '電話',
    labelAddress1: '地址一',
    labelAddress2: '地址二',
    phShopCode: '輸入店舖編號',
    phShopName: '輸入店舖名稱',
    phPhone: '輸入電話',
    phAddress1: '輸入主要地址',
    phAddress2: '輸入次要地址（選填）',
    ruleShopCode: '請填寫店舖編號',
    ruleShopName: '請填寫店舖名稱',
    rulePhone: '請填寫電話',
    ruleAddress1: '請填寫地址一',
    labelIsWarehouse: '倉庫據點',
    labelDefaultWhcode: '預設倉庫編號',
    phDefaultWhcode: '輸入預設倉庫編號（選填）',
  },
  paymentMethodList: {
    title: '付款方式',
    description: '管理付款方式',
    add: '新增',
    filters: '篩選',
    refresh: '重新整理',
    clearAll: '清除全部',
    filterOptions: '篩選選項',
    searchLabel: '搜尋：',
    searchPh: '以付款方式代碼或說明搜尋…',
    search: '搜尋',
    loadingData: '載入資料中…',
    noData: '沒有資料。',
    tryAdjustSearch: '請嘗試調整搜尋條件。',
    errorLabel: '錯誤：',
    labelSuccess: '✅ 成功：',
    labelError: '❌ 錯誤：',
    deleteTitle: '刪除付款方式',
    deleteConfirm: (code: string) => `確定要刪除付款方式「${code}」？`,
    okYes: '是',
    cancel: '取消',
    createTitle: '新增付款方式',
    creating: '建立中…',
    createPm: '建立付款方式',
    colPmCode: '付款方式代碼',
    colPmDesc: '付款方式說明',
    colCreated: '建立時間',
    colModified: '最後修改',
    labelPmCode: '付款方式代碼',
    labelPmDesc: '付款方式說明',
    phPmCode: '輸入付款方式代碼',
    phPmDesc: '輸入付款方式說明',
    rulePmCode: '請填寫付款方式代碼',
    rulePmDesc: '請填寫付款方式說明',
    titleEdit: '編輯',
    titleDelete: '刪除',
  },
  paymentMethodDetail: {
    back: '返回',
    saveChanges: '儲存變更',
    titleEdit: (code: string) => `編輯付款方式：${code}`,
    description: '編輯付款方式資料',
    labelSuccess: '✅ 成功：',
    labelError: '❌ 錯誤：',
    loading: '載入付款方式資料中…',
    cardInfo: '付款方式資料',
    cardExtra: '其他資訊',
    labelPmCode: '付款方式代碼',
    labelDescription: '說明',
    phDescription: '輸入付款方式說明',
    ruleDescription: '請輸入付款方式說明',
    labelCreateDate: '建立時間',
    labelModified: '最後修改',
    notFound: '找不到付款方式。',
    fetchFailed: '無法取得付款方式資料',
    updateFailed: '無法更新付款方式',
    updateError: '更新付款方式時發生錯誤',
    redirectUpdated: '付款方式已更新',
  },
  paymentTermList: {
    title: '付款條件',
    description: '管理付款條件',
    add: '新增',
    filters: '篩選',
    refresh: '重新整理',
    clearAll: '清除全部',
    filterOptions: '篩選選項',
    searchLabel: '搜尋：',
    searchPh: '以付款條件代碼或說明搜尋…',
    search: '搜尋',
    loadingData: '載入資料中…',
    noData: '沒有資料。',
    tryAdjustSearch: '請嘗試調整搜尋條件。',
    errorLabel: '錯誤：',
    labelSuccess: '✅ 成功：',
    labelError: '❌ 錯誤：',
    deleteTitle: '刪除付款條件',
    deleteConfirm: (code: string) => `確定要刪除付款條件「${code}」？`,
    okYes: '是',
    cancel: '取消',
    createTitle: '新增付款條件',
    creating: '建立中…',
    createPt: '建立付款條件',
    colPtCode: '付款條件代碼',
    colPtDesc: '付款條件說明',
    colCreated: '建立時間',
    colModified: '最後修改',
    labelPtCode: '付款條件代碼',
    labelPtDesc: '付款條件說明',
    phPtCode: '輸入付款條件代碼',
    phPtDesc: '輸入付款條件說明',
    rulePtCode: '請填寫付款條件代碼',
    rulePtDesc: '請填寫付款條件說明',
    titleEdit: '編輯',
    titleDelete: '刪除',
  },
  paymentTermDetail: {
    back: '返回',
    saveChanges: '儲存變更',
    titleEdit: (code: string) => `編輯付款條件：${code}`,
    description: '編輯付款條件資料',
    labelSuccess: '✅ 成功：',
    labelError: '❌ 錯誤：',
    loading: '載入付款條件資料中…',
    cardInfo: '付款條件資料',
    cardExtra: '其他資訊',
    labelPtCode: '付款條件代碼',
    labelDescription: '說明',
    phDescription: '輸入付款條件說明',
    ruleDescription: '請輸入付款條件說明',
    labelCreateDate: '建立時間',
    notFound: '找不到付款條件。',
    fetchFailed: '無法取得付款條件資料',
    updateFailed: '無法更新付款條件',
    updateError: '更新付款條件時發生錯誤',
    redirectUpdated: '付款條件已更新',
  },
  styleProfiles: {
    title: '樣式設定檔',
    description: '自訂應用程式外觀主題與顯示設定',
    sectionTitle: '樣式設定檔',
    sectionBody:
      '樣式設定檔可自訂應用程式視覺外觀，請依喜好選擇主題與配色。',
    currentProfile: '目前設定檔：',
    descriptionLabel: '說明：',
  },
  profile: {
    breadcrumbProfile: '個人資料',
    title: '使用者個人資料',
    titleLoading: '個人資料',
    description: '更新預設店舖與密碼',
    failedLoad: '無法載入個人資料',
    passwordMismatch: '新密碼與確認密碼不一致',
    validatorPasswordMatch: '密碼不一致',
    saved: '個人資料已更新',
    saveFailed: '無法更新個人資料',
    saveError: '無法更新個人資料',
    cardProfile: '個人資料',
    labelEmployeeId: '員工編號',
    labelUsername: '使用者名稱',
    labelDefaultShop: '預設店舖',
    labelPlaceholderShop: '選擇預設店舖',
    cardChangePassword: '變更密碼',
    currentPassword: '目前密碼',
    newPassword: '新密碼',
    confirmPassword: '確認新密碼',
    placeholderLeaveBlank: '留空則不變更',
    placeholderConfirm: '再次輸入新密碼',
    saveProfile: '儲存個人資料',
    loading: '載入個人資料中...',
  },
};

export function getAdminPagesTexts(lang: AppLanguage): AdminPagesTexts {
  return lang === 'zh-Hant' ? ZH_HANT : EN;
}
