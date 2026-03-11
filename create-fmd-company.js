// Creează compania FMD manual în master DB
require('dotenv').config();
const masterDb = require('./db-master');
const bcrypt = require('bcrypt');
const { runMigrations } = require('./migrations/runner');
const tenantDb = require('./db-tenant');

async function createFMD() {
  try {
    console.log('🔄 Creating FMD company...\n');
    
    // 1. Creează compania în master DB
    const company = await masterDb.createCompany({
      slug: 'fmd',
      name: 'Fast Medical Distribution',
      cui: 'RO47095864',
      email: 'admin@fmd.ro'
    });
    
    console.log('✅ Company created in master DB:', company.db_name);
    
    // 2. Pe Railway folosim baza existentă (railway), deci nu putem crea openbill_fmd
    // Soluție: Folosim baza `railway` pentru FMD (temporar)
    console.log('\n⚠️ Railway does not allow creating new databases.');
    console.log('Using existing railway database for FMD...\n');
    
    // 3. Rulează migrări pe baza existentă
    await runMigrations('railway');
    console.log('✅ Migrations completed on railway DB');
    
    // 4. Creează admin user
    const passwordHash = await bcrypt.hash('admin', 10);
    const pool = tenantDb.getTenantPool('railway');
    
    // Verifică dacă există deja useri
    const check = await pool.query('SELECT COUNT(*)::int as n FROM users');
    if (check.rows[0].n === 0) {
      await pool.query(`
        INSERT INTO users (username, email, password_hash, role, is_approved, email_verified)
        VALUES ('admin', 'admin@fmd.ro', $1, 'admin', true, true)
      `, [passwordHash]);
      console.log('✅ Admin user created: admin / admin');
    } else {
      console.log('ℹ️ Users already exist');
    }
    
    // 5. Update company_settings
    await pool.query(`
      UPDATE company_settings 
      SET name = 'Fast Medical Distribution', cui = 'RO47095864'
      WHERE id = 'default'
    `);
    
    console.log('\n🎉 FMD Company ready!');
    console.log('URL: https://fmd.openbill.ro (or localhost with hosts file)');
    console.log('Login: admin / admin');
    
  } catch (err) {
    if (err.message.includes('duplicate')) {
      console.log('ℹ️ Company FMD already exists');
    } else {
      console.error('❌ Error:', err.message);
    }
  } finally {
    process.exit(0);
  }
}

createFMD();
