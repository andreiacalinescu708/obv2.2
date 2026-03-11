// db-tenant.js - Conexiuni dinamice la DB-urile companiilor
const { Pool } = require("pg");

// Cache pentru pool-uri per companie
const tenantPools = new Map();

// Parsează URL-ul master și construiește URL pentru tenant
function buildTenantDbUrl(dbName) {
  const masterUrl = process.env.MASTER_DATABASE_URL || process.env.DATABASE_URL;
  if (!masterUrl) return null;

  // Extrage componentele din URL-ul master
  // Format: postgres://user:pass@host:port/database
  const match = masterUrl.match(/^(postgres(?:ql)?:\/\/)([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
  if (!match) return null;

  const [, protocol, user, pass, host, port] = match;
  return `${protocol}${user}:${pass}@${host}:${port}/${dbName}`;
}

// Obține sau creează pool pentru un tenant
function getTenantPool(dbName, schemaName = null) {
  const cacheKey = schemaName ? `${dbName}:${schemaName}` : dbName;
  
  if (tenantPools.has(cacheKey)) {
    return tenantPools.get(cacheKey);
  }

  const connectionString = buildTenantDbUrl(dbName);
  if (!connectionString) {
    throw new Error(`Nu pot construi connection string pentru ${dbName}`);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  // Setează search_path pentru toate conexiunile noi
  if (schemaName) {
    pool.on('connect', (client) => {
      client.query(`SET search_path TO ${schemaName}, public`);
    });
  }

  tenantPools.set(cacheKey, pool);
  return pool;
}

// Query pe tenant DB
async function q(dbName, text, params, schemaName = null) {
  const pool = getTenantPool(dbName, schemaName);
  return pool.query(text, params);
}

// Verifică dacă există conexiune la tenant
function hasTenantDb(dbName) {
  try {
    getTenantPool(dbName);
    return true;
  } catch {
    return false;
  }
}

// Închide toate conexiunile (pentru graceful shutdown)
async function closeAllTenants() {
  for (const [name, pool] of tenantPools) {
    await pool.end();
    console.log(`Closed pool for ${name}`);
  }
  tenantPools.clear();
}

module.exports = {
  getTenantPool,
  q,
  hasTenantDb,
  closeAllTenants,
  buildTenantDbUrl
};
