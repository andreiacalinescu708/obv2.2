const { Client } = require('pg');
const bcrypt = require('bcrypt');

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
  console.log('User found:');
  console.log('  username:', user.username);
  console.log('  active:', user.active);
  console.log('  is_approved:', user.is_approved);
  console.log('  failed_attempts:', user.failed_attempts);
  console.log('  unlock_at:', user.unlock_at);
  console.log('  last_failed_at:', user.last_failed_at);
  console.log('  password_hash:', user.password_hash);
  
  const testPass = 'admin123';
  const match = await bcrypt.compare(testPass, user.password_hash);
  console.log('\nBcrypt compare (admin123):', match);
  
  if (!match) {
    console.log('\nGenerating new hash...');
    const newHash = await bcrypt.hash('admin123', 10);
    console.log('New hash:', newHash);
    
    await client.query(
      'UPDATE fmd.users SET password_hash = $1, failed_attempts = 0, unlock_at = null WHERE username = $2',
      [newHash, 'admin']
    );
    console.log('Password updated!');
  }
  
  await client.end();
}

check().catch(err => console.error('Error:', err.message));
