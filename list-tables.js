require('dotenv').config();
const {Pool} = require('pg');
const pool = new Pool({
  connectionString: process.env.MASTER_DATABASE_URL,
  ssl: {rejectUnauthorized: false}
});

pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")
  .then(r => console.log('Tables:', r.rows.map(x => x.tablename).sort().join(', ')))
  .catch(e => console.log('Error:', e.message))
  .finally(() => pool.end());
