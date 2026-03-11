// routes/universal-login.js - Login pentru orice tip de user
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const masterDb = require('../db-master');
const tenantDb = require('../db-tenant');

// Login universal - detectează automat superadmin sau user de companie
router.post('/', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username și parolă obligatorii' });
    }

    // 1. Încearcă superadmin mai întâi
    const superadmin = await masterDb.q(
      'SELECT * FROM superadmins WHERE username = $1 LIMIT 1',
      [username]
    );

    if (superadmin.rows.length > 0) {
      const sa = superadmin.rows[0];
      const match = await bcrypt.compare(password, sa.password_hash);
      
      if (match) {
        req.session.user = {
          id: sa.id,
          username: sa.username,
          email: sa.email,
          role: 'superadmin'
        };
        
        return res.json({
          ok: true,
          user: {
            id: sa.id,
            username: sa.username,
            email: sa.email,
            role: 'superadmin'
          },
          redirectUrl: '/superadmin.html'
        });
      }
    }

    // 2. Dacă nu e superadmin, caută în toate companiile
    const companies = await masterDb.listCompanies();
    
    for (const company of companies) {
      try {
        const pool = tenantDb.getTenantPool(company.db_name);
        
        // Caută userul în această companie
        const userResult = await pool.query(
          `SELECT id, username, password_hash, email, first_name, last_name, 
                  role, active, is_approved, failed_attempts, unlock_at
           FROM users WHERE username = $1 LIMIT 1`,
          [username]
        );

        if (userResult.rows.length > 0) {
          const u = userResult.rows[0];
          
          // Verifică blocare
          if (u.failed_attempts >= 3 && u.unlock_at && new Date(u.unlock_at) > new Date()) {
            const minutesLeft = Math.ceil((new Date(u.unlock_at) - new Date()) / 60000);
            return res.status(403).json({
              locked: true,
              minutesLeft,
              message: `Cont blocat. Mai așteaptă ${minutesLeft} minute.`
            });
          }

          // Verifică activ
          if (!u.active) {
            continue; // User inactiv, încearcă următoarea companie
          }

          // Verifică aprobat
          if (!u.is_approved) {
            return res.status(403).json({
              pending: true,
              message: 'Cont în așteptare'
            });
          }

          // Verifică parola
          const match = await bcrypt.compare(password, u.password_hash);
          
          if (match) {
            // Reset failed attempts
            await pool.query(
              'UPDATE users SET failed_attempts = 0, unlock_at = null WHERE id = $1',
              [u.id]
            );

            // Set session
            req.session.user = {
              id: u.id,
              username: u.username,
              email: u.email,
              firstName: u.first_name,
              lastName: u.last_name,
              role: u.role,
              companyId: company.id,
              companySlug: company.slug,
              companyName: company.name
            };

            // Build redirect URL
            const isLocalhost = req.headers.host.includes('localhost') || req.headers.host.includes('127.0.0.1');
            const redirectUrl = isLocalhost
              ? `http://${company.slug}.localhost:3000/index.html`
              : `https://${company.slug}.${process.env.MAIN_DOMAIN || 'openbill.ro'}/dashboard.html`;

            return res.json({
              ok: true,
              user: {
                id: u.id,
                username: u.username,
                email: u.email,
                firstName: u.first_name,
                lastName: u.last_name,
                role: u.role,
                company: {
                  id: company.id,
                  name: company.name,
                  slug: company.slug
                }
              },
              redirectUrl
            });
          } else {
            // Parolă greșită - increment failed attempts
            const newAttempts = (u.failed_attempts || 0) + 1;
            
            if (newAttempts >= 3) {
              const unlockAt = new Date(Date.now() + 30 * 60000);
              await pool.query(
                'UPDATE users SET failed_attempts = $1, unlock_at = $2 WHERE id = $3',
                [newAttempts, unlockAt, u.id]
              );
            } else {
              await pool.query(
                'UPDATE users SET failed_attempts = $1 WHERE id = $2',
                [newAttempts, u.id]
              );
            }
            
            // Nu returnăm eroare încă, încercăm și alte companii
            // Dar în realitate, username-ul ar trebui să fie unic global
          }
        }
      } catch (err) {
        // Ignoră erori și continuă cu următoarea companie
        console.log(`Error checking company ${company.slug}:`, err.message);
      }
    }

    // Dacă am ajuns aici, userul nu a fost găsit sau parola e greșită
    return res.status(401).json({ error: 'User sau parolă greșită' });

  } catch (err) {
    console.error('Universal login error:', err);
    res.status(500).json({ error: 'Eroare la autentificare' });
  }
});

module.exports = router;
