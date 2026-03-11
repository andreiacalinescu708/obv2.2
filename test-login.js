const http = require('http');

const postData = JSON.stringify({
  username: 'admin',
  password: 'admin123'
});

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'Host': '127.0.0.1:3000',
    'X-Company-Slug': 'fmd'  // Header special pentru testing
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
      if (json.ok || json.success) {
        console.log('✅ LOGIN REUSIT!');
      } else {
        console.log('❌ LOGIN ESUAT:', json.error);
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
