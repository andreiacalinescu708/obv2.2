require('dotenv').config();
const {Pool} = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.MASTER_DATABASE_URL,
  ssl: {rejectUnauthorized: false}
});

const schema = `
-- USERS
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  function TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  email_verification_code TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  unlock_at TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- COMPANY SETTINGS
CREATE TABLE IF NOT EXISTS company_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  name TEXT NOT NULL,
  cui TEXT,
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'Romania',
  phone TEXT,
  email TEXT,
  smartbill_token TEXT,
  smartbill_series TEXT DEFAULT 'FMD',
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO company_settings (id, name, cui) VALUES ('default', 'Fast Medical Distribution', 'RO47095864') ON CONFLICT DO NOTHING;

-- ROUTES
CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PRODUCT CATEGORIES
CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CLIENTS
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  route_id TEXT REFERENCES routes(id),
  category TEXT,
  cui TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  payment_terms INTEGER DEFAULT 0,
  prices JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gtin TEXT,
  gtins JSONB NOT NULL DEFAULT '[]'::jsonb,
  category_id TEXT REFERENCES product_categories(id),
  category TEXT,
  price NUMERIC(12,2),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_gtin ON products (gtin) WHERE gtin IS NOT NULL;

-- STOCK
CREATE TABLE IF NOT EXISTS stock (
  id TEXT PRIMARY KEY,
  gtin TEXT NOT NULL,
  product_name TEXT NOT NULL,
  lot TEXT NOT NULL,
  expires_at DATE,
  qty INT NOT NULL DEFAULT 0,
  location TEXT NOT NULL DEFAULT 'A',
  warehouse TEXT NOT NULL DEFAULT 'depozit',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  client JSONB NOT NULL,
  items JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_procesare',
  sent_to_smartbill BOOLEAN NOT NULL DEFAULT false,
  smartbill_draft_sent BOOLEAN NOT NULL DEFAULT false,
  smartbill_error TEXT,
  smartbill_response JSONB,
  smartbill_series TEXT,
  smartbill_number TEXT,
  due_date DATE,
  payment_terms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DRIVERS
CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VEHICLES
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  plate_number TEXT NOT NULL UNIQUE,
  model TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TRIP SHEETS
CREATE TABLE IF NOT EXISTS trip_sheets (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  driver_id TEXT NOT NULL REFERENCES drivers(id),
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  km_start INTEGER NOT NULL,
  km_end INTEGER,
  locations TEXT NOT NULL DEFAULT '',
  trip_number VARCHAR(20) UNIQUE,
  departure_time TIME,
  arrival_time TIME,
  purpose TEXT,
  tech_check_departure BOOLEAN DEFAULT false,
  tech_check_arrival BOOLEAN DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FUEL RECEIPTS
CREATE TABLE IF NOT EXISTS fuel_receipts (
  id TEXT PRIMARY KEY,
  trip_sheet_id TEXT NOT NULL REFERENCES trip_sheets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('diesel', 'adblue')),
  receipt_number TEXT NOT NULL,
  liters NUMERIC(8,2) NOT NULL,
  km_at_refuel INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AUDIT
CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  user_json JSONB,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CLIENT BALANCES
CREATE TABLE IF NOT EXISTS client_balances (
  id SERIAL PRIMARY KEY,
  client_id TEXT REFERENCES clients(id),
  cui TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  currency TEXT,
  total_value NUMERIC(12,2),
  balance_due NUMERIC(12,2),
  days_overdue INTEGER,
  status TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

async function setup() {
  try {
    console.log('Creating tables...');
    await pool.query(schema);
    console.log('✅ Tables created');
    
    // Create admin user
    const check = await pool.query('SELECT COUNT(*)::int as n FROM users');
    if (check.rows[0].n === 0) {
      const passwordHash = await bcrypt.hash('admin', 10);
      await pool.query(`
        INSERT INTO users (username, email, password_hash, role, is_approved, email_verified)
        VALUES ('admin', 'admin@fmd.ro', $1, 'admin', true, true)
      `, [passwordHash]);
      console.log('✅ Admin user created: admin / admin');
    } else {
      console.log('ℹ️ Users already exist');
    }
    
    console.log('\n🎉 FMD setup complete!');
    console.log('Login: admin / admin');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    pool.end();
  }
}

setup();
