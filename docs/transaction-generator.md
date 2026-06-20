# Transaction Generator System

## Overview
The Transaction Generator system provides a reusable way to generate unique transaction codes for different types of transactions (Delivery Notes, Invoices, Purchase Orders, etc.) while supporting multi-user scenarios.

## Components

### 1. TransactionGenerator Service (`src/services/transactionGenerator.ts`)
A reusable service class that handles:
- **Session Management**: Generates unique session IDs for multi-user support
- **Transaction Code Generation**: Creates formatted transaction codes (e.g., `DN2509-048`)
- **Transaction Lifecycle**: Start, commit, and discard transactions

### 2. API Endpoints
- **`/api/transaction-generator/next`**: Get next transaction number
- **`/api/transaction-generator/commit`**: Commit a transaction session
- **`/api/transaction-generator/discard`**: Discard a transaction session

### 3. Database Table: `t_trans_num_generator`
```sql
CREATE TABLE t_trans_num_generator (
  uid INT AUTO_INCREMENT PRIMARY KEY,
  prefix VARCHAR(50),           -- Transaction type (DN, INV, PO, etc.)
  suffix VARCHAR(50) NOT NULL,  -- Year/Month identifier (e.g., 2509)
  last_number INT,              -- Last allocated sequence (or legacy column `last`)
  session_id VARCHAR(100),      -- Browser session holding the reservation
  status VARCHAR(20),           -- reserved | committed | discarded
  create_date DATETIME,
  expiry_date DATE,
  UNIQUE KEY uk_trans_num_prefix_suffix (prefix, suffix)  -- required: one counter per pair
);
```

Run `scripts/migrations/trans_num_generator_unique_prefix_suffix.sql` once if you have duplicate rows.

## How It Works

### Transaction Code Format
- **Format**: `{PREFIX}{SUFFIX}-{SEQUENCE}`
- **Example**: `DN2509-048`
  - `DN` = Delivery Note prefix
  - `2509` = September 2025 (YYMM format)
  - `048` = Sequence number (padded to 3 digits)

### Multi-User Session Management
1. **User enters page** → Generates unique `session_id` in `sessionStorage`
2. **Next number** → One row per `(prefix, suffix)`; `last` increments by 1 (`GREATEST(last, max in t_transaction_h) + 1`)
3. **Session** → `session_id` on that row points at the browser holding the reservation (overwritten on each new `next` for the same prefix+suffix)
4. **User saves** → `commit` sets `status = committed` (or commits by `transactionCode`)
5. **User discards** → `status = discarded`, `session_id` cleared; sequence is not reused (next `next` still increments)

### Session ID Generation
- **Format**: `{timestamp}{random}`
- **Example**: `68b5c04d11aaa`
- **Uniqueness**: Timestamp + random string ensures uniqueness

## Usage Examples

### Basic Usage
```typescript
import { TransactionGenerator } from '@/services/transactionGenerator';

// Start a new transaction
const session = await TransactionGenerator.startTransaction('DN');
console.log(session.transactionCode); // e.g., "DN2509-048"

// Save the transaction
await TransactionGenerator.commitTransaction(session.sessionId);

// Or discard it
await TransactionGenerator.discardTransaction(session.sessionId);
```

### Integration in Forms
```typescript
const [transactionSession, setTransactionSession] = useState<TransactionSession | null>(null);

useEffect(() => {
  const initTransaction = async () => {
    const session = await TransactionGenerator.startTransaction('DN');
    setTransactionSession(session);
    form.setFieldsValue({ transaction_code: session.transactionCode });
  };
  initTransaction();
}, []);

const handleSave = async () => {
  // Save form data...
  await TransactionGenerator.commitTransaction(transactionSession.sessionId);
};

const handleDiscard = async () => {
  await TransactionGenerator.discardTransaction(transactionSession.sessionId);
  router.push('/back');
};
```

## Supported Transaction Types
- **DN** - Delivery Note
- **INV** - Invoice
- **PO** - Purchase Order
- **SO** - Sales Order
- **CR** - Credit Note
- **DR** - Debit Note

## Benefits
1. **Unique Codes**: No duplicate transaction codes
2. **Multi-User Safe**: Session-based isolation allows multiple browsers
3. **Reusable**: Same system for all transaction types
4. **Audit Trail**: Tracks all transaction attempts
5. **Automatic Cleanup**: Discarded sessions are removed

## Error Handling
- **Network Errors**: Automatic retry logic
- **Database Errors**: Proper rollback and cleanup
- **Session Expiry**: Automatic cleanup of old sessions
- **User Navigation**: Warns about unsaved changes
