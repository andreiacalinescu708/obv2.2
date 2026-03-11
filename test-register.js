const http = require('http');

const postData = JSON.stringify({
  companyName: 'Test Company',
  slug: 'testfirm202422',
  cui: 'RO12345678',
  email: 'test@test.ro',
  adminUsername: 'admin',
  adminPassword: 'admin123',
  firstName: 'Test',
  lastName: 'User'
});

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/public/register-company',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data);
    try {
      const json = JSON.parse(data);
      if (json.success) {
        console.log('✅ COMPANIE CREATĂ CU SUCCES!');
        console.log('URL:', json.url);
      } else {
        console.log('❌ EROARE:', json.error);
      }
    } catch(e) {
      console.log('Raw response:', data);
    }
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
  process.exit(1);
});

req.write(postData);
req.end();
