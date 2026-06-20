/**
 * Seed script: import categories and items dummy data into the database.
 * Run from project root: node scripts/seed-items-categories.js
 *
 * Requires: src/data/db-config.json, src/data/categories-dummy.json, src/data/items-dummy.json
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

async function seed() {
  let connection;

  try {
    const dbConfig = resolveDbConfig(loadJson('db-config.json'));
    const categories = loadJson('categories-dummy.json');
    const items = loadJson('items-dummy.json');

    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port || 3306,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
    });

    console.log('Connected to database:', dbConfig.database);

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 1. Seed categories (skip if cate_code exists)
    console.log('\n--- Categories ---');
    let categoriesInserted = 0;
    let categoriesSkipped = 0;

    for (const row of categories) {
      const { cate_code, desc } = row;
      if (!cate_code || !desc) continue;

      const [existing] = await connection.execute(
        'SELECT 1 FROM t_items_category WHERE cate_code = ? LIMIT 1',
        [cate_code.trim()]
      );

      if (existing.length > 0) {
        console.log('  Skip (exists):', cate_code);
        categoriesSkipped++;
        continue;
      }

      await connection.execute(
        'INSERT INTO t_items_category (cate_code, `desc`, create_date, modify_date) VALUES (?, ?, ?, ?)',
        [cate_code.trim(), String(desc).trim(), now, now]
      );
      console.log('  Inserted:', cate_code, '-', desc);
      categoriesInserted++;
    }

    console.log('Categories: %d inserted, %d skipped', categoriesInserted, categoriesSkipped);

    // Get first shop_code for warehouse records (t_warehouse may require shop_code)
    let defaultShopCode = null;
    try {
      const [shopRows] = await connection.execute(
        'SELECT shop_code FROM t_shop ORDER BY shop_code LIMIT 1'
      );
      if (shopRows.length > 0) defaultShopCode = shopRows[0].shop_code;
    } catch (_) {}
    if (defaultShopCode) console.log('\nUsing shop_code for warehouse:', defaultShopCode);
    else console.log('\nNo shop in t_shop; warehouse inserts may fail if shop_code is required.');

    // 2. Seed items (skip if item_code exists)
    console.log('\n--- Items ---');
    let itemsInserted = 0;
    let itemsSkipped = 0;

    for (const row of items) {
      const {
        item_code,
        eng_name,
        chi_name,
        desc,
        price,
        price_special,
        cate_code,
        unit,
      } = row;

      if (!item_code || !eng_name || !chi_name) {
        console.log('  Skip (missing required):', item_code || '(no code)');
        continue;
      }

      const [existing] = await connection.execute(
        'SELECT 1 FROM t_items WHERE item_code = ? LIMIT 1',
        [item_code.trim()]
      );

      if (existing.length > 0) {
        console.log('  Skip (exists):', item_code);
        itemsSkipped++;
        continue;
      }

      await connection.execute(
        `INSERT INTO t_items (
          item_code, eng_name, chi_name, \`desc\`, price, price_special,
          cate_code, type, unit, image_body, create_date, modify_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
        [
          item_code.trim(),
          String(eng_name).trim(),
          String(chi_name).trim(),
          desc != null ? String(desc).trim() : null,
          price != null ? Number(price) : null,
          price_special != null ? Number(price_special) : null,
          cate_code != null ? String(cate_code).trim() : null,
          1, // type
          unit != null ? String(unit).trim() : null,
        ]
      );

      // Create warehouse record for the new item (include shop_code if we have one)
      try {
        if (defaultShopCode) {
          await connection.execute(
            'INSERT INTO t_warehouse (item_code, qty, type, shop_code, create_date, modify_date) VALUES (?, 0, ?, ?, NOW(), NOW())',
            [item_code.trim(), 'in', defaultShopCode]
          );
        } else {
          await connection.execute(
            'INSERT INTO t_warehouse (item_code, qty, type, create_date, modify_date) VALUES (?, 0, ?, NOW(), NOW())',
            [item_code.trim(), 'in']
          );
        }
      } catch (err) {
        console.warn('  Warning: warehouse insert failed for', item_code, err.message);
      }

      console.log('  Inserted:', item_code, '-', eng_name);
      itemsInserted++;
    }

    console.log('Items: %d inserted, %d skipped', itemsInserted, itemsSkipped);

    // 3. Backfill warehouse rows for items that have none (e.g. from a previous run without shop_code)
    if (defaultShopCode) {
      const [missing] = await connection.execute(
        `SELECT i.item_code FROM t_items i
         LEFT JOIN t_warehouse w ON w.item_code = i.item_code
         WHERE w.item_code IS NULL`
      );
      if (missing.length > 0) {
        console.log('\n--- Warehouse backfill ---');
        for (const row of missing) {
          await connection.execute(
            'INSERT INTO t_warehouse (item_code, qty, type, shop_code, create_date, modify_date) VALUES (?, 0, ?, ?, NOW(), NOW())',
            [row.item_code, 'in', defaultShopCode]
          );
          console.log('  Warehouse row added:', row.item_code);
        }
        console.log('Backfill: %d warehouse rows added', missing.length);
      }
    }

    console.log('\nDone.');
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
