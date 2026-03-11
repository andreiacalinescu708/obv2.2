// db-master.js - Conexiune la Master Database (tracking companii + superadmin)
const { Pool } = require("pg");
const crypto = require("crypto");

let masterPool = null;

function getMasterPool() {
  if (!masterPool) {
    const MASTER_DB_URL = process.env.MASTER_DATABASE_URL || process.env.DATABASE_URL;
    if (MASTER_DB_URL) {
      masterPool = new Pool({
        connectionString: MASTER_DB_URL,
        ssl: { rejectUnauthorized: false }
      });
    }
  }
  return masterPool;
}

function hasMasterDb() {
  return !!getMasterPool();
}

async function q(text, params) {
  const pool = getMasterPool();
  if (!pool) throw new Error("MASTER_DATABASE_URL lipsă.");
  return pool.query(text, params);
}

// Inițializare tabele master
async function ensureMasterTables() {
  if (!getMasterPool()) return;

  // Tabel companii
  await q(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      db_name TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      cui TEXT,
      email TEXT NOT NULL,
      address TEXT,
      city TEXT,
      country TEXT DEFAULT 'Romania',
      phone TEXT,
      smartbill_token TEXT,
      smartbill_series TEXT DEFAULT 'FMD',
      status TEXT NOT NULL DEFAULT 'trial',
      trial_expires_at TIMESTAMPTZ NOT NULL,
      plan TEXT NOT NULL DEFAULT 'starter',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      is_active BOOLEAN NOT NULL DEFAULT true
    )
  `);

  // Index pentru slug (căutare rapidă la login)
  await q(`CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status)`);

  // Tabel superadmin users
  await q(`
    CREATE TABLE IF NOT EXISTS superadmins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Tabel invitații
  await q(`
    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by TEXT NOT NULL
    )
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_invitations_company ON invitations(company_id)`);

  console.log("✅ Master DB tables ready");
}

// Creare superadmin default (alex1)
async function ensureDefaultSuperAdmin() {
  if (!masterPool) return;

  const r = await q("SELECT COUNT(*)::int AS n FROM superadmins");
  if (r.rows[0].n > 0) return;

  const bcrypt = require("bcrypt");
  const username = process.env.SUPERADMIN_USER || "alex1";
  const password = process.env.SUPERADMIN_PASS || "admin123";
  const email = process.env.SUPERADMIN_EMAIL || "alex1@openbill.ro";

  const hash = await bcrypt.hash(password, 10);
  await q(
    "INSERT INTO superadmins (username, password_hash, email) VALUES ($1, $2, $3)",
    [username, hash, email]
  );

  console.log(`✅ Superadmin creat: ${username}`);
}

// Utilitare companii
async function getCompanyBySlug(slug) {
  const r = await q(`SELECT * FROM companies WHERE slug = $1`, [slug]);
  return r.rows[0] || null;
}

async function getCompanyById(id) {
  const r = await q(`SELECT * FROM companies WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

async function createCompany({ slug, name, cui, email }) {
  const id = crypto.randomUUID();
  const dbName = `openbill_${slug}`;
  const trialExpires = new Date();
  trialExpires.setDate(trialExpires.getDate() + 30);

  const r = await q(`
    INSERT INTO companies (id, slug, db_name, name, cui, email, trial_expires_at, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'trial')
    RETURNING *
  `, [id, slug, dbName, name, cui, email, trialExpires]);

  return r.rows[0];
}

async function listCompanies(filters = {}) {
  let sql = `SELECT * FROM companies ORDER BY created_at DESC`;
  
  if (filters.status) {
    sql = `SELECT * FROM companies WHERE status = $1 ORDER BY created_at DESC`;
    const r = await q(sql, [filters.status]);
    return r.rows;
  }

  const r = await q(sql);
  return r.rows;
}

async function updateCompanyStatus(id, status) {
  const r = await q(`
    UPDATE companies SET status = $1, updated_at = now() WHERE id = $2 RETURNING *
  `, [status, id]);
  return r.rows[0];
}

async function deleteCompany(id) {
  await q(`DELETE FROM companies WHERE id = $1`, [id]);
}

// Invitații
async function createInvitation({ companyId, email, role, createdBy }) {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await q(`
    INSERT INTO invitations (id, company_id, email, token, role, expires_at, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [id, companyId, email, token, role, expiresAt, createdBy]);

  return { id, token, expiresAt };
}

async function getInvitationByToken(token) {
  const r = await q(`
    SELECT i.*, c.slug as company_slug, c.name as company_name, c.db_name
    FROM invitations i
    JOIN companies c ON i.company_id = c.id
    WHERE i.token = $1 AND i.used_at IS NULL AND i.expires_at > now()
  `, [token]);
  return r.rows[0] || null;
}

async function markInvitationUsed(id) {
  await q(`UPDATE invitations SET used_at = now() WHERE id = $1`, [id]);
}

module.exports = {
  q,
  hasMasterDb,
  ensureMasterTables,
  ensureDefaultSuperAdmin,
  getCompanyBySlug,
  getCompanyById,
  createCompany,
  listCompanies,
  updateCompanyStatus,
  deleteCompany,
  createInvitation,
  getInvitationByToken,
  markInvitationUsed
};
