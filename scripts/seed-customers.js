/**
 * Seed script: import customers dummy data into the database.
 * Run from project root: node scripts/seed-customers.js
 *
 * Requires: src/data/db-config.json, src/data/customers-dummy.json
 *
 * cust_code in JSON must start with "C" followed by 6 digits (e.g. C100001).
 */

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const { resolveDbConfig } = require('./lib/resolve-db-config');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function loadJson(filename) {
  const filepath = path.join(PROJECT_ROOT, 'src', 'data', filename);
  const raw = fs.readFileSync(filepath, 'utf8');
  return JSON.parse(raw);
}

function toSql(val) {
  if (val === null || val === undefined || val === '') return null;
  return String(val).trim();
}

async function seed() {
  let connection;

  try {
    const dbConfig = resolveDbConfig(loadJson('db-config.json'));
    const customers = loadJson('customers-dummy.json');

    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port || 3306,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
    });

    console.log('Connected to database:', dbConfig.database);

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    console.log('\n--- Customers ---');
    let inserted = 0;
    let skipped = 0;

    for (const row of customers) {
      const cust_code = row.cust_code ? String(row.cust_code).trim() : '';
      if (!cust_code || !/^C[0-9]{6}$/.test(cust_code)) {
        console.log('  Skip (invalid cust_code):', row.cust_code || '(missing)');
        continue;
      }
      if (!row.name || !row.phone_1) {
        console.log('  Skip (missing name or phone_1):', cust_code);
        continue;
      }

      const [existing] = await connection.execute(
        'SELECT 1 FROM t_customers WHERE cust_code = ? LIMIT 1',
        [cust_code]
      );

      if (existing.length > 0) {
        console.log('  Skip (exists):', cust_code);
        skipped++;
        continue;
      }

      const name = toSql(row.name) || null;
      const attn_1 = toSql(row.attn_1);
      const attn_2 = toSql(row.attn_2);
      const delivery_addr = toSql(row.delivery_addr);
      const phone_1 = toSql(row.phone_1) || null;
      const phone_2 = toSql(row.phone_2);
      const fax_1 = toSql(row.fax_1);
      const fax_2 = toSql(row.fax_2);
      const email_1 = toSql(row.email_1);
      const email_2 = toSql(row.email_2);
      const pm_code = toSql(row.pm_code);
      const pt_code = toSql(row.pt_code);
      // status: ENUM('Active', 'Closed') only
      const rawStatus = (toSql(row.status) || 'Active').toLowerCase();
      const status = rawStatus === 'closed' ? 'Closed' : 'Active';
      const district_code = toSql(row.district_code);
      const from_time = toSql(row.from_time);
      const to_time = toSql(row.to_time);
      const delivery_remark = toSql(row.delivery_remark);
      const remark = toSql(row.remark);
      const statement_remark = toSql(row.statement_remark);

      await connection.execute(
        `INSERT INTO t_customers (
          cust_code, name, attn_1, attn_2, delivery_addr,
          phone_1, phone_2, fax_1, fax_2, email_1, email_2,
          pm_code, pt_code, status, district_code,
          from_time, to_time, delivery_remark, remark, statement_remark,
          create_date, modify_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cust_code,
          name,
          attn_1,
          attn_2,
          delivery_addr,
          phone_1,
          phone_2,
          fax_1,
          fax_2,
          email_1,
          email_2,
          pm_code,
          pt_code,
          status,
          district_code,
          from_time,
          to_time,
          delivery_remark,
          remark,
          statement_remark,
          now,
          now,
        ]
      );
      console.log('  Inserted:', cust_code, '-', name);
      inserted++;
    }

    console.log('\nCustomers: %d inserted, %d skipped', inserted, skipped);
    console.log('Done.');
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

seed();
