export const zhHant = {
  breadcrumb: {
    home: '首頁',
    manage: '管理',
    system: '系統',
  },
  page: {
    title: '系統設定',
    description: '設定全域系統行為',
    save: '儲存',
    resetDefault: '重設預設值',
  },
  cards: {
    title: '系統設定',
  },
  messages: {
    loadFailed: '無法載入系統設定',
    loadDefaultsSuccess: '已重設表單為資料庫預設值',
    loadDefaultsFailed: '無法載入預設值',
    saved: '已儲存',
    saveFailed: '儲存失敗',
  },
  errors: {
    systemNameSaveFailed: '系統名稱儲存失敗',
    idleSaveFailed: '閒置時間儲存失敗',
    quotationValiditySaveFailed: '報價有效天數儲存失敗',
    paginationSaveFailed: '分頁設定儲存失敗',
    languageSaveFailed: '語言儲存失敗',
    timezoneSaveFailed: '時區儲存失敗',
  },
  sections: {
    systemName: {
      title: '系統名稱',
      hint: '顯示於登入頁（標題與頁尾）。',
      placeholder: '例如：ERP 系統',
    },
    logo: {
      title: '標誌',
      hint: '登入頁／一般品牌：圖示名稱或圖片 URL。',
      placeholder: '例如：AppstoreAddOutlined 或 https://...',
    },
    shopLogo: {
      title: '商店標誌',
      hint: '登入後側欄顯示。圖示名稱或圖片 URL；留空則使用「標誌」。',
      placeholder: '例如：ShopOutlined 或 /logo-300x300.png',
    },
    language: {
      title: '系統語言',
      hint: '用於支援語系文字的頁面。',
      rolloutHint: '目前已套用：報價單與銷售訂單頁面文字標籤。',
      options: {
        en: 'English',
        zhHant: '繁體中文',
      },
    },
    timezone: {
      title: '時區',
      hint: '交易建立／修改時間及列表顯示所用的當地時間。',
      rolloutHint: '預設：Asia/Hong_Kong。變更後會影響全系統日期時間顯示與寫入。',
    },
    idle: {
      title: '閒置登出（分鐘）',
      hint: '瀏覽器無操作後自動登出。',
      hint2: '當瀏覽器在此時間內無操作，系統會自動登出並返回登入頁。',
      required: '請輸入閒置登出時間（分鐘）',
      invalidNumber: '數字無效',
      range: '閒置時間必須介乎 1 到 1440 分鐘',
    },
    quotationValidity: {
      title: '報價預設有效期（天）',
      hint: '預設「有效至」日期偏移。',
      hint2: '建立新報價單時：有效至 = 報價日期 + 此天數。',
      required: '請輸入報價預設有效期（天）',
      invalidNumber: '數字無效',
      range: '天數必須介乎 1 到 3650',
    },
    pagination: {
      title: '表格分頁',
      hint: '每頁預設及最大可選列數。',
      hint2: '套用於有每頁列數選擇的列表頁。預設用於首次載入；最大為可選的最大值。',
      required: '必填',
      invalidNumber: '數字無效',
      defaultRange: '預設必須介乎 1-500',
      maxRange: '最大必須介乎 1-500',
      placeholderDefault: '預設',
      placeholderMax: '最大',
    },
  },
} as const;

