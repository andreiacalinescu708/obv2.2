require('dotenv').config();
const session = require("express-session");
const bcrypt = require("bcrypt");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Import module noi
const masterDb = require("./db-master");
const tenantDb = require("./db-tenant");
const { tenantMiddleware } = require("./middleware/tenant");
const { sendEmail } = require("./services/email");

// Import routes
const superadminRoutes = require("./routes/superadmin");
const publicRoutes = require("./routes/public");
const invitationRoutes = require("./routes/invitations");
const settingsRoutes = require("./routes/settings");
const setupRoutes = require("./routes/setup");
const universalLoginRoutes = require("./routes/universal-login");

const app = express();

// ===== CONFIGURAȚIE SMARTBILL (va fi în settings per companie) =====
const SMARTBILL_BASE_URL = 'https://ws.smartbill.ro/SBORO/api';

// Middleware pentru parse JSON
app.use(express.json());
app.use(express.static("public"));

// Configurare sesiune
app.set("trust proxy", 1);

const isProduction = process.env.NODE_ENV === 'production';
const mainDomain = process.env.MAIN_DOMAIN || 'openbill.ro';

app.use(session({
  name: "openbill.sid",
  secret: process.env.SESSION_SECRET || "schimba-asta-cu-o-cheie-lunga-si-puternica",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction, // true în producție (HTTPS), false local
    domain: isProduction ? `.${mainDomain}` : undefined, // wildcard subdomenii în producție
    maxAge: 24 * 60 * 60 * 1000 // 24 ore
  }
}));

// ===== ROUTES PUBLICE (fără tenant) - ÎNAINTE de middleware tenant =====
app.use("/api/setup", setupRoutes);
app.use("/api/superadmin", superadminRoutes);
app.use("/api/login", universalLoginRoutes); // Login universal
app.use("/api/public", publicRoutes);

// Middleware tenant - detectează compania după subdomeniu
// Rulează după rutele publice pentru a nu bloca endpoint-urile publice
app.use(tenantMiddleware);

// ===== ROUTES CARE NECESITĂ TENANT =====

// Helper pentru query pe tenant
function tq(req) {
  if (!req.tenant) {
    throw new Error("Tenant nu este setat");
  }
  return (sql, params) => tenantDb.q(req.tenant.dbName, sql, params, req.tenant.slug);
}

// ===== AUTH PENTRU TENANT =====

// Verificare sesiune
app.get("/api/me", async (req, res) => {
  if (!req.session?.user) return res.json({ loggedIn: false });
  
  // Dacă e superadmin, returnează direct
  if (req.session.user.role === 'superadmin') {
    return res.json({ 
      loggedIn: true, 
      user: req.session.user,
      isSuperAdmin: true
    });
  }
  
  // Pentru useri normali, returnează info despre companie
  const company = await masterDb.getCompanyBySlug(req.session.user.companySlug);
  
  res.json({ 
    loggedIn: true, 
    user: req.session.user,
    company: company ? { name: company.name, slug: company.slug } : null
  });
});

// Login universal - vezi /api/login din routes/universal-login.js

// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ===== MIDDLEWARE PENTRU VERIFICARE AUTH =====
function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Neautentificat" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.session?.user?.role !== 'admin') {
    return res.status(403).json({ error: "Acces interzis. Doar admin." });
  }
  next();
}

// ===== INVITAȚII =====
app.use("/api/invitations", requireAuth, invitationRoutes);

// ===== SETTINGS =====
app.use("/api/settings", requireAuth, settingsRoutes);

// ===== CLIENTS =====

// Listă clienți
app.get("/api/clients", requireAuth, async (req, res) => {
  try {
    const r = await tq(req)(`
      SELECT c.*, r.name as route_name
      FROM clients c
      LEFT JOIN routes r ON c.route_id = r.id
      WHERE c.active = true
      ORDER BY r.sort_order, r.name, c.name
    `);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Eroare la citire clienți" });
  }
});

// Clienți fără traseu
app.get("/api/clients/unassigned", requireAuth, async (req, res) => {
  try {
    const r = await tq(req)(`
      SELECT * FROM clients 
      WHERE route_id IS NULL AND active = true
      ORDER BY name
    `);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Eroare" });
  }
});

// Detalii client
app.get("/api/clients/:id", requireAuth, async (req, res) => {
  try {
    const r = await tq(req)(`
      SELECT c.*, r.name as route_name
      FROM clients c
      LEFT JOIN routes r ON c.route_id = r.id
      WHERE c.id = $1
    `, [req.params.id]);

    if (!r.rows.length) return res.status(404).json({ error: "Client inexistent" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Eroare server" });
  }
});

// Creare client
app.post("/api/clients", requireAuth, async (req, res) => {
  try {
    const { name, route_id, cui, address, phone, email, payment_terms } = req.body;
    
    if (!name) return res.status(400).json({ error: "Numele este obligatoriu" });

    const id = crypto.randomUUID();
    await tq(req)(`
      INSERT INTO clients (id, name, route_id, cui, address, phone, email, payment_terms)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, name, route_id || null, cui, address, phone, email, payment_terms || 0]);

    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ error: "Eroare la creare client" });
  }
});

// Update client
app.put("/api/clients/:id", requireAuth, async (req, res) => {
  try {
    const { name, route_id, cui, address, phone, email, payment_terms, prices } = req.body;
    
    await tq(req)(`
      UPDATE clients 
      SET name = $1, route_id = $2, cui = $3, address = $4, 
          phone = $5, email = $6, payment_terms = $7, prices = $8::jsonb
      WHERE id = $9
    `, [name, route_id || null, cui, address, phone, email, payment_terms, 
        JSON.stringify(prices || {}), req.params.id]);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Eroare la actualizare" });
  }
});

// Ștergere client (soft)
app.delete("/api/clients/:id", requireAuth, async (req, res) => {
  try {
    await tq(req)(`UPDATE clients SET active = false WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Eroare la ștergere" });
  }
});

// ===== PRODUSE =====

app.get("/api/products", requireAuth, async (req, res) => {
  try {
    const r = await tq(req)(`
      SELECT p.*, pc.name as category_name
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.active = true
      ORDER BY pc.sort_order, pc.name, p.name
    `);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Eroare" });
  }
});

app.post("/api/products", requireAuth, async (req, res) => {
  try {
    const { name, gtin, category_id, price } = req.body;
    
    if (!name) return res.status(400).json({ error: "Numele este obligatoriu" });

    const id = crypto.randomUUID();
    await tq(req)(`
      INSERT INTO products (id, name, gtin, category_id, price)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, name, gtin, category_id || null, price]);

    res.json({ success: true, id });
  } catch (e) {
    if (e.message.includes('duplicate')) {
      return res.status(400).json({ error: "GTIN deja existent" });
    }
    res.status(500).json({ error: "Eroare la creare" });
  }
});

app.put("/api/products/:id", requireAuth, async (req, res) => {
  try {
    const { name, gtin, category_id, price } = req.body;
    await tq(req)(`
      UPDATE products SET name = $1, gtin = $2, category_id = $3, price = $4
      WHERE id = $5
    `, [name, gtin, category_id || null, price, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Eroare" });
  }
});

app.delete("/api/products/:id", requireAuth, async (req, res) => {
  try {
    await tq(req)(`UPDATE products SET active = false WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Eroare" });
  }
});

// ===== STOCK =====

app.get("/api/stock", requireAuth, async (req, res) => {
  try {
    const { warehouse = 'depozit' } = req.query;
    const r = await tq(req)(`
      SELECT * FROM stock WHERE warehouse = $1 ORDER BY created_at DESC
    `, [warehouse]);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Eroare" });
  }
});

app.post("/api/stock", requireAuth, async (req, res) => {
  try {
    const { gtin, product_name, lot, expires_at, qty, location, warehouse = 'depozit' } = req.body;
    
    const id = crypto.randomUUID();
    await tq(req)(`
      INSERT INTO stock (id, gtin, product_name, lot, expires_at, qty, location, warehouse)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, gtin, product_name, lot, expires_at, qty, location || 'A', warehouse]);

    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ error: "Eroare" });
  }
});

// ===== ORDERS =====

app.get("/api/orders", requireAuth, async (req, res) => {
  try {
    const r = await tq(req)(`
      SELECT * FROM orders ORDER BY created_at DESC
    `);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Eroare" });
  }
});

// ===== DRIVERS =====

app.get("/api/drivers", requireAuth, async (req, res) => {
  try {
    const r = await tq(req)(`SELECT * FROM drivers WHERE active = true ORDER BY name`);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Eroare" });
  }
});

app.post("/api/drivers", requireAdmin, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const id = crypto.randomUUID();
    await tq(req)(`INSERT INTO drivers (id, name, phone) VALUES ($1, $2, $3)`, [id, name, phone]);
    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ error: "Eroare" });
  }
});

// ===== VEHICLES =====

app.get("/api/vehicles", requireAuth, async (req, res) => {
  try {
    const r = await tq(req)(`SELECT * FROM vehicles WHERE active = true ORDER BY plate_number`);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Eroare" });
  }
});

app.post("/api/vehicles", requireAdmin, async (req, res) => {
  try {
    const { plate_number, model } = req.body;
    const id = crypto.randomUUID();
    await tq(req)(`INSERT INTO vehicles (id, plate_number, model) VALUES ($1, $2, $3)`, 
      [id, plate_number.toUpperCase(), model]);
    res.json({ success: true, id });
  } catch (e) {
    if (e.message.includes('unique')) {
      return res.status(400).json({ error: "Numărul există deja" });
    }
    res.status(500).json({ error: "Eroare" });
  }
});

// ===== TRIP SHEETS =====

app.get("/api/trip-sheets", requireAuth, async (req, res) => {
  try {
    const r = await tq(req)(`
      SELECT t.*, d.name as driver_name, v.plate_number
      FROM trip_sheets t
      JOIN drivers d ON t.driver_id = d.id
      JOIN vehicles v ON t.vehicle_id = v.id
      ORDER BY t.date DESC
    `);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Eroare" });
  }
});

app.post("/api/trip-sheets", requireAuth, async (req, res) => {
  try {
    const { 
      date, driver_id, vehicle_id, km_start, locations,
      trip_number, departure_time, arrival_time, purpose,
      tech_check_departure, tech_check_arrival 
    } = req.body;

    const id = crypto.randomUUID();
    await tq(req)(`
      INSERT INTO trip_sheets (
        id, date, driver_id, vehicle_id, km_start, locations,
        trip_number, departure_time, arrival_time, purpose,
        tech_check_departure, tech_check_arrival, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
      id, date, driver_id, vehicle_id, km_start, locations || '',
      trip_number, departure_time, arrival_time, purpose,
      tech_check_departure || false, tech_check_arrival || false,
      req.session.user.username
    ]);

    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ error: "Eroare" });
  }
});

// ===== VERSION =====
app.get("/api/version", (req, res) => {
  res.json({ 
    version: "2.0.0-multi-tenant",
    tenant: req.tenant?.slug || null
  });
});

// ===== INITIALIZARE =====
const PORT = process.env.PORT || 3000;

(async () => {
  try {
    // Inițializează master DB
    await masterDb.ensureMasterTables();
    await masterDb.ensureDefaultSuperAdmin();
    console.log("✅ Master DB ready");

    // Pentru dezvoltare: creează compania FMD dacă nu există
    if (process.env.AUTO_CREATE_FMD === 'true') {
      const existing = await masterDb.getCompanyBySlug('fmd');
      if (!existing) {
        console.log("🔄 Creating FMD company for development...");
        const { setupNewCompany } = require("./migrations/runner");
        await setupNewCompany({
          slug: 'fmd',
          name: 'Fast Medical Distribution',
          cui: 'RO47095864',
          email: 'admin@fmd.ro',
          adminUsername: 'admin',
          adminPassword: 'admin'
        });
        console.log("✅ FMD company created!");
      }
    }

  } catch (e) {
    console.error("❌ Initialization error:", e);
  }

  app.listen(PORT, () => console.log("Server pornit pe port", PORT));
})();
