require('dotenv').config();
const masterDb = require('./db-master');

async function fix() {
  await masterDb.q(`UPDATE companies SET db_name = 'railway' WHERE slug = 'fmd'`);
  console.log('✅ Updated FMD db_name to railway');
}

fix().then(() => process.exit(0));
