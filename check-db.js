const {Pool} = require('pg');
const pool = new Pool({
  connectionString: process.env.MASTER_DATABASE_URL,
  ssl: {rejectUnauthorized: false}
});

async function check() {
  try {
    const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    console.log('Tables:', tables.rows.map(x => x.tablename).join(', '));
    
    const users = await pool.query('SELECT COUNT(*) as n FROM users');
    console.log('Users count:', users.rows[0].n);
    
    const companies = await pool.query('SELECT * FROM companies');
    console.log('Companies:', companies.rows.map(c => `${c.name} (${c.slug})`).join(', '));
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    pool.end();
  }
}

check();
