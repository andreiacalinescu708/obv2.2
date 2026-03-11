const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:YpidPgXhEyfFjdgRFYVAGiwpSzSIkHgu@yamabiko.proxy.rlwy.net:28214/railway',
  ssl: { rejectUnauthorized: false }
});

async function unlock() {
  await client.connect();
  
  // Reset all blocking fields
  await client.query(`
    UPDATE fmd.users 
    SET failed_attempts = 0, 
        unlock_at = NULL, 
        last_failed_at = NULL,
        active = true,
        is_approved = true
    WHERE username = 'admin'
  `);
  
  // Verify
  const res = await client.query('SELECT failed_attempts, unlock_at, active, is_approved FROM fmd.users WHERE username = $1', ['admin']);
  console.log('User status after reset:', res.rows[0]);
  
  await client.end();
}

unlock().catch(err => { 
  console.error('Error:', err.message); 
  process.exit(1); 
});
