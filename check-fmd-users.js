const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:YpidPgXhEyfFjdgRFYVAGiwpSzSIkHgu@yamabiko.proxy.rlwy.net:28214/railway',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  await client.connect();
  
  // Vezi dacă există schema fmd și tabela users
  const res = await client.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'fmd'");
  console.log('Schema fmd exists:', res.rows.length > 0);
  
  if (res.rows.length > 0) {
    try {
      const users = await client.query('SELECT id, username, email, first_name, last_name, role, active FROM fmd.users');
      console.log('Users in FMD:', users.rows);
    } catch(e) {
      console.log('Eroare la citire users:', e.message);
    }
  } else {
    console.log('Schema fmd nu există');
  }
  
  await client.end();
}

check().catch(err => { console.error('Error:', err.message); process.exit(1); });
