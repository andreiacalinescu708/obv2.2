// routes/superadmin.js - Endpoint-uri pentru SuperAdmin
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const masterDb = require('../db-master');
const { setupNewCompany } = require('../migrations/runner');

// Middleware pentru verificare superadmin
function requireSuperAdmin(req, res, next) {
  if (req.session?.superadmin?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acces interzis. Doar superadmin.' });
  }
  next();
}

// ================= AUTH SUPERADMIN =================

// Login superadmin (se face pe domeniul principal, nu pe subdomeniu)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const r = await masterDb.q(
      `SELECT * FROM superadmins WHERE username = $1 AND active = true`,
      [username]
    );

    if (r.rows.length === 0) {
      return res.status(401).json({ error: 'User sau parolă greșită' });
    }

    const admin = r.rows[0];
    const valid = await bcrypt.compare(password, admin.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'User sau parolă greșită' });
    }

    req.session.superadmin = {
      id: admin.id,
      username: admin.username,
      role: 'superadmin'
    };

    res.json({ ok: true, user: req.session.superadmin });
  } catch (err) {
    console.error('Superadmin login error:', err);
    res.status(500).json({ error: 'Eroare server' });
  }
});

// Logout superadmin
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Check session
router.get('/me', (req, res) => {
  if (req.session?.superadmin) {
    res.json({ loggedIn: true, user: req.session.superadmin });
  } else {
    res.json({ loggedIn: false });
  }
});

// ================= GESTIONARE COMPANII =================

// Listă toate companiile
router.get('/companies', requireSuperAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const companies = await masterDb.listCompanies({ status });
    res.json(companies);
  } catch (err) {
    console.error('List companies error:', err);
    res.status(500).json({ error: 'Eroare la listarea companiilor' });
  }
});

// Detalii companie
router.get('/companies/:id', requireSuperAdmin, async (req, res) => {
  try {
    const company = await masterDb.getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Companie negăsită' });
    }
    res.json(company);
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// Creare companie nouă
router.post('/companies', requireSuperAdmin, async (req, res) => {
  try {
    const { slug, name, cui, email, adminUsername, adminPassword } = req.body;

    // Validări
    if (!slug || !name || !cui || !email || !adminUsername || !adminPassword) {
      return res.status(400).json({ error: 'Toate câmpurile sunt obligatorii' });
    }

    // Validare slug (doar litere, cifre, minus)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ 
        error: 'Slug invalid. Folosește doar litere mici, cifre și cratimă.' 
      });
    }

    // Verificare slug existent
    const existing = await masterDb.getCompanyBySlug(slug);
    if (existing) {
      return res.status(400).json({ error: 'Acest slug este deja folosit' });
    }

    // Setup complet companie
    const company = await setupNewCompany({
      slug,
      name,
      cui,
      email,
      adminUsername,
      adminPassword
    });

    res.json({ 
      success: true, 
      company,
      url: `https://${slug}.${process.env.MAIN_DOMAIN || 'openbill.ro'}`
    });

  } catch (err) {
    console.error('Create company error:', err);
    res.status(500).json({ error: err.message || 'Eroare la crearea companiei' });
  }
});

// Update status companie
router.put('/companies/:id/status', requireSuperAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['trial', 'active', 'suspended', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status invalid' });
    }

    const company = await masterDb.updateCompanyStatus(req.params.id, status);
    res.json({ success: true, company });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la actualizare status' });
  }
});

// Ștergere companie (și DB!)
router.delete('/companies/:id', requireSuperAdmin, async (req, res) => {
  try {
    const company = await masterDb.getCompanyById(req.params.id);
    if (!company) {
      return res.status(404).json({ error: 'Companie negăsită' });
    }

    // Atenție: Aici ar trebui să ștergi și baza de date fizică
    // Dar e periculos, așa că doar marcăm ca ștearsă sau suspendată
    await masterDb.updateCompanyStatus(req.params.id, 'cancelled');
    
    // Sau dacă vrei să ștergi efectiv DB:
    // await dropDatabase(company.db_name);
    // await masterDb.deleteCompany(req.params.id);

    res.json({ success: true, message: 'Companie ștearsă' });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la ștergere' });
  }
});

// ================= DASHBOARD STATS =================

router.get('/stats', requireSuperAdmin, async (req, res) => {
  try {
    // Total companii
    const totalRes = await masterDb.q(`SELECT COUNT(*)::int as total FROM companies`);
    const trialRes = await masterDb.q(`SELECT COUNT(*)::int as count FROM companies WHERE status = 'trial'`);
    const activeRes = await masterDb.q(`SELECT COUNT(*)::int as count FROM companies WHERE status = 'active'`);
    const suspendedRes = await masterDb.q(`SELECT COUNT(*)::int as count FROM companies WHERE status = 'suspended'`);
    
    // Companii cu trial expirând în 7 zile
    const expiringRes = await masterDb.q(`
      SELECT COUNT(*)::int as count FROM companies 
      WHERE status = 'trial' 
      AND trial_expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    `);

    res.json({
      total: totalRes.rows[0].total,
      trial: trialRes.rows[0].count,
      active: activeRes.rows[0].count,
      suspended: suspendedRes.rows[0].count,
      expiringSoon: expiringRes.rows[0].count
    });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la obținerea statisticilor' });
  }
});

module.exports = router;
