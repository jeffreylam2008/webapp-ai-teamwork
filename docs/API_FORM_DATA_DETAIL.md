# API Detail: `/api/transactions/form-data`

## 📋 Overview

**Endpoint**: `GET /api/transactions/form-data`  
**Purpose**: Fetch dropdown data for transaction forms (customers, products, shops, employees)  
**File Location**: `src/app/api/transactions/form-data/route.ts`

---

## 🔧 Full Implementation

```typescript
import { NextRequest, NextResponse } from 'next/server';
import dbService from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    console.log('[API] Fetching form data for transaction edit');

    // Fetch customers
    const customersResult = await dbService.query(
      `SELECT cust_code, name, phone_1, email_1 
       FROM t_customers 
       ORDER BY name ASC`
    );

    // Fetch products
    const productsResult = await dbService.query(
      `SELECT item_code, eng_name, chi_name, unit, price 
       FROM t_items 
       ORDER BY eng_name ASC`
    );

    // Fetch shops
    const shopsResult = await dbService.query(
      `SELECT shop_code, name 
       FROM t_shop 
       ORDER BY name ASC`
    );

    console.log('[API] Form data fetched successfully');
    console.log('[API] Customers:', customersResult.data?.length || 0);
    console.log('[API] Products:', productsResult.data?.length || 0);
    console.log('[API] Shops:', shopsResult.data?.length || 0);

    return NextResponse.json({
      success: true,
      data: {
        customers: customersResult.data || [],
        products: productsResult.data || [],
        shops: shopsResult.data || [],
        employees: [] // Empty array for now since t_employees table might not exist
      }
    });

  } catch (error) {
    console.error('[API] Error fetching form data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to fetch form data: ${errorMessage}` },
      { status: 500 }
    );
  }
}
```

---

## 📊 Database Queries

### 1. **Customers Query**
```sql
SELECT cust_code, name, phone_1, email_1 
FROM t_customers 
ORDER BY name ASC
```

**Table**: `t_customers`  
**Fields Returned**:
- `cust_code` (string) - Customer code
- `name` (string) - Customer name
- `phone_1` (string) - Phone number
- `email_1` (string) - Email address

**Ordering**: Alphabetically by name (ASC)

---

### 2. **Products Query**
```sql
SELECT item_code, eng_name, chi_name, unit, price 
FROM t_items 
ORDER BY eng_name ASC
```

**Table**: `t_items`  
**Fields Returned**:
- `item_code` (string) - Item code
- `eng_name` (string) - English name
- `chi_name` (string) - Chinese name
- `unit` (string) - Unit of measurement
- `price` (number) - Price

**Ordering**: Alphabetically by English name (ASC)

---

### 3. **Shops Query**
```sql
SELECT shop_code, name 
FROM t_shop 
ORDER BY name ASC
```

**Table**: `t_shop`  
**Fields Returned**:
- `shop_code` (string) - Shop code
- `name` (string) - Shop name

**Ordering**: Alphabetically by name (ASC)

---

### 4. **Employees Query**
```sql
-- ⚠️ NOT CURRENTLY IMPLEMENTED
-- Returns empty array []
```

**Table**: `t_employee` (not currently queried)  
**Expected Fields** (if implemented):
- `employee_code` (string/number) - Employee code
- `name` or `username` (string) - Employee name/username

**Status**: ❌ **NOT FETCHED** - Returns empty array

---

## 📤 Response Structure

### ✅ **Success Response** (200 OK)

```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "cust_code": "CUST001",
        "name": "ABC Company",
        "phone_1": "12345678",
        "email_1": "abc@example.com"
      },
      {
        "cust_code": "CUST002",
        "name": "XYZ Corporation",
        "phone_1": "87654321",
        "email_1": "xyz@example.com"
      }
    ],
    "products": [
      {
        "item_code": "ITEM001",
        "eng_name": "Product A",
        "chi_name": "產品A",
        "unit": "PCS",
        "price": 100.00
      },
      {
        "item_code": "ITEM002",
        "eng_name": "Product B",
        "chi_name": "產品B",
        "unit": "BOX",
        "price": 250.50
      }
    ],
    "shops": [
      {
        "shop_code": "SHOP001",
        "name": "Main Store"
      },
      {
        "shop_code": "SHOP002",
        "name": "Branch Store"
      }
    ],
    "employees": []  // ⚠️ Always empty array
  }
}
```

### ❌ **Error Response** (500 Internal Server Error)

```json
{
  "success": false,
  "error": "Failed to fetch form data: [error message]"
}
```

---

## 🔍 Usage in Frontend

### **Example: Quotation Create Page**

```typescript
const fetchFormData = async () => {
  try {
    const response = await fetch('/api/transactions/form-data');
    const result = await response.json();
    
    if (result.success) {
      setFormData(result.data);
      // result.data contains:
      // - customers: Array
      // - products: Array
      // - shops: Array
      // - employees: [] (empty)
    } else {
      console.error('Failed to fetch form data:', result.error);
      message.error('Failed to load form data');
    }
  } catch (error) {
    console.error('Error fetching form data:', error);
    message.error('Error loading form data');
  }
};
```

### **Form Data Interface**

```typescript
interface FormData {
  customers: Array<{
    cust_code: string;
    name: string;
    phone_1: string;
    email_1: string;
  }>;
  products: Array<{
    item_code: string;
    eng_name: string;
    chi_name: string;
    unit: string;
    price: number;
  }>;
  shops: Array<{
    shop_code: string;
    name: string;
  }>;
  employees: Array<{
    employee_code: string;
    name: string;
  }>; // ⚠️ Currently always empty
}
```

---

## ⚠️ Current Issues

### **1. Employees Array is Empty**

**Problem**: The API returns an empty `employees` array with a comment:
```typescript
employees: [] // Empty array for now since t_employees table might not exist
```

**Impact**:
- Employee dropdown cannot be populated from API
- Frontend must rely on `useAuth()` hook to get current user's employee info
- Cannot select other employees in the dropdown

**Solution**: Update the API to fetch employees:
```typescript
// Fetch employees
const employeesResult = await dbService.query(
  `SELECT employee_code, username as name 
   FROM t_employee 
   WHERE status = 1 
   ORDER BY username ASC`
);

// Then include in response:
employees: employeesResult.data || []
```

---

## 📝 Logging

The API logs the following information:

1. **On Start**: `[API] Fetching form data for transaction edit`
2. **On Success**: 
   - `[API] Form data fetched successfully`
   - `[API] Customers: [count]`
   - `[API] Products: [count]`
   - `[API] Shops: [count]`
3. **On Error**: `[API] Error fetching form data: [error]`

---

## 🔐 Authentication

**Current Status**: ❌ **NO AUTHENTICATION REQUIRED**

The API does not check for:
- JWT tokens
- User authentication
- Authorization/permissions

**Security Note**: This API is publicly accessible. Consider adding authentication if sensitive data is involved.

---

## 🚀 Performance Considerations

1. **No Caching**: Each request queries the database directly
2. **No Pagination**: Returns all records (could be slow with large datasets)
3. **Sequential Queries**: Runs 3 separate database queries (could be optimized with Promise.all)
4. **No Filtering**: Returns all active records

---

## 💡 Suggested Improvements

1. **Add Employee Fetching**:
   ```typescript
   const employeesResult = await dbService.query(
     `SELECT employee_code, username as name 
      FROM t_employee 
      WHERE status = 1 
      ORDER BY username ASC`
   );
   ```

2. **Add Authentication**:
   ```typescript
   const token = extractTokenFromRequest(request);
   if (!token) {
     return NextResponse.json(
       { success: false, error: 'Unauthorized' },
       { status: 401 }
     );
   }
   ```

3. **Optimize with Promise.all**:
   ```typescript
   const [customersResult, productsResult, shopsResult, employeesResult] = 
     await Promise.all([
       dbService.query('SELECT ... FROM t_customers ...'),
       dbService.query('SELECT ... FROM t_items ...'),
       dbService.query('SELECT ... FROM t_shop ...'),
       dbService.query('SELECT ... FROM t_employee ...')
     ]);
   ```

4. **Add Caching** (if appropriate):
   ```typescript
   // Cache for 5 minutes
   return NextResponse.json(data, {
     headers: {
       'Cache-Control': 'public, max-age=300'
     }
   });
   ```

---

## 📍 Where It's Used

This API is called by:
1. ✅ `src/app/sales/quotations/create/[transCode]/page.tsx`
2. ✅ `src/app/sales/invoices/detail/[transCode]/page.tsx`
3. ✅ `src/app/sales/quotations/detail/[transCode]/page.tsx`
4. ✅ Other transaction-related pages

---

## 🧪 Testing

### **Test Request**
```bash
curl -X GET http://localhost:3000/api/transactions/form-data
```

### **Expected Response**
```json
{
  "success": true,
  "data": {
    "customers": [...],
    "products": [...],
    "shops": [...],
    "employees": []
  }
}
```

---

## 📚 Related APIs

- `GET /api/transactions` - List transactions
- `GET /api/transactions/detail/[transCode]` - Get transaction details
- `PUT /api/transactions/update` - Update transaction
- `GET /api/auth/verify` - Verify user token (for user info)

---

**Last Updated**: Based on current codebase  
**Status**: ⚠️ Needs employee fetching implementation

