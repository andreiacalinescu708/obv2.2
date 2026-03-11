const { Client } = require('pg');
const bcrypt = require('bcrypt');

const client = new Client({
  connectionString: 'postgresql://postgres:YpidPgXhEyfFjdgRFYVAGiwpSzSIkHgu@yamabiko.proxy.rlwy.net:28214/railway',
  ssl: { rejectUnauthorized: false }
});

async function setupFMD() {
  await client.connect();
  
  console.log('Creating schema fmd...');
  await client.query('CREATE SCHEMA IF NOT EXISTS fmd');
  
  console.log('Creating tables...');
  
  // Users table
  await client.query(`
    CREATE TABLE IF NOT EXISTS fmd.users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      role VARCHAR(50) DEFAULT 'operator',
      function VARCHAR(100),
      phone VARCHAR(20),
      active BOOLEAN DEFAULT true,
      is_approved BOOLEAN DEFAULT true,
      email_verified BOOLEAN DEFAULT true,
      email_verification_token VARCHAR(255),
      email_verification_expires TIMESTAMP,
      reset_token VARCHAR(255),
      reset_token_expires TIMESTAMP,
      failed_attempts INTEGER DEFAULT 0,
      unlock_at TIMESTAMP,
      last_failed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  // Settings table
  await client.query(`
    CREATE TABLE IF NOT EXISTS fmd.settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(100) UNIQUE NOT NULL,
      value TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  // Create admin user
  console.log('Creating admin user...');
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 10);
  
  try {
    await client.query(`
      INSERT INTO fmd.users (username, password_hash, email, first_name, last_name, role, active, is_approved)
      VALUES ('admin', $1, 'admin@fmd.ro', 'Admin', 'FMD', 'admin', true, true)
    `, [hash]);
    console.log('Admin user created: admin / admin123');
  } catch(e) {
    if (e.message.includes('duplicate')) {
      console.log('Admin user already exists');
    } else {
      throw e;
    }
  }
  
  console.log('FMD setup complete!');
  await client.end();
}

setupFMD().catch(err => { 
  console.error('Error:', err.message); 
  process.exit(1); 
});
