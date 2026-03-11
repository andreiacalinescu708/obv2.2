require('dotenv').config();
const bcrypt = require('bcrypt');
const masterDb = require('./db-master');

async function setup() {
  try {
    console.log('Setting up superadmin...');
    
    // Verifică dacă există deja superadmin
    const check = await masterDb.q('SELECT COUNT(*)::int as n FROM superadmins');
    if (check.rows[0].n > 0) {
      console.log('ℹ️ Superadmin already exists');
      return;
    }
    
    const username = process.env.SUPERADMIN_USER || 'alex1';
    const password = process.env.SUPERADMIN_PASS || 'admin123';
    const email = process.env.SUPERADMIN_EMAIL || 'alex1@openbill.ro';
    
    const hash = await bcrypt.hash(password, 10);
    await masterDb.q(
      'INSERT INTO superadmins (username, password_hash, email) VALUES ($1, $2, $3)',
      [username, hash, email]
    );
    
    console.log(`✅ Superadmin created: ${username}`);
    console.log(`   Password: ${password}`);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

setup().then(() => process.exit(0));
