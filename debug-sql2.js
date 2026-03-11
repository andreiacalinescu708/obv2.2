const fs = require('fs');

const sql = fs.readFileSync('./migrations/tenant-schema.sql', 'utf8');

// Afișează primele 500 caractere
console.log('Primele 500 caractere:');
console.log(sql.substring(0, 500));
console.log('\n=== SPLIT ===\n');

// Split și afișează primele 5
const parts = sql.split(';');
console.log('Total părți:', parts.length);
for (let i = 0; i < 5; i++) {
  console.log(`\n--- Partea ${i} ---`);
  console.log(parts[i].trim().substring(0, 200));
}
