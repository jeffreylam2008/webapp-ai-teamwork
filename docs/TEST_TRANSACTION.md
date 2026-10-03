# Test transaction scripts

App URL is **not** fixed to port 8000. Set it with `--base-url`, `--port`, or env (`BASE_URL` / `PORT` in `.env.local`).

## Quotation (sales)

`scripts/test-quotations.js` creates quotations through the same APIs as the UI: login, load master customers/items, generate a QTA number, then save and commit.

Each quotation:

- random customer from master (`/api/transactions/form-data`, fallback `/api/customers`)
- random 2–3 items
- random qty 2–20 per line
- item price from master (`price_special` when set)

```bash
npm run test:quotations -- --count 3 --port 8000 --username YOUR_USER --password YOUR_PASS --shop HQ01
# or
npm run test:quotations -- --count 3 --base-url http://192.168.1.10:3000 --username YOUR_USER --password YOUR_PASS --shop HQ01
```

## Purchase order (purchasing)

`scripts/test-purchases.js` creates purchase orders the same way: login, load master suppliers/items/shops, generate a PO number, then save and commit.

Each PO:

- random supplier from master
- random shop from master (non-warehouse); re-logs in under that shop so shop-scope accepts it
- random warehouse (`default_whcode` or a warehouse shop)
- random 2–100 items
- random qty 2–100 per line
- line price from `purchase_price` (fallback sell `price`)

```bash
npm run test:purchases -- --count 3 --port 8000 --username YOUR_USER --password YOUR_PASS
```

Optional `--shop HQ01` fixes the login shop (no random shop switch). Credentials can also come from `TEST_USERNAME` / `TEST_PASSWORD` / `TEST_SHOP` in `.env.local`.
