require('dotenv').config();
const { runMigrations } = require('./migrations/runner');

runMigrations('railway')
  .then(() => {
    console.log('✅ Migrations completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
