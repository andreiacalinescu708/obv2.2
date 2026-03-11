const { Client } = require('pg');
const bcrypt = require('bcrypt');

const client = new Client({
  connectionString: 'postgresql://postgres:YpidPgXhEyfFjdgRFYVAGiwpSzSIkHgu@yamabiko.proxy.rlwy.net:28214/railway',
  ssl: { rejectUnauthorized: false }
});

async function reset() {
  await client.connect();
  
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 10);
  
  // Update password
  await client.query(
    'UPDATE fmd.users SET password_hash = $1, failed_attempts = 0, unlock_at = null WHERE username = $2',
    [hash, 'admin']
  );
  
  console.log('✅ Parola pentru admin a fost resetată la: admin123');
  
  await client.end();
}

reset().catch(err => { 
  console.error('Error:', err.message); 
  process.exit(1); 
});
