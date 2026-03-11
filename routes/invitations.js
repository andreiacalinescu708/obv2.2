// routes/invitations.js - Sistem de invitații
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const masterDb = require('../db-master');
const tenantDb = require('../db-tenant');
const { sendEmail } = require('../services/email');

// Middleware pentru verificare admin (tenant)
function requireAdmin(req, res, next) {
  if (req.session?.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acces interzis. Doar admin.' });
  }
  next();
}

// ================= TRIMITE INVITAȚIE =================
router.post('/send', requireAdmin, async (req, res) => {
  try {
    const { email, role = 'user' } = req.body;
    const tenant = req.tenant;

    if (!email) {
      return res.status(400).json({ error: 'Email obligatoriu' });
    }

    // Creează invitația în master DB
    const invitation = await masterDb.createInvitation({
      companyId: tenant.id,
      email,
      role,
      createdBy: req.session.user.username
    });

    // Trimite email
    const inviteUrl = `https://${tenant.slug}.${process.env.MAIN_DOMAIN || 'openbill.ro'}/accept-invite.html?token=${invitation.token}`;
    
    await sendEmail({
      to: email,
      template: 'invitation',
      data: {
        companyName: tenant.name,
        inviteUrl
      }
    });

    res.json({ 
      success: true, 
      message: 'Invitație trimisă',
      expiresAt: invitation.expiresAt
    });

  } catch (err) {
    console.error('Send invitation error:', err);
    res.status(500).json({ error: 'Eroare la trimiterea invitației' });
  }
});

// ================= VERIFICĂ TOKEN INVITAȚIE =================
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const invitation = await masterDb.getInvitationByToken(token);

    if (!invitation) {
      return res.status(400).json({ 
        error: 'Invitație invalidă sau expirată',
        valid: false
      });
    }

    res.json({
      valid: true,
      email: invitation.email,
      companyName: invitation.company_name,
      companySlug: invitation.company_slug
    });

  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// ================= ACCEPTĂ INVITAȚIE (CREARE CONT) =================
router.post('/accept/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { username, password, firstName, lastName, function: userFunction } = req.body;

    // Verifică invitația
    const invitation = await masterDb.getInvitationByToken(token);
    if (!invitation) {
      return res.status(400).json({ error: 'Invitație invalidă sau expirată' });
    }

    // Validări
    if (!username || !password) {
      return res.status(400).json({ error: 'Username și parolă obligatorii' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Parola trebuie să aibă minim 6 caractere' });
    }

    // Hash parola
    const passwordHash = await bcrypt.hash(password, 10);

    // Creează user în tenant DB
    const pool = tenantDb.getTenantPool(invitation.db_name);
    
    try {
      await pool.query(`
        INSERT INTO users (username, email, password_hash, first_name, last_name, role, function, is_approved, email_verified)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, true)
      `, [
        username, 
        invitation.email, 
        passwordHash, 
        firstName || '', 
        lastName || '',
        invitation.role,
        userFunction || ''
      ]);

      // Marchează invitația ca folosită
      await masterDb.markInvitationUsed(invitation.id);

      // Trimite email de bun venit
      const loginUrl = `https://${invitation.company_slug}.${process.env.MAIN_DOMAIN || 'openbill.ro'}`;
      await sendEmail({
        to: invitation.email,
        template: 'welcome',
        data: {
          username,
          firstName,
          companyName: invitation.company_name,
          loginUrl
        }
      });

      res.json({ 
        success: true, 
        message: 'Cont creat cu succes',
        loginUrl
      });

    } catch (err) {
      if (err.message.includes('duplicate')) {
        return res.status(400).json({ error: 'Username sau email deja existent' });
      }
      throw err;
    }

  } catch (err) {
    console.error('Accept invitation error:', err);
    res.status(500).json({ error: 'Eroare la crearea contului' });
  }
});

// ================= LISTĂ INVITAȚII ACTIVE (PENTRU ADMIN) =================
router.get('/list', requireAdmin, async (req, res) => {
  try {
    const tenant = req.tenant;
    
    const r = await masterDb.q(`
      SELECT id, email, role, expires_at, created_at, used_at
      FROM invitations
      WHERE company_id = $1
      ORDER BY created_at DESC
    `, [tenant.id]);

    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Eroare la listarea invitațiilor' });
  }
});

module.exports = router;
