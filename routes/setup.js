// routes/setup.js - Endpoint pentru setup inițial (creează superadmin)
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const masterDb = require('../db-master');

// Creează superadmin dacă nu există
router.post('/init', async (req, res) => {
  try {
    // Verifică dacă există deja superadmin
    const check = await masterDb.q('SELECT COUNT(*)::int AS n FROM superadmins');
    if (check.rows[0].n > 0) {
      return res.status(403).json({ error: 'Setup already completed' });
    }

    const username = process.env.SUPERADMIN_USER || 'alex1';
    const password = process.env.SUPERADMIN_PASS || 'admin123';
    const email = process.env.SUPERADMIN_EMAIL || 'admin@openbill.ro';

    const hash = await bcrypt.hash(password, 10);
    await masterDb.q(
      'INSERT INTO superadmins (username, password_hash, email) VALUES ($1, $2, $3)',
      [username, hash, email]
    );

    res.json({ 
      success: true, 
      message: 'Superadmin created',
      username: username,
      password: password
    });
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Check setup status
router.get('/status', async (req, res) => {
  try {
    const check = await masterDb.q('SELECT COUNT(*)::int AS n FROM superadmins');
    res.json({ 
      setupComplete: check.rows[0].n > 0,
      hasDb: masterDb.hasMasterDb()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
