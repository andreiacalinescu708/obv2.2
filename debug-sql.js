const fs = require('fs');
const path = require('path');

const SCHEMA_FILE = path.join(__dirname, 'migrations', 'tenant-schema.sql');
const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');

const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log('Total statements:', statements.length);
console.log('\n=== Prima declarație ===');
console.log(statements[0]);
console.log('\n=== A doua declarație ===');
console.log(statements[1]);
console.log('\n=== A treia declarație ===');
console.log(statements[2]);
console.log('\n...');
console.log('\n=== Declarația cu index 6 (clients) ===');
console.log(statements[6]);
