// Existing API fixtures authenticate normally and obtain tokens from rendered HTML.
// Missing, invalid, and foreign-token behavior is covered explicitly in platform contracts.
const assert = require('node:assert/strict');
const http = require('node:http');

module.exports = async function withCsrf(origin, options) {
  const headers = options.headers || {};
  const cookie = headers.Cookie || headers.cookie;
  if (options.method !== 'POST' || !cookie || Object.keys(headers).some(key => key.toLowerCase() === 'x-csrf-token')) {
    return options;
  }
  const token = await new Promise((resolve, reject) => {
    const req = http.get(new URL('/en/day-01', origin), { headers: { Cookie: cookie } }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        const match = text.match(/<meta name="csrf-token" content="([^"]+)"/);
        if (res.statusCode !== 200 || !match) {
          reject(new Error('Authenticated fixture page did not expose its CSRF token'));
        } else resolve(match[1]);
      });
    });
    req.on('error', reject);
  });
  assert.ok(token, 'Authenticated fixture requires a nonempty session CSRF token');
  return { ...options, headers: { ...headers, 'X-CSRF-Token': token } };
};
