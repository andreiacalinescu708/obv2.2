// routes/public.js - Endpoint-uri publice (landing page)
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const masterDb = require('../db-master');
const { setupNewCompany } = require('../migrations/runner');
const { sendEmail } = require('../services/email');

// ================= VERIFICARE SLUG DISPONIBIL =================
router.get('/check-slug', async (req, res) => {
  try {
    const { slug } = req.query;
    
    if (!slug) {
      return res.status(400).json({ error: 'Slug lipsă' });
    }

    // Validare format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.json({ 
        available: false, 
        reason: 'Slug invalid. Folosește doar litere mici, cifre și cratimă.' 
      });
    }

    // Verificare cuvinte rezervate
    const reserved = ['www', 'app', 'admin', 'api', 'support', 'mail', 'ftp', 'superadmin'];
    if (reserved.includes(slug)) {
      return res.json({ 
        available: false, 
        reason: 'Acest nume este rezervat.' 
      });
    }

    // Verificare existență
    const existing = await masterDb.getCompanyBySlug(slug);
    if (existing) {
      return res.json({ 
        available: false, 
        reason: 'Acest nume este deja folosit.' 
      });
    }

    res.json({ 
      available: true,
      url: `https://${slug}.${process.env.MAIN_DOMAIN || 'openbill.ro'}`
    });

  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// ================= ÎNREGISTRARE COMPANIE NOUĂ =================
router.post('/register-company', async (req, res) => {
  try {
    const { 
      companyName, 
      cui, 
      email, 
      slug, 
      adminUsername, 
      adminPassword,
      firstName,
      lastName 
    } = req.body;

    // Validări
    if (!companyName || !cui || !email || !slug || !adminUsername || !adminPassword) {
      return res.status(400).json({ error: 'Toate câmpurile sunt obligatorii' });
    }

    // Validare email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email invalid' });
    }

    // Validare parolă
    if (adminPassword.length < 6) {
      return res.status(400).json({ error: 'Parola trebuie să aibă minim 6 caractere' });
    }

    // Verificare slug
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug invalid' });
    }

    const existing = await masterDb.getCompanyBySlug(slug);
    if (existing) {
      return res.status(400).json({ error: 'Acest nume de companie este deja folosit' });
    }

    // Creează compania
    const company = await setupNewCompany({
      slug,
      name: companyName,
      cui,
      email,
      adminUsername,
      adminPassword
    });

    // Update info admin cu date suplimentare
    const pool = require('../db-tenant').getTenantPool(company.db_name);
    await pool.query(`
      UPDATE users 
      SET first_name = $1, last_name = $2, email = $3
      WHERE username = $4
    `, [firstName || '', lastName || '', email, adminUsername]);

    // Trimite email de bun venit
    const loginUrl = `https://${slug}.${process.env.MAIN_DOMAIN || 'openbill.ro'}`;
    await sendEmail({
      to: email,
      template: 'welcome',
      data: {
        username: adminUsername,
        firstName,
        companyName,
        loginUrl
      }
    });

    res.json({
      success: true,
      message: 'Companie creată cu succes!',
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug
      },
      url: loginUrl
    });

  } catch (err) {
    console.error('Register company error:', err);
    res.status(500).json({ 
      error: err.message || 'Eroare la înregistrarea companiei' 
    });
  }
});

module.exports = router;
