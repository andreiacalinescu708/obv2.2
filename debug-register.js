const { Client } = require('pg');

const masterUrl = 'postgresql://postgres:YpidPgXhEyfFjdgRFYVAGiwpSzSIkHgu@yamabiko.proxy.rlwy.net:28214/railway';

// Parse URL
const match = masterUrl.match(/^(postgres(?:ql)?:\/\/)([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
if (!match) {
  console.log('URL invalid');
  process.exit(1);
}

const [, protocol, user, pass, host, port] = match;
console.log('Parsed URL:', { protocol, user: '***', pass: '***', host, port });

// Test conectare la postgres default
const adminUrl = `${protocol}${user}:${pass}@${host}:${port}/postgres`;
console.log('Admin URL:', adminUrl.replace(/:[^:@]+@/, ':****@'));

const client = new Client({
  connectionString: adminUrl,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    await client.connect();
    console.log('✅ Conectat la postgres');
    
    // Creează DB test
    const dbName = 'openbill_testdebug';
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✅ DB creat: ${dbName}`);
    
    await client.end();
    
    // Conectare la DB nou
    const newDbUrl = `${protocol}${user}:${pass}@${host}:${port}/${dbName}`;
    const newClient = new Client({
      connectionString: newDbUrl,
      ssl: { rejectUnauthorized: false }
    });
    
    await newClient.connect();
    console.log(`✅ Conectat la ${dbName}`);
    
    // Crează tabel test
    await newClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT,
        email TEXT
      )
    `);
    console.log('✅ Tabel users creat');
    
    // Inserare test
    await newClient.query(`
      INSERT INTO users (username, email) VALUES ('test', 'test@test.com')
    `);
    console.log('✅ Date inserate');
    
    // Citire
    const res = await newClient.query('SELECT * FROM users');
    console.log('✅ Date citite:', res.rows);
    
    await newClient.end();
    
    // Cleanup
    const cleanupClient = new Client({
      connectionString: adminUrl,
      ssl: { rejectUnauthorized: false }
    });
    await cleanupClient.connect();
    await cleanupClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log('✅ Cleanup done');
    await cleanupClient.end();
    
  } catch (err) {
    console.error('❌ Eroare:', err.message);
  }
}

test();
