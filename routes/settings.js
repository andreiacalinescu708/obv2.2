// routes/settings.js - Settings per companie
const express = require('express');
const router = express.Router();
const tenantDb = require('../db-tenant');
const crypto = require('crypto');

// Helper pentru query pe tenant curent
function tq(req) {
  return (sql, params) => tenantDb.q(req.tenant.dbName, sql, params);
}

// Middleware pentru verificare admin
function requireAdmin(req, res, next) {
  if (req.session?.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acces interzis.' });
  }
  next();
}

// ================= COMPANY SETTINGS =================

// Get settings
router.get('/company', async (req, res) => {
  try {
    const r = await tq(req)(`SELECT * FROM company_settings WHERE id = 'default'`);
    res.json(r.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Eroare la citire settings' });
  }
});

// Update settings
router.put('/company', requireAdmin, async (req, res) => {
  try {
    const { 
      name, cui, address, city, country, phone, email,
      smartbill_token, smartbill_series 
    } = req.body;

    await tq(req)(`
      UPDATE company_settings 
      SET name = $1, cui = $2, address = $3, city = $4, country = $5, 
          phone = $6, email = $7, smartbill_token = $8, smartbill_series = $9,
          updated_at = now()
      WHERE id = 'default'
    `, [name, cui, address, city, country, phone, email, smartbill_token, smartbill_series]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la salvare' });
  }
});

// ================= ROUTES (TRASEE) =================

// Listă toate traseele
router.get('/routes', async (req, res) => {
  try {
    const r = await tq(req)(`
      SELECT r.*, COUNT(c.id) as clients_count
      FROM routes r
      LEFT JOIN clients c ON c.route_id = r.id AND c.active = true
      WHERE r.active = true
      GROUP BY r.id
      ORDER BY r.sort_order, r.name
    `);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Eroare la listarea traseelor' });
  }
});

// Creare traseu
router.post('/routes', requireAdmin, async (req, res) => {
  try {
    const { name, description, sortOrder = 0 } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Numele traseului este obligatoriu' });
    }

    const id = crypto.randomUUID();
    await tq(req)(`
      INSERT INTO routes (id, name, description, sort_order)
      VALUES ($1, $2, $3, $4)
    `, [id, name, description, sortOrder]);

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la creare traseu' });
  }
});

// Update traseu
router.put('/routes/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, sortOrder, active } = req.body;
    
    await tq(req)(`
      UPDATE routes 
      SET name = $1, description = $2, sort_order = $3, active = $4
      WHERE id = $5
    `, [name, description, sortOrder, active, req.params.id]);

    // Dacă dezactivăm traseul, clienții devin "fără traseu"
    if (active === false) {
      await tq(req)(`
        UPDATE clients SET route_id = NULL WHERE route_id = $1
      `, [req.params.id]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la actualizare' });
  }
});

// Ștergere traseu (soft delete - clienții rămân fără traseu)
router.delete('/routes/:id', requireAdmin, async (req, res) => {
  try {
    // Setează clienții fără traseu
    await tq(req)(`UPDATE clients SET route_id = NULL WHERE route_id = $1`, [req.params.id]);
    
    // Dezactivează traseul
    await tq(req)(`UPDATE routes SET active = false WHERE id = $1`, [req.params.id]);

    res.json({ success: true, message: 'Traseu șters. Clienții au rămas fără traseu.' });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la ștergere' });
  }
});

// ================= PRODUCT CATEGORIES =================

// Listă categorii
router.get('/product-categories', async (req, res) => {
  try {
    const r = await tq(req)(`
      SELECT pc.*, COUNT(p.id) as products_count
      FROM product_categories pc
      LEFT JOIN products p ON p.category_id = pc.id AND p.active = true
      WHERE pc.active = true
      GROUP BY pc.id
      ORDER BY pc.sort_order, pc.name
    `);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Eroare la listarea categoriilor' });
  }
});

// Creare categorie
router.post('/product-categories', requireAdmin, async (req, res) => {
  try {
    const { name, sortOrder = 0 } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Numele categoriei este obligatoriu' });
    }

    const id = crypto.randomUUID();
    await tq(req)(`
      INSERT INTO product_categories (id, name, sort_order)
      VALUES ($1, $2, $3)
    `, [id, name, sortOrder]);

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la creare categorie' });
  }
});

// Update categorie
router.put('/product-categories/:id', requireAdmin, async (req, res) => {
  try {
    const { name, sortOrder, active } = req.body;
    
    await tq(req)(`
      UPDATE product_categories 
      SET name = $1, sort_order = $2, active = $3
      WHERE id = $4
    `, [name, sortOrder, active, req.params.id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la actualizare' });
  }
});

// Ștergere categorie
router.delete('/product-categories/:id', requireAdmin, async (req, res) => {
  try {
    // Verifică dacă există produse în categorie
    const check = await tq(req)(`
      SELECT COUNT(*) as count FROM products WHERE category_id = $1
    `, [req.params.id]);

    if (parseInt(check.rows[0].count) > 0) {
      // Dezactivează în loc să ștergi
      await tq(req)(`UPDATE product_categories SET active = false WHERE id = $1`, [req.params.id]);
      return res.json({ 
        success: true, 
        warning: 'Categorie dezactivată (conține produse). Produsele rămân active.'
      });
    }

    // Șterge efectiv dacă nu are produse
    await tq(req)(`DELETE FROM product_categories WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la ștergere' });
  }
});

// ================= USER PROFILE =================

// Get profil user curent
router.get('/profile', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Neautentificat' });
    }

    const r = await tq(req)(`
      SELECT id, username, email, first_name, last_name, role, function, email_verified, created_at
      FROM users WHERE id = $1
    `, [req.session.user.id]);

    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'User negăsit' });
    }

    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// Update profil
router.put('/profile', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Neautentificat' });
    }

    const { firstName, lastName, function: userFunction } = req.body;

    await tq(req)(`
      UPDATE users 
      SET first_name = $1, last_name = $2, function = $3
      WHERE id = $4
    `, [firstName, lastName, userFunction, req.session.user.id]);

    // Update session
    req.session.user.firstName = firstName;
    req.session.user.lastName = lastName;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la salvare' });
  }
});

// Trimite cod verificare email
router.post('/profile/send-verification', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Neautentificat' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await tq(req)(`
      UPDATE users SET email_verification_code = $1 WHERE id = $2
    `, [code, req.session.user.id]);

    // Trimite email cu cod
    const { sendEmail } = require('../services/email');
    const userRes = await tq(req)(`SELECT email, first_name FROM users WHERE id = $1`, [req.session.user.id]);
    const user = userRes.rows[0];

    await sendEmail({
      to: user.email,
      template: 'verificationCode',
      data: { code, firstName: user.first_name }
    });

    res.json({ success: true, message: 'Cod trimis pe email' });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la trimiterea codului' });
  }
});

// Verificare cod email
router.post('/profile/verify-email', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!req.session.user) {
      return res.status(401).json({ error: 'Neautentificat' });
    }

    const r = await tq(req)(`
      SELECT 1 FROM users 
      WHERE id = $1 AND email_verification_code = $2
    `, [req.session.user.id, code]);

    if (r.rows.length === 0) {
      return res.status(400).json({ error: 'Cod invalid' });
    }

    await tq(req)(`
      UPDATE users SET email_verified = true, email_verification_code = NULL WHERE id = $1
    `, [req.session.user.id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare la verificare' });
  }
});

module.exports = router;
