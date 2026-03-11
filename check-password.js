const { Client } = require('pg');
const bcrypt = require('bcrypt');

const client = new Client({
  connectionString: 'postgresql://postgres:YpidPgXhEyfFjdgRFYVAGiwpSzSIkHgu@yamabiko.proxy.rlwy.net:28214/railway',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  await client.connect();
  
  const res = await client.query('SELECT username, password_hash FROM fmd.users WHERE username = $1', ['admin']);
  
  if (res.rows.length === 0) {
    console.log('User admin nu există!');
    await client.end();
    return;
  }
  
  const user = res.rows[0];
  console.log('Username:', user.username);
  console.log('Password hash:', user.password_hash);
  
  // Test bcrypt compare
  const testPass = 'admin123';
  const match = await bcrypt.compare(testPass, user.password_hash);
  console.log('Bcrypt compare result:', match);
  
  if (!match) {
    // Generate new hash
    const newHash = await bcrypt.hash(testPass, 10);
    console.log('New hash generated:', newHash);
    
    // Update
    await client.query('UPDATE fmd.users SET password_hash = $1 WHERE username = $2', [newHash, 'admin']);
    console.log('Password updated!');
    
    // Verify
    const verifyRes = await client.query('SELECT password_hash FROM fmd.users WHERE username = $1', ['admin']);
    const verifyMatch = await bcrypt.compare(testPass, verifyRes.rows[0].password_hash);
    console.log('Verification:', verifyMatch);
  }
  
  await client.end();
}

check().catch(err => { 
  console.error('Error:', err.message); 
  process.exit(1); 
});
