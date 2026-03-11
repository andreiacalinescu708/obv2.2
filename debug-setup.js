require('dotenv').config();
const { setupNewCompany } = require('./migrations/runner');

async function test() {
  try {
    console.log('MASTER_DATABASE_URL:', process.env.MASTER_DATABASE_URL ? 'Setat' : 'Lipsă');
    console.log('Încep setupNewCompany...');
    const company = await setupNewCompany({
      slug: 'testfirma',
      name: 'Test Firma SRL',
      cui: 'RO12345678',
      email: 'test@testfirma.ro',
      adminUsername: 'admin',
      adminPassword: 'admin123'
    });
    console.log('✅ Companie creată:', company);
  } catch (err) {
    console.error('❌ Eroare:', err.message);
    console.error(err.stack);
  }
}

test();
