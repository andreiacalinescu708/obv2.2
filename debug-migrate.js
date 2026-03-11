require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const SCHEMA_FILE = path.join(__dirname, 'migrations', 'tenant-schema.sql');

async function testMigrate() {
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  
  // Elimină comentariile și împarte în statements (ca în runner.js nou)
  const sqlWithoutComments = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
  
  const statements = sqlWithoutComments
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  console.log(`Total statements: ${statements.length}`);
  console.log('\n=== Primele 5 statements ===');
  statements.slice(0, 5).forEach((s, i) => {
    console.log(`\n[${i + 1}] ${s.substring(0, 100)}...`);
  });
  
  // Conectare la DB test
  const dbName = 'openbill_testmigrate2';
  const masterUrl = process.env.MASTER_DATABASE_URL;
  const match = masterUrl.match(/^(postgres(?:ql)?:\/\/)([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/);
  const [, protocol, user, pass, host, port] = match;
  
  // Creează DB
  const adminUrl = `${protocol}${user}:${pass}@${host}:${port}/postgres`;
  const adminPool = new Pool({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
  await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await adminPool.query(`CREATE DATABASE "${dbName}"`);
  await adminPool.end();
  console.log(`\n✅ DB creat: ${dbName}`);
  
  // Conectare la DB nou
  const dbUrl = `${protocol}${user}:${pass}@${host}:${port}/${dbName}`;
  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    console.log(`\n[${i + 1}/${statements.length}] ${statement.substring(0, 80)}...`);
    
    try {
      await pool.query(statement + ';');
      console.log('✅ OK');
    } catch (err) {
      if (err.code === '42P07') {
        console.log('ℹ️ Already exists');
      } else {
        console.error(`❌ Error: ${err.message}`);
        break;
      }
    }
  }
  
  await pool.end();
  
  // Cleanup
  const cleanup = new Pool({ connectionString: adminUrl, ssl: { rejectUnauthorized: false } });
  await cleanup.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await cleanup.end();
  console.log('\n✅ Cleanup done');
}

testMigrate().catch(console.error);
