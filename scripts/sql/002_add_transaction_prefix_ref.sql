-- Store stable transaction type on t_transaction_h.prefix_ref and mirror into prefix.
-- Display document codes (trans_code) come from t_prefix.prefix / t_trans_num_generator.

-- 1) Backfill prefix_ref from master where prefix column matched display code
UPDATE t_transaction_h h
INNER JOIN t_prefix p ON UPPER(TRIM(h.prefix)) = UPPER(TRIM(p.prefix))
SET h.prefix_ref = p.prefix_ref
WHERE h.prefix_ref IS NULL OR TRIM(h.prefix_ref) = '';

-- 2) Legacy display codes → prefix_ref
UPDATE t_transaction_h SET prefix_ref = '_SO' WHERE (prefix_ref IS NULL OR TRIM(prefix_ref) = '') AND UPPER(TRIM(prefix)) = 'SO';
UPDATE t_transaction_h SET prefix_ref = '_QT' WHERE (prefix_ref IS NULL OR TRIM(prefix_ref) = '') AND UPPER(TRIM(prefix)) = 'QTA';
UPDATE t_transaction_h SET prefix_ref = '_INV' WHERE (prefix_ref IS NULL OR TRIM(prefix_ref) = '') AND UPPER(TRIM(prefix)) = 'INV';
UPDATE t_transaction_h SET prefix_ref = '_PO' WHERE (prefix_ref IS NULL OR TRIM(prefix_ref) = '') AND UPPER(TRIM(prefix)) = 'PO';
UPDATE t_transaction_h SET prefix_ref = '_GR' WHERE (prefix_ref IS NULL OR TRIM(prefix_ref) = '') AND UPPER(TRIM(prefix)) = 'GRN';
UPDATE t_transaction_h SET prefix_ref = '_DN' WHERE (prefix_ref IS NULL OR TRIM(prefix_ref) = '') AND UPPER(TRIM(prefix)) = 'DN';
UPDATE t_transaction_h SET prefix_ref = '_AD' WHERE (prefix_ref IS NULL OR TRIM(prefix_ref) = '') AND UPPER(TRIM(prefix)) = 'ADJ';
UPDATE t_transaction_h SET prefix_ref = '_ST' WHERE (prefix_ref IS NULL OR TRIM(prefix_ref) = '') AND UPPER(TRIM(prefix)) = 'ST';

-- 3) Rows that stored ref in prefix column before prefix_ref column existed
UPDATE t_transaction_h SET prefix_ref = prefix
WHERE (prefix_ref IS NULL OR TRIM(prefix_ref) = '') AND UPPER(TRIM(prefix)) LIKE '\\_%';

-- 4) Fill empty prefix from prefix_ref (inserts that only wrote prefix_ref)
UPDATE t_transaction_h
SET prefix = prefix_ref
WHERE prefix_ref IS NOT NULL AND TRIM(prefix_ref) <> ''
  AND (prefix IS NULL OR TRIM(prefix) = '');

-- 5) Sync prefix to prefix_ref when prefix is still a legacy display code
UPDATE t_transaction_h
SET prefix = prefix_ref
WHERE prefix_ref IS NOT NULL AND TRIM(prefix_ref) <> ''
  AND UPPER(TRIM(prefix)) <> UPPER(TRIM(prefix_ref))
  AND UPPER(TRIM(prefix_ref)) LIKE '\\_%';
