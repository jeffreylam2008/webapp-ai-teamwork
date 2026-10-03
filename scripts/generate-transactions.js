/**
 * Generate random Sales Orders (SO) or Invoices (INV) from existing customers and items.
 *
 * Usage:
 *   node scripts/generate-transactions.js --count 10 --type SO
 *   node scripts/generate-transactions.js 5 INV
 *   npm run generate:transactions -- --count 20 --type INV
 *
 * Requires: .env.local, src/data/db-config.json, rows in t_customers and t_items
 */

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const { resolveDbConfig } = require('./lib/resolve-db-config');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ALLOWED_TYPES = new Set(['SO', 'INV']);
const MIN_LINES = 1;
const MAX_LINES = 10;
const MIN_QTY = 1;
const MAX_QTY = 20;

function loadJson(filename) {
  const filepath = path.join(PROJECT_ROOT, 'src', 'data', filename);
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function parseArgs(argv) {
  let count = null;
  let type = null;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--count' || arg === '-c') {
      count = Number.parseInt(argv[++i], 10);
      continue;
    }
    if (arg === '--type' || arg === '-t') {
      type = String(argv[++i] || '').trim().toUpperCase();
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    if (/^\d+$/.test(arg) && count == null) {
      count = Number.parseInt(arg, 10);
      continue;
    }
    if (ALLOWED_TYPES.has(String(arg).toUpperCase()) && !type) {
      type = String(arg).toUpperCase();
    }
  }

  return { count, type };
}

function printHelp() {
  console.log(`
Generate random transactions from existing customers and items.

Usage:
  node scripts/generate-transactions.js --count <n> --type <SO|INV>
  node scripts/generate-transactions.js <n> <SO|INV>

Options:
  --count, -c   Number of transactions to create (required)
  --type,  -t   Transaction type: SO or INV (required)

Each transaction:
  - Random customer from t_customers
  - Random 1-10 line items from t_items (unique per transaction)
  - Random qty 1-20 per line
  - Uses item price (or price_special when available)
`);
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function pickUniqueItems(items, count) {
  const pool = [...items];
  const picked = [];
  const n = Math.min(count, pool.length);
  while (picked.length < n) {
    const idx = randInt(0, pool.length - 1);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function pad3(n) {
  return String(n).padStart(3, '0');
}

function sqlNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function getYymmSuffix(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

async function loadColumnMap(connection, table) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME AS column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [table]
  );
  const map = new Map();
  for (const row of rows) {
    map.set(String(row.column_name).toLowerCase(), row.column_name);
  }
  return map;
}

function hasCol(map, name) {
  return map.has(name.toLowerCase());
}

function buildInsertSql(table, row) {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(', ');
  const quoted = cols.map((c) => `\`${c}\``).join(', ');
  const sql = `INSERT INTO \`${table}\` (${quoted}) VALUES (${placeholders})`;
  return { sql, params: cols.map((c) => row[c]) };
}

async function maxSeqFromHeaders(connection, prefix, suffix) {
  const like = `${prefix}${suffix}-%`;
  const [rows] = await connection.execute(
    'SELECT trans_code FROM t_transaction_h WHERE trans_code LIKE ? ORDER BY trans_code DESC LIMIT 1',
    [like]
  );
  const last = rows[0]?.trans_code ? String(rows[0].trans_code) : '';
  const m = last.match(/-(\d{1,})$/);
  const n = m ? Number(m[1]) : 0;
  return Number.isFinite(n) ? n : 0;
}

async function allocTransCode(connection, prefix, suffix, seqState) {
  seqState.value += 1;
  const nextNum = seqState.value;
  return `${prefix}${suffix}-${pad3(nextNum)}`;
}

async function syncGeneratorAfterBatch(connection, prefix, suffix, lastNumber) {
  const [tables] = await connection.execute(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_trans_num_generator'`
  );
  if (Number(tables[0]?.cnt || 0) === 0) return;

  const [cols] = await connection.execute(
    `SELECT COLUMN_NAME AS column_name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_trans_num_generator'`
  );
  const colSet = new Set(cols.map((r) => String(r.column_name).toLowerCase()));
  const seqCol = colSet.has('last_number') ? 'last_number' : colSet.has('last') ? 'last' : null;
  if (!seqCol) return;

  const hasStatus = colSet.has('status');
  if (hasStatus) {
    await connection.execute(
      `INSERT INTO t_trans_num_generator (prefix, suffix, \`${seqCol}\`, status)
       VALUES (?, ?, ?, 'committed')
       ON DUPLICATE KEY UPDATE \`${seqCol}\` = GREATEST(\`${seqCol}\`, ?), status = 'committed'`,
      [prefix, suffix, lastNumber, lastNumber]
    );
  } else {
    await connection.execute(
      `INSERT INTO t_trans_num_generator (prefix, suffix, \`${seqCol}\`)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE \`${seqCol}\` = GREATEST(\`${seqCol}\`, ?)`,
      [prefix, suffix, lastNumber, lastNumber]
    );
  }
}

async function loadCustomers(connection) {
  const [rows] = await connection.execute(
    `SELECT cust_code, name, pm_code
     FROM t_customers
     WHERE cust_code IS NOT NULL AND TRIM(cust_code) <> ''
     ORDER BY cust_code`
  );
  return rows;
}

async function loadItems(connection) {
  const [rows] = await connection.execute(
    `SELECT item_code, eng_name, chi_name, unit, price, price_special
     FROM t_items
     WHERE item_code IS NOT NULL AND TRIM(item_code) <> ''
     ORDER BY item_code`
  );
  return rows;
}

async function loadDefaultShop(connection) {
  const [rows] = await connection.execute(
    'SELECT shop_code FROM t_shop ORDER BY shop_code LIMIT 1'
  );
  return rows[0]?.shop_code ? String(rows[0].shop_code).trim() : null;
}

async function loadDefaultEmployee(connection) {
  try {
    const [rows] = await connection.execute(
      'SELECT employee_code FROM t_employees ORDER BY employee_code LIMIT 1'
    );
    return rows[0]?.employee_code ? String(rows[0].employee_code).trim() : null;
  } catch {
    return null;
  }
}

function linePrice(item) {
  const special = Number(item.price_special);
  if (Number.isFinite(special) && special > 0) return special;
  const price = Number(item.price);
  if (Number.isFinite(price) && price > 0) return price;
  return randInt(10, 500);
}

async function createTransaction(connection, options) {
  const {
    prefix,
    customer,
    shopCode,
    employeeCode,
    items,
    hMap,
    dMap,
    tMap,
    suffix,
    seqState,
  } = options;

  const lineCount = randInt(MIN_LINES, MAX_LINES);
  const pickedItems = pickUniqueItems(items, lineCount);
  const now = sqlNow();
  const transCode = await allocTransCode(connection, prefix, suffix, seqState);

  const lines = pickedItems.map((item) => {
    const qty = randInt(MIN_QTY, MAX_QTY);
    const price = linePrice(item);
    const discount = 0;
    const lineTotal = qty * price - discount;
    return {
      item,
      qty,
      price,
      discount,
      lineTotal,
    };
  });

  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const pmCode = customer.pm_code ? String(customer.pm_code).trim() : null;

  await connection.beginTransaction();
  try {
    const header = {
      trans_code: transCode,
      prefix,
      cust_code: customer.cust_code,
      shop_code: shopCode,
      total,
      employee_code: employeeCode,
      remark: `Generated by scripts/generate-transactions.js`,
      is_void: 0,
      is_convert: 0,
      is_settle: 0,
      create_date: now,
      modify_date: now,
    };

    if (hasCol(hMap, 'refer_code')) header.refer_code = null;
    if (hasCol(hMap, 'quotation_date')) header.quotation_date = now;
    if (hasCol(hMap, 'transaction_date')) header.transaction_date = now;
    if (hasCol(hMap, 'invoice_subtype') && prefix === 'INV') {
      header.invoice_subtype = 'standard';
    }

    const headerPick = {};
    for (const [key, value] of Object.entries(header)) {
      const col = hMap.get(key.toLowerCase());
      if (col) headerPick[col] = value;
    }

    const headerInsert = buildInsertSql('t_transaction_h', headerPick);
    await connection.execute(headerInsert.sql, headerInsert.params);

    for (const line of lines) {
      const detail = {
        trans_code: transCode,
        item_code: line.item.item_code,
        eng_name: line.item.eng_name || line.item.item_code,
        chi_name: line.item.chi_name || '',
        qty: line.qty,
        unit: line.item.unit || 'PCS',
        price: line.price,
        discount: line.discount,
        create_date: now,
        modify_date: now,
      };

      const detailPick = {};
      for (const [key, value] of Object.entries(detail)) {
        const col = dMap.get(key.toLowerCase());
        if (col) detailPick[col] = value;
      }

      const detailInsert = buildInsertSql('t_transaction_d', detailPick);
      await connection.execute(detailInsert.sql, detailInsert.params);
    }

    if (pmCode && tMap.size > 0) {
      const payment = {
        trans_code: transCode,
        pm_code: pmCode,
        total,
        create_date: now,
        modify_date: now,
      };
      const paymentPick = {};
      for (const [key, value] of Object.entries(payment)) {
        const col = tMap.get(key.toLowerCase());
        if (col) paymentPick[col] = value;
      }
      if (Object.keys(paymentPick).length > 1) {
        const paymentInsert = buildInsertSql('t_transaction_t', paymentPick);
        await connection.execute(paymentInsert.sql, paymentInsert.params);
      }
    }

    await connection.commit();
    return {
      transCode,
      custCode: customer.cust_code,
      lineCount: lines.length,
      total,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const count = args.count;
  const type = args.type;

  if (!Number.isFinite(count) || count < 1) {
    console.error('Error: --count is required and must be >= 1');
    printHelp();
    process.exit(1);
  }

  if (!type || !ALLOWED_TYPES.has(type)) {
    console.error('Error: --type is required and must be SO or INV');
    printHelp();
    process.exit(1);
  }

  let connection;
  try {
    const dbConfig = resolveDbConfig(loadJson('db-config.json'));
    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port || 3306,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
    });

    console.log('Connected to database:', dbConfig.database);
    console.log(`Generating ${count} ${type} transaction(s)...`);

    const [hMap, dMap, tMap] = await Promise.all([
      loadColumnMap(connection, 't_transaction_h'),
      loadColumnMap(connection, 't_transaction_d'),
      loadColumnMap(connection, 't_transaction_t'),
    ]);

    const customers = await loadCustomers(connection);
    const items = await loadItems(connection);
    const shopCode = await loadDefaultShop(connection);
    const employeeCode = await loadDefaultEmployee(connection);
    const suffix = getYymmSuffix();

    if (customers.length === 0) {
      throw new Error('No customers found in t_customers. Run scripts/seed-customers.js first.');
    }
    if (items.length === 0) {
      throw new Error('No items found in t_items. Run scripts/seed-items-categories.js first.');
    }
    if (!shopCode) {
      throw new Error('No shop found in t_shop. At least one shop is required.');
    }

    console.log(`Customers: ${customers.length}, Items: ${items.length}, Shop: ${shopCode}, Suffix: ${suffix}`);

    const initialMax = await maxSeqFromHeaders(connection, type, suffix);
    const seqState = { value: initialMax };

    const created = [];
    for (let i = 0; i < count; i++) {
      const customer = pickRandom(customers);
      const result = await createTransaction(connection, {
        prefix: type,
        customer,
        shopCode,
        employeeCode,
        items,
        hMap,
        dMap,
        tMap,
        suffix,
        seqState,
      });
      created.push(result);
      console.log(
        `  [${i + 1}/${count}] ${result.transCode} | customer ${result.custCode} | ${result.lineCount} line(s) | total ${result.total.toFixed(2)}`
      );
    }

    await syncGeneratorAfterBatch(connection, type, suffix, seqState.value);

    console.log(`\nDone. Created ${created.length} ${type} transaction(s).`);
  } catch (error) {
    console.error('Error:', error.message);
    if (error.code) console.error('Code:', error.code);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed.');
    }
  }
}

main();
