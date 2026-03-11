// middleware/tenant.js - Detectare tenant după subdomeniu
const masterDb = require('../db-master');

async function tenantMiddleware(req, res, next) {
  // Skip pentru rutele master (landing, superadmin, înregistrare, login)
  const skipPaths = ['/api/superadmin', '/api/register-company', '/api/check-slug', '/api/login'];
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Extrage subdomeniul din host (îndepărtează portul dacă există)
  const hostWithPort = req.headers.host || '';
  const host = hostWithPort.split(':')[0]; // Îndepărtează portul (ex: fmd.localhost:3000 -> fmd.localhost)
  const mainDomain = process.env.MAIN_DOMAIN || 'openbill.ro';
  
  let slug = null;
  
  if (host.includes('.')) {
    const parts = host.split('.');
    // Dacă e subdomeniu (fmd.openbill.ro sau fmd.localhost)
    const isMainDomain = host.endsWith(mainDomain) || 
                         host.includes('localhost') || 
                         host.includes('127.0.0.1');
    
    if (parts.length >= 2 && isMainDomain) {
      const potentialSlug = parts[0];
      // Exclude www și altele generice
      if (potentialSlug !== 'www' && potentialSlug !== 'app' && potentialSlug !== 'localhost' && potentialSlug !== '127') {
        slug = potentialSlug;
      }
    }
  }

  // Fallback: header X-Company-Slug (pentru testing/API)
  if (!slug && req.headers['x-company-slug']) {
    slug = req.headers['x-company-slug'];
  }

  if (!slug) {
    // Pentru rutele public pe domeniul principal, continuă fără tenant
    if (host === mainDomain || host === `www.${mainDomain}`) {
      req.tenant = null;
      return next();
    }
    return res.status(404).json({ error: 'Companie negăsită' });
  }

  try {
    const company = await masterDb.getCompanyBySlug(slug);
    
    if (!company) {
      return res.status(404).json({ error: 'Companie inexistentă' });
    }

    // Verifică status companie
    if (!company.is_active || company.status === 'suspended') {
      return res.status(403).json({ 
        error: 'Companie suspendată',
        status: company.status
      });
    }

    // Verifică trial expirat
    if (company.status === 'trial' && new Date() > new Date(company.trial_expires_at)) {
      return res.status(403).json({ 
        error: 'Trial expirat',
        status: 'trial_expired',
        trialExpiresAt: company.trial_expires_at
      });
    }

    // Atașează info tenant la request
    req.tenant = {
      id: company.id,
      slug: company.slug,
      dbName: company.db_name,
      name: company.name,
      status: company.status,
      trialExpiresAt: company.trial_expires_at
    };

    next();
  } catch (err) {
    console.error('Tenant middleware error:', err);
    res.status(500).json({ error: 'Eroare la identificarea companiei' });
  }
}

module.exports = { tenantMiddleware };
