const bcrypt = require('bcrypt');
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:YpidPgXhEyfFjdgRFYVAGiwpSzSIkHgu@yamabiko.proxy.rlwy.net:28214/railway',
  ssl: { rejectUnauthorized: false }
});

async function test() {
  await client.connect();
  
  const r = await client.query(`
    SELECT id, username, password_hash, email, first_name, last_name, 
           role, function, email_verified, active, is_approved,
           failed_attempts, unlock_at, last_failed_at
    FROM fmd.users WHERE username = $1 LIMIT 1
  `, ['admin']);

  const u = r.rows[0];
  console.log('User from DB:', u.username);
  console.log('Password hash:', u.password_hash);
  
  const password = 'admin123';
  console.log('Testing password:', password);
  
  const ok = await bcrypt.compare(password, u.password_hash);
  console.log('Bcrypt result:', ok);
  
  // Test with hash generated now
  const newHash = await bcrypt.hash(password, 10);
  console.log('New hash:', newHash);
  const newOk = await bcrypt.compare(password, newHash);
  console.log('New hash compare:', newOk);
  
  // Test cross-comparison
  const crossOk = await bcrypt.compare(password, '$2b$10$TDIu94GmC5ds6EqSqqGRMuMHyM8ZT4De9pkXCZvI6OoL9gbCFRs5O');
  console.log('Cross compare with hardcoded hash:', crossOk);
  
  await client.end();
}

test().catch(err => console.error('Error:', err));
