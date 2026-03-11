const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:YpidPgXhEyfFjdgRFYVAGiwpSzSIkHgu@yamabiko.proxy.rlwy.net:28214/railway',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  await client.connect();
  
  console.log('Checking companies table...');
  const res = await client.query('SELECT * FROM companies');
  console.log('Companies:', res.rows);
  
  // Check specific fmd
  const fmd = await client.query("SELECT * FROM companies WHERE slug = 'fmd'");
  console.log('FMD company:', fmd.rows);
  
  await client.end();
}

check().catch(err => { 
  console.error('Error:', err.message); 
  process.exit(1); 
});
