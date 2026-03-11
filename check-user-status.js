const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:YpidPgXhEyfFjdgRFYVAGiwpSzSIkHgu@yamabiko.proxy.rlwy.net:28214/railway',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  await client.connect();
  
  const res = await client.query('SELECT * FROM fmd.users WHERE username = $1', ['admin']);
  
  if (res.rows.length === 0) {
    console.log('User admin nu există!');
    await client.end();
    return;
  }
  
  const user = res.rows[0];
  console.log('User data:');
  console.log('  id:', user.id);
  console.log('  username:', user.username);
  console.log('  active:', user.active);
  console.log('  is_approved:', user.is_approved);
  console.log('  email_verified:', user.email_verified);
  console.log('  failed_attempts:', user.failed_attempts);
  console.log('  unlock_at:', user.unlock_at);
  
  // Fix all flags
  await client.query(
    'UPDATE fmd.users SET active = true, is_approved = true, email_verified = true, failed_attempts = 0, unlock_at = null WHERE username = $1',
    ['admin']
  );
  console.log('\n✅ User updated to active=true, is_approved=true');
  
  await client.end();
}

check().catch(err => { 
  console.error('Error:', err.message); 
  process.exit(1); 
});
