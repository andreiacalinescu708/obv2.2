/**
 * Script pentru migrarea datelor existente din vechiul sistem
 * în noua structură multi-tenant
 * 
 * Acest script:
 * 1. Creează compania FMD în master DB
 * 2. Migrează datele din baza veche în noua bază tenant
 * 3. Transformă datele pentru noul schema
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const masterDb = require('./db-master');
const { runMigrations } = require('./migrations/runner');

// Configurare
const SOURCE_DB_URL = process.env.DATABASE_URL; // Baza veche
const TARGET_SLUG = 'fmd';
const TARGET_NAME = 'Fast Medical Distribution';
const TARGET_CUI = 'RO47095864';

async function migrate() {
  console.log('🚀 Starting migration...\n');

  // 1. Verifică conexiunea la master
  if (!masterDb.hasMasterDb()) {
    console.error('❌ Master DB not configured');
    process.exit(1);
  }

  // 2. Creează compania în master DB
  console.log('📦 Creating company in master DB...');
  let company;
  try {
    company = await masterDb.createCompany({
      slug: TARGET_SLUG,
      name: TARGET_NAME,
      cui: TARGET_CUI,
      email: 'admin@fmd.ro'
    });
    console.log(`✅ Company created: ${company.db_name}\n`);
  } catch (err) {
    if (err.message.includes('duplicate')) {
      console.log('ℹ️ Company already exists, fetching...');
      company = await masterDb.getCompanyBySlug(TARGET_SLUG);
    } else {
      throw err;
    }
  }

  // 3. Creează baza de date tenant și rulează migrări
  console.log('🏗️ Setting up tenant database...');
  await runMigrations(company.db_name);
  console.log('✅ Tenant DB ready\n');

  // 4. Conectare la baza sursă
  const sourcePool = new Pool({
    connectionString: SOURCE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  // 5. Conectare la baza destinație
  const targetPool = new Pool({
    connectionString: process.env.MASTER_DATABASE_URL.replace(/\/[^/]+$/, `/${company.db_name}`),
    ssl: { rejectUnauthorized: false }
  });

  try {
    // 6. Migrează users
    console.log('👤 Migrating users...');
    const usersResult = await sourcePool.query('SELECT * FROM users');
    for (const user of usersResult.rows) {
      try {
        await targetPool.query(`
          INSERT INTO users (id, username, password_hash, email, first_name, last_name, role, 
                           active, is_approved, failed_attempts, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO NOTHING
        `, [
          user.id, user.username, user.password_hash, user.email || `${user.username}@fmd.ro`,
          '', '', user.role, user.active, user.is_approved, user.failed_attempts || 0, user.created_at
        ]);
      } catch (err) {
        console.log(`  ⚠️ Skipped user ${user.username}: ${err.message}`);
      }
    }
    console.log(`✅ Migrated ${usersResult.rows.length} users\n`);

    // 7. Migrează settings (din company_settings vechi sau orders->company)
    console.log('⚙️ Setting company settings...');
    await targetPool.query(`
      UPDATE company_settings 
      SET name = $1, cui = $2
      WHERE id = 'default'
    `, [TARGET_NAME, TARGET_CUI]);
    console.log('✅ Settings updated\n');

    // 8. Migrează trasee (din category din clients.json vechi sau crează default)
    console.log('🚌 Migrating routes...');
    // Verifică dacă există grupuri/categorii în clients vechi
    const clientsResult = await sourcePool.query('SELECT DISTINCT group_name, category FROM clients');
    const routes = new Set();
    clientsResult.rows.forEach(c => {
      if (c.group_name) routes.add(c.group_name);
      if (c.category) routes.add(c.category);
    });
    
    let routeId = 1;
    const routeMap = {}; // old -> new ID
    for (const routeName of routes) {
      const newId = `route_${routeId++}`;
      routeMap[routeName] = newId;
      await targetPool.query(`
        INSERT INTO routes (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [newId, routeName]);
    }
    console.log(`✅ Created ${routes.size} routes\n`);

    // 9. Migrează clients
    console.log('👥 Migrating clients...');
    const allClients = await sourcePool.query('SELECT * FROM clients');
    for (const client of allClients.rows) {
      try {
        const routeId = routeMap[client.group_name] || routeMap[client.category] || null;
        await targetPool.query(`
          INSERT INTO clients (id, name, route_id, category, cui, prices, active, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            route_id = EXCLUDED.route_id,
            prices = EXCLUDED.prices
        `, [
          client.id, client.name, routeId, client.category || client.group_name,
          client.cui, JSON.stringify(client.prices || {}), 
          client.active !== false, client.created_at || new Date()
        ]);
      } catch (err) {
        console.log(`  ⚠️ Skipped client ${client.name}: ${err.message}`);
      }
    }
    console.log(`✅ Migrated ${allClients.rows.length} clients\n`);

    // 10. Migrează product categories
    console.log('📁 Migrating product categories...');
    const categoriesResult = await sourcePool.query('SELECT DISTINCT category FROM products');
    const catMap = {};
    let catId = 1;
    for (const cat of categoriesResult.rows) {
      if (!cat.category) continue;
      const newId = `cat_${catId++}`;
      catMap[cat.category] = newId;
      await targetPool.query(`
        INSERT INTO product_categories (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [newId, cat.category]);
    }
    console.log(`✅ Created ${Object.keys(catMap).length} categories\n`);

    // 11. Migrează products
    console.log('📦 Migrating products...');
    const productsResult = await sourcePool.query('SELECT * FROM products');
    for (const prod of productsResult.rows) {
      try {
        const catId = catMap[prod.category] || null;
        await targetPool.query(`
          INSERT INTO products (id, name, gtin, gtins, category_id, category, price, active, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            gtin = EXCLUDED.gtin,
            gtins = EXCLUDED.gtins,
            price = EXCLUDED.price
        `, [
          prod.id, prod.name, prod.gtin, JSON.stringify(prod.gtins || []),
          catId, prod.category, prod.price, prod.active !== false,
          prod.created_at || new Date()
        ]);
      } catch (err) {
        console.log(`  ⚠️ Skipped product ${prod.name}: ${err.message}`);
      }
    }
    console.log(`✅ Migrated ${productsResult.rows.length} products\n`);

    // 12. Migrează stock
    console.log('📦 Migrating stock...');
    const stockResult = await sourcePool.query('SELECT * FROM stock');
    for (const item of stockResult.rows) {
      try {
        await targetPool.query(`
          INSERT INTO stock (id, gtin, product_name, lot, expires_at, qty, location, warehouse, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            qty = EXCLUDED.qty,
            location = EXCLUDED.location
        `, [
          item.id, item.gtin, item.product_name || item.productName, item.lot,
          item.expires_at || item.expiresAt, item.qty,
          item.location || 'A', item.warehouse || 'depozit',
          item.created_at || item.createdAt || new Date()
        ]);
      } catch (err) {
        console.log(`  ⚠️ Skipped stock item: ${err.message}`);
      }
    }
    console.log(`✅ Migrated ${stockResult.rows.length} stock items\n`);

    // 13. Migrează orders
    console.log('📋 Migrating orders...');
    const ordersResult = await sourcePool.query('SELECT * FROM orders');
    for (const order of ordersResult.rows) {
      try {
        await targetPool.query(`
          INSERT INTO orders (id, client, items, status, sent_to_smartbill, 
                            smartbill_series, smartbill_number, due_date, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
        `, [
          order.id, JSON.stringify(order.client), JSON.stringify(order.items),
          order.status || 'in_procesare', order.sent_to_smartbill || false,
          order.smartbill_series, order.smartbill_number,
          order.due_date, order.created_at || order.createdAt || new Date()
        ]);
      } catch (err) {
        console.log(`  ⚠️ Skipped order ${order.id}: ${err.message}`);
      }
    }
    console.log(`✅ Migrated ${ordersResult.rows.length} orders\n`);

    // 14. Migrează drivers și vehicles
    console.log('🚗 Migrating drivers and vehicles...');
    try {
      const driversResult = await sourcePool.query('SELECT * FROM drivers');
      for (const d of driversResult.rows) {
        await targetPool.query(`
          INSERT INTO drivers (id, name, active, created_at)
          VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
        `, [d.id, d.name, d.active !== false, d.created_at || new Date()]);
      }
      console.log(`✅ Migrated ${driversResult.rows.length} drivers`);
    } catch {
      console.log('ℹ️ No drivers table or empty');
    }

    try {
      const vehiclesResult = await sourcePool.query('SELECT * FROM vehicles');
      for (const v of vehiclesResult.rows) {
        await targetPool.query(`
          INSERT INTO vehicles (id, plate_number, active, created_at)
          VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
        `, [v.id, v.plate_number, v.active !== false, v.created_at || new Date()]);
      }
      console.log(`✅ Migrated ${vehiclesResult.rows.length} vehicles`);
    } catch {
      console.log('ℹ️ No vehicles table or empty');
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log(`\nCompany URL: https://${TARGET_SLUG}.${process.env.MAIN_DOMAIN || 'openbill.ro'}`);
    console.log(`Database: ${company.db_name}`);

  } catch (err) {
    console.error('\n❌ Migration failed:', err);
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

// Run if called directly
if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { migrate };
