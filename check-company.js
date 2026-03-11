require('dotenv').config();
const masterDb = require('./db-master');

async function check() {
  const company = await masterDb.getCompanyBySlug('fmd');
  console.log('Company:', company);
}

check().then(() => process.exit(0));
