# Quotation Data Structure - Detailed View

## 📋 Overview

This document shows **exactly** what data is prepared in the "Prepare Data Object" step and what will be passed to the database when saving a quotation.

---

## 🔍 Step 3: Prepare Data Object - Detailed Breakdown

### **Location**: `handleSave()` function
**File**: `src/app/sales/quotations/create/[transCode]/page.tsx`

---

## 📊 1. Form Values (`formValues`)

**Source**: `const formValues = await form.validateFields();`

**Contains all form field values**:

```typescript
formValues = {
  trans_code: "QTA-2024-001",           // From URL param (disabled field)
  cust_code: "CUST001",                  // Selected customer code (REQUIRED)
  refer_code: "REF-12345",               // Reference code (optional)
  shop_code: "SHOP001",                  // Selected shop code (REQUIRED, auto-filled)
  quotation_date: dayjs("2024-01-15"),  // Quotation date (dayjs object)
  valid_until: dayjs("2024-02-14"),     // Valid until date (dayjs object, +30 days)
  remark: "Please review and confirm"    // Remarks (optional)
}
```

**Note**: 
- `trans_code` is from URL parameter, not from form input
- `quotation_date` and `valid_until` are **dayjs objects** (will be converted to date strings)
- `employee_code` is **NOT** in formValues (removed from form)

---

## 📦 2. Line Items (`lineItems`)

**Source**: `lineItems` state array

**Structure** (QuotationLineItem interface):
```typescript
interface QuotationLineItem {
  uid: number;           // Unique ID for React key
  item_code: string;     // Item code
  eng_name: string;      // English name
  chi_name: string;      // Chinese name
  qty: number;           // Quantity
  unit: string;          // Unit (e.g., "PCS", "BOX")
  price: number;         // Unit price
  discount: number;      // Discount percentage (0-100)
  line_total: number;    // Calculated: (qty * price) - (discount%)
}
```

**Example Line Items**:
```typescript
lineItems = [
  {
    uid: 1705123456789,
    item_code: "ITEM001",
    eng_name: "Product A",
    chi_name: "產品A",
    qty: 10,
    unit: "PCS",
    price: 100.00,
    discount: 5,         // 5% discount
    line_total: 950.00   // (10 * 100) - (1000 * 0.05) = 950
  },
  {
    uid: 1705123456790,
    item_code: "ITEM002",
    eng_name: "Product B",
    chi_name: "產品B",
    qty: 5,
    unit: "BOX",
    price: 250.50,
    discount: 0,         // No discount
    line_total: 1252.50 // (5 * 250.50) - 0 = 1252.50
  }
]
```

**Line Total Calculation**:
```typescript
line_total = (qty * price) - ((qty * price) * (discount / 100))
```

---

## 🎯 3. Complete Quotation Data Object

**Code**:
```typescript
const quotationData = {
  transCode: transCode,
  headerData: {
    ...formValues,
    prefix: 'QTA',
    total: lineItems.reduce((sum, item) => sum + item.line_total, 0),
    employee_code: user ? String(user.employee_code) : undefined
  },
  detailsData: lineItems.map(item => ({
    trans_code: transCode,
    item_code: item.item_code,
    eng_name: item.eng_name,
    chi_name: item.chi_name,
    qty: item.qty,
    unit: item.unit,
    price: item.price,
    discount: item.discount
  })),
  paymentTotalsData: []
};
```

---

## 📤 4. Complete Data Object Example

### **Full `quotationData` Object**:

```json
{
  "transCode": "QTA-2024-001",
  "headerData": {
    "trans_code": "QTA-2024-001",
    "cust_code": "CUST001",
    "refer_code": "REF-12345",
    "shop_code": "SHOP001",
    "quotation_date": "2024-01-15T00:00:00.000Z",
    "valid_until": "2024-02-14T00:00:00.000Z",
    "remark": "Please review and confirm",
    "prefix": "QTA",
    "total": 2202.50,
    "employee_code": "1001"
  },
  "detailsData": [
    {
      "trans_code": "QTA-2024-001",
      "item_code": "ITEM001",
      "eng_name": "Product A",
      "chi_name": "產品A",
      "qty": 10,
      "unit": "PCS",
      "price": 100.00,
      "discount": 5
    },
    {
      "trans_code": "QTA-2024-001",
      "item_code": "ITEM002",
      "eng_name": "Product B",
      "chi_name": "產品B",
      "qty": 5,
      "unit": "BOX",
      "price": 250.50,
      "discount": 0
    }
  ],
  "paymentTotalsData": []
}
```

---

## 🗄️ 5. What Gets Saved to Database

### **5.1. Table: `t_transaction_h` (Header)**

**SQL UPDATE Statement**:
```sql
UPDATE t_transaction_h 
SET 
  cust_code = ?,
  refer_code = ?,
  shop_code = ?,
  quotation_date = ?,
  valid_until = ?,
  remark = ?,
  prefix = ?,
  total = ?,
  employee_code = ?,
  modify_date = NOW()
WHERE trans_code = ?
```

**Actual Values Inserted** (from example above):
```sql
UPDATE t_transaction_h 
SET 
  cust_code = 'CUST001',
  refer_code = 'REF-12345',
  shop_code = 'SHOP001',
  quotation_date = '2024-01-15',
  valid_until = '2024-02-14',
  remark = 'Please review and confirm',
  prefix = 'QTA',
  total = 2202.50,
  employee_code = '1001',        -- From logged-in user
  modify_date = NOW()
WHERE trans_code = 'QTA-2024-001'
```

**Field Mapping**:

| Form Field | Database Column | Source | Example Value |
|------------|----------------|--------|---------------|
| `cust_code` | `cust_code` | Form (required) | "CUST001" |
| `refer_code` | `refer_code` | Form (optional) | "REF-12345" |
| `shop_code` | `shop_code` | Form (required, auto-filled) | "SHOP001" |
| `quotation_date` | `quotation_date` | Form (dayjs → date) | "2024-01-15" |
| `valid_until` | `valid_until` | Form (dayjs → date) | "2024-02-14" |
| `remark` | `remark` | Form (optional) | "Please review..." |
| `prefix` | `prefix` | Fixed value | "QTA" |
| `total` | `total` | Calculated from line items | 2202.50 |
| `employee_code` | `employee_code` | **From logged-in user** | "1001" |
| - | `modify_date` | Auto (NOW()) | Current timestamp |

**Note**: 
- `trans_code` is used in WHERE clause (not updated)
- `employee_code` comes from `user.employee_code` (NOT from form)

---

### **5.2. Table: `t_transaction_d` (Details)**

**Process**:
1. **DELETE** all existing rows for this `trans_code`
2. **INSERT** new rows for each line item

**SQL DELETE Statement**:
```sql
DELETE FROM t_transaction_d WHERE trans_code = 'QTA-2024-001'
```

**SQL INSERT Statement** (for each line item):
```sql
INSERT INTO t_transaction_d (
  trans_code, item_code, eng_name, chi_name, 
  qty, pstock, unit, price, discount, 
  create_date, modify_date
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
```

**Actual Values Inserted** (from example above):

**Line Item 1**:
```sql
INSERT INTO t_transaction_d (
  trans_code, item_code, eng_name, chi_name, 
  qty, pstock, unit, price, discount, 
  create_date, modify_date
) VALUES (
  'QTA-2024-001',    -- trans_code
  'ITEM001',         -- item_code
  'Product A',       -- eng_name
  '產品A',           -- chi_name
  10,                -- qty
  0,                 -- pstock (always 0 for quotations)
  'PCS',             -- unit
  100.00,            -- price
  5,                 -- discount (percentage)
  NOW(),             -- create_date
  NOW()              -- modify_date
)
```

**Line Item 2**:
```sql
INSERT INTO t_transaction_d (
  trans_code, item_code, eng_name, chi_name, 
  qty, pstock, unit, price, discount, 
  create_date, modify_date
) VALUES (
  'QTA-2024-001',    -- trans_code
  'ITEM002',         -- item_code
  'Product B',       -- eng_name
  '產品B',           -- chi_name
  5,                 -- qty
  0,                 -- pstock (always 0 for quotations)
  'BOX',             -- unit
  250.50,            -- price
  0,                 -- discount (percentage)
  NOW(),             -- create_date
  NOW()              -- modify_date
)
```

**Field Mapping**:

| Line Item Field | Database Column | Source | Example Value |
|----------------|-----------------|--------|---------------|
| `trans_code` | `trans_code` | From URL param | "QTA-2024-001" |
| `item_code` | `item_code` | From line item | "ITEM001" |
| `eng_name` | `eng_name` | From line item | "Product A" |
| `chi_name` | `chi_name` | From line item | "產品A" |
| `qty` | `qty` | From line item | 10 |
| - | `pstock` | Fixed (0) | 0 |
| `unit` | `unit` | From line item | "PCS" |
| `price` | `price` | From line item | 100.00 |
| `discount` | `discount` | From line item | 5 |
| - | `create_date` | Auto (NOW()) | Current timestamp |
| - | `modify_date` | Auto (NOW()) | Current timestamp |

**Note**: 
- `line_total` is **NOT** saved to database (calculated on-the-fly if needed)
- `pstock` is always `0` for quotations
- `uid` from line items is **NOT** saved (only used for React keys)

---

## 🔑 Key Data Transformations

### **1. Form Values Spread**
```typescript
headerData: {
  ...formValues,  // Spreads all form fields
  // Then adds/overrides:
  prefix: 'QTA',
  total: calculated_total,
  employee_code: user.employee_code
}
```

### **2. Date Conversion**
- **Form**: dayjs objects (`dayjs("2024-01-15")`)
- **API**: ISO string (`"2024-01-15T00:00:00.000Z"`)
- **Database**: Date format (`"2024-01-15"`)

### **3. Line Items Mapping**
- **Frontend**: Full `QuotationLineItem` with `uid` and `line_total`
- **API**: Simplified object without `uid` and `line_total`
- **Database**: Only fields needed for `t_transaction_d` table

### **4. Employee Code**
- **Form**: ❌ Not present (field removed)
- **API**: ✅ Automatically added from `user.employee_code`
- **Database**: ✅ Saved to `t_transaction_h.employee_code`

### **5. Total Calculation**
```typescript
total = lineItems.reduce((sum, item) => sum + item.line_total, 0)
// Example: 950.00 + 1252.50 = 2202.50
```

---

## 📋 Complete Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. FORM VALUES (formValues)                                 │
├─────────────────────────────────────────────────────────────┤
│ trans_code: "QTA-2024-001"                                  │
│ cust_code: "CUST001"                                        │
│ refer_code: "REF-12345"                                      │
│ shop_code: "SHOP001"                                         │
│ quotation_date: dayjs("2024-01-15")                         │
│ valid_until: dayjs("2024-02-14")                            │
│ remark: "Please review..."                                  │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. LINE ITEMS (lineItems)                                   │
├─────────────────────────────────────────────────────────────┤
│ [                                                           │
│   { item_code: "ITEM001", qty: 10, price: 100, ... },      │
│   { item_code: "ITEM002", qty: 5, price: 250.50, ... }     │
│ ]                                                           │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. QUOTATION DATA OBJECT (quotationData)                    │
├─────────────────────────────────────────────────────────────┤
│ {                                                           │
│   transCode: "QTA-2024-001",                                │
│   headerData: {                                             │
│     ...formValues,                                          │
│     prefix: "QTA",                                          │
│     total: 2202.50,                                         │
│     employee_code: "1001"  ← Added automatically           │
│   },                                                        │
│   detailsData: [                                            │
│     { trans_code, item_code, eng_name, ... },              │
│     { trans_code, item_code, eng_name, ... }               │
│   ],                                                        │
│   paymentTotalsData: []                                     │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. API REQUEST (PUT /api/transactions/update)               │
├─────────────────────────────────────────────────────────────┤
│ Body: JSON.stringify(quotationData)                        │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. DATABASE UPDATE                                          │
├─────────────────────────────────────────────────────────────┤
│ UPDATE t_transaction_h SET ... WHERE trans_code = ?        │
│ DELETE FROM t_transaction_d WHERE trans_code = ?           │
│ INSERT INTO t_transaction_d VALUES ... (for each item)    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Summary

### **What Gets Sent to API**:
```json
{
  "transCode": "QTA-2024-001",
  "headerData": {
    "cust_code": "CUST001",
    "refer_code": "REF-12345",
    "shop_code": "SHOP001",
    "quotation_date": "2024-01-15T00:00:00.000Z",
    "valid_until": "2024-02-14T00:00:00.000Z",
    "remark": "Please review and confirm",
    "prefix": "QTA",
    "total": 2202.50,
    "employee_code": "1001"
  },
  "detailsData": [
    {
      "trans_code": "QTA-2024-001",
      "item_code": "ITEM001",
      "eng_name": "Product A",
      "chi_name": "產品A",
      "qty": 10,
      "unit": "PCS",
      "price": 100.00,
      "discount": 5
    },
    {
      "trans_code": "QTA-2024-001",
      "item_code": "ITEM002",
      "eng_name": "Product B",
      "chi_name": "產品B",
      "qty": 5,
      "unit": "BOX",
      "price": 250.50,
      "discount": 0
    }
  ],
  "paymentTotalsData": []
}
```

### **What Gets Saved to Database**:

**`t_transaction_h`**:
- All header fields including `employee_code` from logged-in user

**`t_transaction_d`**:
- One row per line item
- `pstock` always = 0
- `line_total` NOT saved (calculated field)

### **Key Points**:
- ✅ `employee_code` is automatically added (not from form)
- ✅ `total` is calculated from line items
- ✅ `line_total` is NOT saved to database
- ✅ Dates are converted from dayjs to date strings
- ✅ `pstock` is always 0 for quotations

