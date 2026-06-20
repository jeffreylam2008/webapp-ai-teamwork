# Save Quotation Form - Step by Step Process

## 📋 Overview

This document explains the complete step-by-step process when a user clicks "Save Quotation" button in the create quotation page.

---

## 🔄 Complete Flow Diagram

```
User Clicks "Save Quotation"
    ↓
1. Frontend Validation
    ↓
2. Prepare Data Object
    ↓
3. Call PUT /api/transactions/update
    ↓
4. Backend Database Transaction
    ├─ Update t_transaction_h (Header)
    ├─ Delete old t_transaction_d (Details)
    ├─ Insert new t_transaction_d (Details)
    └─ COMMIT or ROLLBACK
    ↓
5. Call POST /api/transaction-generator/commit
    ↓
6. Mark Session as Committed
    ↓
7. Show Success Message & Navigate
```

---

## 📝 Step-by-Step Details

### **STEP 1: User Clicks "Save Quotation" Button**

**Location**: `src/app/sales/quotations/create/[transCode]/page.tsx`  
**Function**: `handleSave()`

**Code**:
```typescript
const handleSave = async () => {
  try {
    setSaving(true);  // Show loading state
    
    const formValues = await form.validateFields();
    // ... validation and save logic
  }
}
```

**What happens**:
- Button shows loading state (`setSaving(true)`)
- Form validation is triggered
- If validation fails, error messages are shown

---

### **STEP 2: Form Validation**

**Location**: `handleSave()` function

**Validations**:

#### 2.1. Form Fields Validation
```typescript
const formValues = await form.validateFields();
```
- Validates all required form fields (customer, shop, etc.)
- Uses Ant Design Form validation rules
- If validation fails, throws error and stops process

#### 2.2. Line Items Validation
```typescript
// Check if at least one line item exists
if (lineItems.length === 0) {
  message.error('Please add at least one line item');
  return;
}

// Check for incomplete line items
const incompleteItems = lineItems.filter(item => 
  !item.item_code || item.qty <= 0 || item.price <= 0
);

if (incompleteItems.length > 0) {
  message.error('Please complete all line items (item code, quantity, and price are required)');
  return;
}
```

**What is checked**:
- ✅ At least one line item must exist
- ✅ Each line item must have: `item_code`, `qty > 0`, `price > 0`

**If validation fails**: Error message shown, process stops

---

### **STEP 3: Prepare Quotation Data Object**

**Location**: `handleSave()` function

**Code**:
```typescript
const quotationData = {
  transCode: transCode,  // e.g., "QTA-2024-001"
  headerData: {
    ...formValues,  // All form field values
    prefix: 'QTA',
    total: lineItems.reduce((sum, item) => sum + item.line_total, 0),
    // Automatically use current logged-in user's employee_code
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
  paymentTotalsData: []  // No payment totals for quotations
};
```

**Data Structure**:

**Header Data** (`headerData`):
```typescript
{
  cust_code: string,           // From form
  refer_code?: string,          // From form
  shop_code: string,            // From form (auto-filled)
  quotation_date: Date,         // From form
  valid_until: Date,           // From form
  remark?: string,              // From form
  prefix: 'QTA',               // Fixed value
  total: number,                // Calculated from line items
  employee_code: string         // Auto-filled from logged-in user
}
```

**Details Data** (`detailsData`):
```typescript
[
  {
    trans_code: string,
    item_code: string,
    eng_name: string,
    chi_name: string,
    qty: number,
    unit: string,
    price: number,
    discount: number
  },
  // ... more line items
]
```

**Key Points**:
- `employee_code` is **automatically added** from `user.employee_code` (not from form)
- `total` is **calculated** from sum of all line item totals
- `prefix` is always `'QTA'` for quotations

---

### **STEP 4: Call Update API**

**Location**: `handleSave()` function

**API Call**:
```typescript
const response = await fetch('/api/transactions/update', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(quotationData),
});

const result = await response.json();
```

**Endpoint**: `PUT /api/transactions/update`  
**File**: `src/app/api/transactions/update/route.ts`

---

### **STEP 5: Backend Database Transaction**

**Location**: `src/app/api/transactions/update/route.ts`

#### 5.1. Start Database Transaction
```typescript
await dbService.query('START TRANSACTION');
```
- Begins a database transaction
- All subsequent operations are atomic (all succeed or all fail)

#### 5.2. Update Transaction Header (`t_transaction_h`)

**SQL Query**:
```sql
UPDATE t_transaction_h 
SET 
  cust_code = ?,
  refer_code = ?,
  shop_code = ?,
  quotation_date = ?,
  valid_until = ?,
  remark = ?,
  prefix = 'QTA',
  total = ?,
  employee_code = ?,  -- From logged-in user
  modify_date = NOW()
WHERE trans_code = ?
```

**Fields Updated**:
- `cust_code` - Customer code
- `refer_code` - Reference code (optional)
- `shop_code` - Shop code
- `quotation_date` - Quotation date
- `valid_until` - Valid until date
- `remark` - Remarks (optional)
- `prefix` - Always 'QTA'
- `total` - Total amount (calculated)
- `employee_code` - **Current logged-in user's employee code**
- `modify_date` - Current timestamp

**Code**:
```typescript
if (headerData) {
  const headerUpdateFields = [];
  const headerValues = [];
  
  // Build dynamic UPDATE query based on provided fields
  if (headerData.cust_code !== undefined) {
    headerUpdateFields.push('cust_code = ?');
    headerValues.push(headerData.cust_code);
  }
  // ... similar for other fields
  
  if (headerData.employee_code !== undefined) {
    headerUpdateFields.push('employee_code = ?');
    headerValues.push(headerData.employee_code);  // From logged-in user
  }
  
  // Add modify_date
  headerUpdateFields.push('modify_date = NOW()');
  headerValues.push(transCode);
  
  const headerUpdateQuery = `
    UPDATE t_transaction_h 
    SET ${headerUpdateFields.join(', ')} 
    WHERE trans_code = ?
  `;
  
  await dbService.query(headerUpdateQuery, headerValues);
}
```

#### 5.3. Update Transaction Details (`t_transaction_d`)

**Process**:
1. **Delete existing details**:
   ```sql
   DELETE FROM t_transaction_d WHERE trans_code = ?
   ```

2. **Insert new details** (for each line item):
   ```sql
   INSERT INTO t_transaction_d (
     trans_code, item_code, eng_name, chi_name, 
     qty, pstock, unit, price, discount, 
     create_date, modify_date
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
   ```

**Code**:
```typescript
if (detailsData && Array.isArray(detailsData)) {
  // Delete existing details
  await dbService.query(
    'DELETE FROM t_transaction_d WHERE trans_code = ?',
    [transCode]
  );
  
  // Insert new details
  for (const detail of detailsData) {
    await dbService.query(
      `INSERT INTO t_transaction_d (...) VALUES (...)`,
      [
        transCode,
        detail.item_code || '',
        detail.eng_name || '',
        detail.chi_name || '',
        detail.qty || 0,
        detail.pstock || 0,
        detail.unit || '',
        detail.price || 0,
        detail.discount || 0
      ]
    );
  }
}
```

**Note**: `pstock` is set to `0` (not used in quotations)

#### 5.4. Commit or Rollback

**On Success**:
```typescript
await dbService.query('COMMIT');
return NextResponse.json({
  success: true,
  message: 'Transaction updated successfully'
});
```

**On Error**:
```typescript
await dbService.query('ROLLBACK');
throw error;  // Error is caught and returned to frontend
```

**Transaction Safety**:
- If ANY step fails, ALL changes are rolled back
- Ensures data consistency

---

### **STEP 6: Commit Transaction Generator Session**

**Location**: `handleSave()` function (after update API succeeds)

**API Call**:
```typescript
if (browserSessionId) {
  const commitResponse = await fetch('/api/transaction-generator/commit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId: browserSessionId }),
  });

  const commitResult = await commitResponse.json();
  
  if (!commitResult.success) {
    throw new Error(commitResult.error || 'Failed to commit transaction');
  }
}
```

**Endpoint**: `POST /api/transaction-generator/commit`  
**File**: `src/app/api/transaction-generator/commit/route.ts`

**What it does**:
1. Checks if session exists in `t_trans_num_generator` table
2. Updates session status to `"committed"`:
   ```sql
   UPDATE t_trans_num_generator 
   SET status = "committed" 
   WHERE session_id = ?
   ```
3. Marks the transaction number as used (cannot be reused)

**Purpose**: 
- Prevents transaction number from being reused
- Tracks that the quotation was successfully created

---

### **STEP 7: Success Handling**

**Location**: `handleSave()` function

**Code**:
```typescript
if (result.success) {
  // Commit transaction generator session (Step 6)
  // ...
  
  message.success('Quotation created successfully!');
  setIsLeaving(true);  // Allow navigation without modal
  router.push('/sales/quotations');
}
```

**What happens**:
1. ✅ Shows success message: "Quotation created successfully!"
2. ✅ Sets `isLeaving = true` (allows navigation without "leave page" modal)
3. ✅ Navigates to `/sales/quotations` (quotations list page)

---

### **STEP 8: Error Handling**

**Location**: `handleSave()` function

**Code**:
```typescript
} catch (error) {
  console.error('Error saving quotation:', error);
  message.error('Error saving quotation');
} finally {
  setSaving(false);  // Hide loading state
}
```

**Error Scenarios**:
1. **Form validation fails** → Error message shown, process stops
2. **Line items validation fails** → Error message shown, process stops
3. **API call fails** → Error message: "Failed to create quotation"
4. **Commit session fails** → Error thrown, transaction may be saved but session not committed
5. **Database error** → Transaction rolled back, error returned

**Error Messages**:
- "Please add at least one line item"
- "Please complete all line items (item code, quantity, and price are required)"
- "Failed to create quotation"
- "Error saving quotation"
- "Failed to commit transaction"

---

## 📊 Database Tables Updated

### **1. `t_transaction_h` (Transaction Header)**
**Updated Fields**:
- `cust_code`
- `refer_code`
- `shop_code`
- `quotation_date`
- `valid_until`
- `remark`
- `prefix` = 'QTA'
- `total`
- `employee_code` ← **From logged-in user**
- `modify_date` = NOW()

### **2. `t_transaction_d` (Transaction Details)**
**Process**:
- All existing rows for this `trans_code` are **DELETED**
- New rows are **INSERTED** for each line item

**Fields Inserted**:
- `trans_code`
- `item_code`
- `eng_name`
- `chi_name`
- `qty`
- `pstock` = 0
- `unit`
- `price`
- `discount`
- `create_date` = NOW()
- `modify_date` = NOW()

### **3. `t_trans_num_generator` (Transaction Number Generator)**
**Updated Field**:
- `status` = "committed"

**Purpose**: Marks the transaction number as used

---

## 🔑 Key Points

### **Employee Code Handling**
- ✅ **NOT** selectable in form (field removed)
- ✅ **Automatically** set from `user.employee_code` (logged-in user)
- ✅ **Always** included in `headerData` when saving
- ✅ **Saved** to `t_transaction_h.employee_code` in database

### **Transaction Safety**
- ✅ Uses database transactions (START TRANSACTION / COMMIT / ROLLBACK)
- ✅ If any step fails, all changes are rolled back
- ✅ Ensures data consistency

### **Data Flow**
```
Form Values → quotationData.headerData → API → Database UPDATE
Line Items → quotationData.detailsData → API → Database DELETE + INSERT
User.employee_code → quotationData.headerData.employee_code → Database
```

---

## 🧪 Testing Checklist

- [ ] Form validation works (required fields)
- [ ] Line items validation works (at least one item, complete items)
- [ ] Data is correctly prepared with employee_code
- [ ] API call succeeds
- [ ] Database header is updated correctly
- [ ] Database details are deleted and re-inserted correctly
- [ ] Transaction generator session is committed
- [ ] Success message is shown
- [ ] Navigation to quotations list works
- [ ] Error handling works for all scenarios
- [ ] Database transaction rollback works on error

---

## 📝 Summary

**Complete Process**:
1. User clicks "Save Quotation"
2. Frontend validates form and line items
3. Data object is prepared (with auto-filled employee_code)
4. PUT request to `/api/transactions/update`
5. Backend starts database transaction
6. Updates `t_transaction_h` header
7. Deletes and inserts `t_transaction_d` details
8. Commits database transaction
9. POST request to `/api/transaction-generator/commit`
10. Marks session as committed
11. Shows success message
12. Navigates to quotations list

**Total API Calls**: 2
- `PUT /api/transactions/update` (save data)
- `POST /api/transaction-generator/commit` (commit session)

**Database Operations**: 3 tables
- `t_transaction_h` (UPDATE)
- `t_transaction_d` (DELETE + INSERT)
- `t_trans_num_generator` (UPDATE)

**Employee Code**: Automatically set from logged-in user, not from form

