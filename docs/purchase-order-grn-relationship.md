# Purchase order (PO) and goods received note (GRN)

This document describes how **purchase orders** and **GRNs** are linked, and how **status** changes when a GRN is **created**, **edited**, or **deleted (voided)**.

## Data model (unchanging rules)

| Entity | Key fields |
|--------|------------|
| **PO** | `t_transaction_h.prefix = 'PO'`, `trans_code` = PO number |
| **GRN** | `prefix = 'GRN'`; link to PO is **`refer_code` = PO `trans_code`** |

One PO can have many GRNs. Each GRN references at most one PO via `refer_code`.

**Status-like fields**

| Field | Where | Meaning |
|-------|--------|---------|
| `is_void` | Header | `0` = active, `1` = voided (GRN or PO) |
| `is_settle` | PO header only | `1` = PO treated as settled (fully received per GRN sync); `0` = not |
| List **status** string | API/UI | Derived from `is_void`, `is_settle`, `is_convert` (e.g. Active, Void, Settled) — not a separate column |
| `po_fully_grn_received` | PO list API only | Computed flag for UI; **not** stored in DB |

Received quantities for a PO come from **non-void** GRNs with `refer_code = PO`, summing `t_transaction_d.qty` per `item_code` (`GET /api/transactions/po-received/[poCode]`).

---

## 1. Creation

**User flow:** open GRN create with `?po=<PO_TRANS_CODE>`, fill lines, save → `PUT /api/transactions/update` inserts/updates GRN header + details (`refer_code` set to PO when created from PO).

### GRN document

| Item | After create |
|------|----------------|
| `prefix` | `GRN` |
| `is_void` | `0` (active) |
| `refer_code` | PO `trans_code` when created from that PO |
| Line items | Stored in `t_transaction_d` for the GRN |

**Warehouse:** stock increases for the GRN receipt (per GRN warehouse delta logic in `PUT /api/transactions/update`).

### Linked purchase order

| Item | After create |
|------|----------------|
| PO header lines / `is_void` | Unchanged by GRN create |
| **`is_settle`** | **Recomputed** via `syncPurchaseOrderSettlementFromGrns(poCode)` after the GRN save |

Settlement rule (simplified): for every PO line with order qty &gt; 0 (by `item_code`), if **sum of non-void GRN qty** ≥ ordered qty → set PO **`is_settle = 1`**; else **`is_settle = 0`**.

### What the user sees (status)

- **GRN:** list/detail show **Active** (not voided).
- **PO:** if fully received after this GRN → **`is_settle = 1`** → list/detail show **Settled** (and Create GRN / void PO actions are restricted per app rules). If partially received → **`is_settle = 0`**, typically **Active**.

---

## 2. Edit

**GRN edit:** user changes header/lines on the GRN screen → `PUT /api/transactions/update` with existing `transCode`, new header + `detailsData`.

**PO edit:** user changes PO header/lines on the PO screen → same update route for `prefix = 'PO'`.

### GRN document

| Item | After edit |
|------|------------|
| `is_void` | Unchanged unless the request explicitly sets void (normally edit keeps `0`) |
| `refer_code` | Can change if the UI allows it; settlement sync uses **current** `refer_code` on save |
| Line items | Replaced when `detailsData` is sent |

**Warehouse:** deltas = difference between old GRN line qty and new (for active GRN), so stock moves with the edit.

### Linked purchase order

| Trigger | PO change |
|---------|-----------|
| **GRN saved** and `refer_code` points to a PO | **`is_settle` recomputed** for that PO |
| **PO saved** | **`is_settle` recomputed** for that PO |

If edits reduce received coverage (e.g. lower GRN qty, void is not “edit” but see §3), or PO order qty increases, **`is_settle` may go from `1` back to `0`**.

### What the user sees (status)

- **GRN:** still **Active** if not voided.
- **PO:** **Settled** vs **Active** follows the new **`is_settle`** after sync; list **status** column follows `is_void` / `is_settle` / `is_convert` rules in `GET /api/transactions`.

---

## 3. Delete (void)

For GRNs, “delete” in the UI is **void**: `PUT /api/transactions/update` with `headerData: { prefix: 'GRN', is_void: 1 }` and **no** `detailsData` (header-only update). Detail rows stay in the database for history/display.

**PO physical delete** is a separate API (`DELETE /api/transactions/delete-po`); settled POs cannot be deleted. That path is not the same as GRN void.

### GRN document

| Item | After void |
|------|------------|
| `is_void` | **`1`** |
| `refer_code` | Unchanged |
| Line items | **Kept** (not wiped on void-only update) |

**Warehouse:** receipt reversed by GRN delta logic (same as treating receipt qty as 0 for an active→void transition).

### Linked purchase order

| Item | After GRN void |
|------|----------------|
| Voided GRN | **Excluded** from `po-received` totals and from settlement math |
| **`is_settle`** | **Recomputed** for the PO referenced by `refer_code` |

If remaining non-void GRNs no longer cover full PO qty → **`is_settle = 0`**. PO may return to **Active**; **Create GRN** can become available again if not blocked by other rules.

### What the user sees (status)

- **GRN:** **Void** (list/detail).
- **PO:** **Settled** only if still fully covered by other non-void GRNs; otherwise **Active** with **`is_settle = 0`**.

---

## Quick reference: status by operation

| Operation | GRN `is_void` | GRN list status (typical) | PO `is_settle` | PO list status (typical) |
|-----------|---------------|---------------------------|----------------|---------------------------|
| **Create GRN** (from PO) | `0` | Active | `1` if fully received, else `0` | Settled or Active |
| **Edit GRN** (qty/lines) | `0` | Active | Recalculated | Settled or Active |
| **Edit PO** (lines/qty) | — | — | Recalculated | Settled or Active |
| **Void GRN** | `1` | Void | Recalculated (often `0` if no longer fully received) | Active or Settled |

---

## Other references (unchanged behaviour)

- **Related GRNs on PO:** `GET /api/transactions?prefix=GRN&refer_code=<PO>&pageSize=50`
- **GRN detail → PO link:** `/purchasing/purchases/detail/<refer_code>`
- **Fully received flag on PO list:** `po_fully_grn_received` in `GET /api/transactions?prefix=PO&...`

## Key files

| Area | Location |
|------|----------|
| PO → GRN navigation | `src/app/purchasing/purchases/page.tsx`, `src/app/purchasing/purchases/detail/[transCode]/page.tsx` |
| GRN from PO | `src/app/warehouse/stock/grn/page.tsx` |
| Received totals API | `src/app/api/transactions/po-received/[poCode]/route.ts` |
| Save, void, settlement sync | `src/app/api/transactions/update/route.ts` (`syncPurchaseOrderSettlementFromGrns`) |
| PO list fully received | `src/app/api/transactions/route.ts` |
| GRN detail → PO | `src/app/warehouse/stock/detail/[transCode]/page.tsx` |
