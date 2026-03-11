// migrations/runner.js - Rulează migrări pe tenant DB
const fs = require('fs');
const path = require('path');
const tenantDb = require('../db-tenant');
const masterDb = require('../db-master');

const SCHEMA_FILE = path.join(__dirname, 'tenant-schema.sql');

// Creează baza de date fizică pentru tenant
async function createDatabase(dbName) {
  const { Pool } = require('pg');
  const masterUrl = process.env.MASTER_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!masterUrl) {
    throw new Error('DATABASE_URL lipsă');
  }

  // Parse URL pentru a extrage numele bazei master
  const match = masterUrl.match(/^(postgres:\/\/)([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
  if (!match) {
    throw new Error('DATABASE_URL invalid');
  }

  const [, protocol, user, pass, host, port] = match;
  const masterDbName = match[6]; // baza de date master (ex: openbill_master)
  
  // Conectare la postgres default pentru a putea crea DB nou
  const adminUrl = `${protocol}${user}:${pass}@${host}:${port}/postgres`;
  const pool = new Pool({
    connectionString: adminUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Verifică dacă DB există deja
    const checkResult = await pool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );

    if (checkResult.rows.length === 0) {
      // Creează DB nou
      await pool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ Database created: ${dbName}`);
    } else {
      console.log(`ℹ️ Database already exists: ${dbName}`);
    }
  } finally {
    await pool.end();
  }
}

// Rulează schema SQL pe un tenant
async function runMigrations(dbName) {
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  
  // Împarte SQL în statements individuale
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  const pool = tenantDb.getTenantPool(dbName);

  for (const statement of statements) {
    try {
      await pool.query(statement + ';');
    } catch (err) {
      // Ignore duplicate table errors (42P07)
      if (err.code === '42P07') {
        console.log(`  ℹ️ Table/index exists, skipping`);
      } else {
        console.error(`  ❌ Error: ${err.message}`);
        throw err;
      }
    }
  }

  console.log(`✅ Migrations completed for ${dbName}`);
}

// Creează adminul initial pentru o companie
async function createInitialAdmin(dbName, { username, email, passwordHash }) {
  const pool = tenantDb.getTenantPool(dbName);
  
  try {
    // Verifică dacă există deja useri
    const check = await pool.query('SELECT COUNT(*)::int as n FROM users');
    if (check.rows[0].n > 0) {
      console.log(`ℹ️ Users already exist in ${dbName}`);
      return;
    }

    // Creează admin
    await pool.query(`
      INSERT INTO users (username, email, password_hash, role, is_approved, email_verified)
      VALUES ($1, $2, $3, 'admin', true, true)
    `, [username, email, passwordHash]);

    console.log(`✅ Initial admin created in ${dbName}: ${username}`);
  } catch (err) {
    console.error(`❌ Error creating admin: ${err.message}`);
    throw err;
  }
}

// Rulează migrări pe toți tenants
async function runMigrationsForAllTenants() {
  const companies = await masterDb.listCompanies();
  
  console.log(`\n🔄 Running migrations for ${companies.length} companies...\n`);

  for (const company of companies) {
    console.log(`\n📦 Company: ${company.name} (${company.db_name})`);
    try {
      await runMigrations(company.db_name);
    } catch (err) {
      console.error(`❌ Failed for ${company.name}: ${err.message}`);
    }
  }
}

// Setup complet pentru companie nouă
async function setupNewCompany({ slug, name, cui, email, adminUsername, adminPassword }) {
  const bcrypt = require('bcrypt');
  
  // 1. Creează în master DB
  const company = await masterDb.createCompany({ slug, name, cui, email });
  
  // 2. Creează baza de date fizică
  await createDatabase(company.db_name);
  
  // 3. Rulează migrări
  await runMigrations(company.db_name);
  
  // 4. Creează admin initial
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await createInitialAdmin(company.db_name, {
    username: adminUsername,
    email: email,
    passwordHash: passwordHash
  });
  
  // 5. Update company_settings cu datele reale
  const pool = tenantDb.getTenantPool(company.db_name);
  await pool.query(`
    UPDATE company_settings 
    SET name = $1, cui = $2, email = $3
    WHERE id = 'default'
  `, [name, cui, email]);

  return company;
}

module.exports = {
  createDatabase,
  runMigrations,
  createInitialAdmin,
  runMigrationsForAllTenants,
  setupNewCompany
};
