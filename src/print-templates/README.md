# Print templates

Each transaction type has its own HTML layout under **`html/`**. The print page loads the matching template, merges transaction data, and renders it on screen.

## HTML templates

| Template file | Transaction type | Route |
|---------------|------------------|-------|
| `invoice.html` | Standard Invoice | `/sales/invoices/print/[transCode]` |
| `monthly-invoice.html` | Monthly Invoice | `/sales/monthly-invoices/print/[transCode]` |
| `sales-order.html` | Sales Order | `/sales/orders/print/[transCode]` |
| `quotation.html` | Quotation | `/sales/quotations/print/[transCode]` |
| `purchase-order.html` | Purchase Order | `/purchasing/purchases/print/[transCode]` |
| `delivery-note.html` | Delivery Note (DN) | `/warehouse/stock/print/[transCode]` |

## API

`GET /api/print-templates/{templateId}` → raw HTML from `html/{templateId}.html`

## Registry

`printTemplateRegistry.ts` maps template ids and can resolve from transaction prefix:

- `INV` + `invoice_subtype=monthly` → `monthly-invoice`
- `INV` → `invoice`
- `QTA` → `quotation`
- `SO` → `sales-order`
- `PO` → `purchase-order`
- `DN` → `delivery-note`

## Usage

```tsx
import { TransactionPrintPageContent, PRINT_TEMPLATE_IDS } from '@/print-templates';

<TransactionPrintPageContent
  templateId={PRINT_TEMPLATE_IDS.INVOICE}
  documentTitle="Invoice"
  codeLabel="Invoice No.:"
/>
```

If `templateId` is omitted, it is resolved from the loaded transaction header (`prefix`, `invoice_subtype`).

## Template syntax

- `{{field}}` – text
- `{{#if flag}}...{{/if}}` / `{{#unless flag}}...{{/unless}}`
- `{{#each details}}...{{/each}}`

Context is built in `buildPrintContext.ts` (party, billing period, line items, totals, etc.).
