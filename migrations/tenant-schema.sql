-- Schema pentru fiecare tenant (companie)
-- Rulează această migrare pentru fiecare DB de companie nou creat

-- ================= USERS =================
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

-- ================= COMPANY SETTINGS =================
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

-- Inserare default
INSERT INTO company_settings (id, name, cui, address, city)
VALUES ('default', 'Companie Nouă', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- ================= ROUTES (TRASEE) =================
CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================= PRODUCT CATEGORIES =================
CREATE TABLE IF NOT EXISTS product_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================= CLIENTS =================
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  route_id TEXT REFERENCES routes(id),
  category TEXT, -- redundant, pentru compatibilitate
  cui TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  payment_terms INTEGER DEFAULT 0,
  prices JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_route ON clients(route_id);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(active);

-- ================= PRODUCTS =================
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gtin TEXT,
  gtins JSONB NOT NULL DEFAULT '[]'::jsonb,
  category_id TEXT REFERENCES product_categories(id),
  category TEXT, -- redundant, pentru compatibilitate
  price NUMERIC(12,2),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_gtin ON products (gtin) WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);

-- ================= STOCK =================
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

CREATE INDEX IF NOT EXISTS idx_stock_gtin ON stock(gtin);
CREATE INDEX IF NOT EXISTS idx_stock_warehouse ON stock(warehouse);

-- ================= STOCK TRANSFERS =================
CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  gtin TEXT NOT NULL,
  product_name TEXT NOT NULL,
  lot TEXT NOT NULL,
  expires_at DATE,
  qty INT NOT NULL,
  from_warehouse TEXT NOT NULL,
  to_warehouse TEXT NOT NULL,
  from_location TEXT,
  to_location TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================= ORDERS =================
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

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_sent ON orders(sent_to_smartbill) WHERE sent_to_smartbill = false;

-- ================= DRIVERS =================
CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================= VEHICLES =================
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  plate_number TEXT NOT NULL UNIQUE,
  model TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================= TRIP SHEETS =================
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

CREATE INDEX IF NOT EXISTS idx_trips_date ON trip_sheets(date DESC);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trip_sheets(driver_id);

-- ================= FUEL RECEIPTS =================
CREATE TABLE IF NOT EXISTS fuel_receipts (
  id TEXT PRIMARY KEY,
  trip_sheet_id TEXT NOT NULL REFERENCES trip_sheets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('diesel', 'adblue')),
  receipt_number TEXT NOT NULL,
  liters NUMERIC(8,2) NOT NULL,
  km_at_refuel INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fuel_sheet ON fuel_receipts(trip_sheet_id);

-- ================= AUDIT =================
CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  user_json JSONB,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit(created_at DESC);

-- ================= CLIENT BALANCES =================
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

CREATE INDEX IF NOT EXISTS idx_balances_client ON client_balances(client_id);
CREATE INDEX IF NOT EXISTS idx_balances_cui ON client_balances(cui);

-- Adaugă admin default (va fi updatat după ce se creează primul user)
-- Notă: Parola trebuie setată manual sau prin script separat
