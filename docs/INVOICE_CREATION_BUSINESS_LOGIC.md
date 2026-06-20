# Invoice Creation – Business Logic & Relation to Delivery Notes

## Summary

- **Invoice creation does NOT create a delivery note.** They are separate transaction types and separate flows. Creating an invoice only writes the invoice record (and details/payment); it does not create a delivery note or change warehouse stock.

---

## 1. Does invoice creation create a delivery note?

**No.** In this app:

- **Invoices** use prefix `INV` and are created/updated via **`PUT /api/transactions/update`**. That API only:
  - Inserts/updates **`t_transaction_h`** (header with `prefix = 'INV'`)
  - Replaces **`t_transaction_d`** (line items)
  - Replaces **`t_transaction_t`** (payment totals)
- It does **not** call the delivery-note API, does **not** insert any `DN` transaction, and does **not** update warehouse stock.

- **Delivery notes** use prefix `DN` and are created via **`POST /api/delivery-notes`**. That API:
  - Inserts into **`t_transaction_h`** with `prefix = 'DN'`
  - Inserts into **`t_transaction_d`**
  - **Updates `t_warehouse`** (decreases stock for each item)

So: **invoice creation and delivery-note creation are independent.** Saving an invoice never creates a delivery note.

---

## 2. General business logic of invoice creation

End-to-end flow:

1. **Start from list**
   - User is on **Sales → Invoices** (`/sales/invoices`).

2. **Generate invoice number**
   - User opens “Create” (modal).
   - App gets a browser session ID (e.g. from `sessionStorage`: `invoice_session_id`).
   - App calls transaction generator (**`POST /api/transaction-generator/next`**) with prefix **`INV`** and suffix (e.g. `YYMM`). Generator returns a new code (e.g. `INV2502-001`).
   - That number is **reserved** for this session until it is committed or discarded.

3. **Navigate to create page**
   - User is sent to **`/sales/invoices/create/[transCode]`** (e.g. `INV2502-001`).

4. **Fill form**
   - **Header:** Invoice number (read-only), invoice date, customer (required), reference code, shop (required), payment method, remarks.
   - **Lines:** Add items (from product list), set qty/price/discount per line; line total and grand total are derived.
   - Validation: at least one line; each line must have item, qty &gt; 0, price &gt; 0.

5. **Save**
   - **`handleSave()`**:
     - Validates form and line items.
     - Builds payload: `transCode`, `headerData` (form + prefix `INV`, total, employee_code, `quotation_date` from invoice date), `detailsData` (line items), `paymentTotalsData` (if payment method selected).
     - Calls **`PUT /api/transactions/update`** with that payload.
   - **API** (same as above): INSERT/UPDATE `t_transaction_h`, replace `t_transaction_d` and `t_transaction_t` for that `trans_code`. No delivery note, no stock change.

6. **After successful save**
   - If there was a browser session for the generator, app calls **`TransactionGenerator.commitTransaction(browserSessionId)`** so the invoice number is marked as used.
   - User is redirected to **`/sales/invoices`** (list).

7. **Discard (optional path)**
   - If user discards instead of saving, app calls **`TransactionGenerator.discardTransaction(browserSessionId)`** and clears `invoice_session_id`; the number can be reused later. No record is written and no delivery note is involved.

---

## 3. How this differs from delivery notes

| Aspect              | Invoice creation                    | Delivery note creation                |
|---------------------|-------------------------------------|---------------------------------------|
| **Prefix**          | `INV`                               | `DN`                                  |
| **API**             | `PUT /api/transactions/update`      | `POST /api/delivery-notes`            |
| **Tables written**  | `t_transaction_h`, `t_transaction_d`, `t_transaction_t` | `t_transaction_h`, `t_transaction_d` |
| **Warehouse stock** | Not updated                         | **Updated** (stock decreased)         |
| **Trigger**         | User saves invoice on create page   | User creates/saves delivery note on warehouse delivery-note flow |

So: **invoice creation does not create a delivery note**, and the two flows are separate. If you want “create delivery note when invoice is saved”, that would require new logic (e.g. after a successful invoice save, call the delivery-note API or a new endpoint that creates a DN from the invoice).
