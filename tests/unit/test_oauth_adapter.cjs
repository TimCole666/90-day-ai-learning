// Unit test: real Google/GitHub OAuth adapters (D6).
// Drives the full authorization-code + PKCE S256 flow against a local fake
// OAuth provider on 127.0.0.1. No real provider endpoints, credentials or
// network access are involved; endpoint overrides are honored only outside
// production, which is also asserted here.
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const FAKE_TOKEN = 'fake-access-token-7d3b9c2e';
const FAKE_GOOGLE_SECRET = 'fake-google-client-secret';
const FAKE_GITHUB_SECRET = 'fake-github-client-secret';

// ---------------------------------------------------------------------------
// Fake OAuth provider: /authorize records the query and redirects back with a
// code bound to that authorize request; /token verifies the PKCE verifier
// against the recorded challenge; /userinfo and /gh-user return profiles.
// ---------------------------------------------------------------------------
function createFakeProvider() {
  const pendingCodes = new Map();
  const seen = { authorizes: [], pkceVerified: false, lastTokenParams: null };
  const mode = {
    authorize: 'code',        // 'code' | 'deny' | 'weird-error'
    tokenStatus: 200,
    userinfoProfile: 'ok',    // 'ok' | 'no-id' | 'unverified-email'
    userinfoDelayMs: 0,
    googleSub: 'google-uid-1',
    ghId: 424242
  };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://fake.local');

    if (u.pathname === '/authorize') {
      const q = Object.fromEntries(u.searchParams);
      seen.authorizes.push(q);
      const state = encodeURIComponent(q.state || '');
      if (mode.authorize === 'deny') {
        res.writeHead(302, { Location: `${q.redirect_uri}?error=access_denied&state=${state}` });
      } else if (mode.authorize === 'weird-error') {
        res.writeHead(302, { Location: `${q.redirect_uri}?error=server_error_evil&state=${state}` });
      } else {
        const code = `fake-auth-code-${pendingCodes.size}`;
        pendingCodes.set(code, q);
        res.writeHead(302, { Location: `${q.redirect_uri}?code=${code}&state=${state}` });
      }
      res.end();
      return;
    }

    if (u.pathname === '/token') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const params = Object.fromEntries(new URLSearchParams(body));
        seen.lastTokenParams = params;
        const authorize = pendingCodes.get(params.code);
        if (authorize && authorize.code_challenge_method === 'S256' &&
            crypto.createHash('sha256').update(params.code_verifier || '').digest('base64url') === authorize.code_challenge) {
          seen.pkceVerified = true;
        }
        if (mode.tokenStatus !== 200) {
          res.writeHead(mode.tokenStatus, { 'Content-Type': 'text/plain' });
          res.end('upstream failure');
          return;
        }
        if (!authorize) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: FAKE_TOKEN, token_type: 'Bearer' }));
      });
      return;
    }

    if (u.pathname === '/userinfo' || u.pathname === '/gh-user') {
      const respond = () => {
        if ((req.headers.authorization || '') !== `Bearer ${FAKE_TOKEN}`) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'bad_token' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (u.pathname === '/gh-user') {
          res.end(JSON.stringify(mode.userinfoProfile === 'no-id' ? { login: 'noid' } :
            { id: mode.ghId, login: 'alicegh', name: null, email: 'alice@example.com' }));
          return;
        }
        if (mode.userinfoProfile === 'no-id') res.end(JSON.stringify({ email: 'x@example.com' }));
        else if (mode.userinfoProfile === 'unverified-email') res.end(JSON.stringify({ sub: mode.googleSub, email: 'eve@example.com', email_verified: false, name: 'Eve' }));
        else res.end(JSON.stringify({ sub: mode.googleSub, email: 'alice@example.com', email_verified: true, name: 'Alice Walker' }));
      };
      if (mode.userinfoDelayMs > 0) setTimeout(respond, mode.userinfoDelayMs);
      else respond();
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}`, seen, mode });
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
    s.once('error', reject);
  });
}

function waitForLine(proc, re, label, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: start timeout. Output: ${proc._output}`)), timeoutMs);
    const onData = chunk => {
      proc._output += chunk.toString();
      const m = proc._output.match(re);
      if (m) { clearTimeout(timer); resolve(m); }
    };
    proc._output = '';
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.once('exit', code => { clearTimeout(timer); reject(new Error(`${label}: exited ${code}. Output: ${proc._output}`)); });
  });
}

async function spawnApp(env, args = ['server.cjs', '0']) {
  const proc = spawn('node', args, {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const m = await waitForLine(proc, /127\.0\.0\.1:(\d+)/, JSON.stringify({ NODE_ENV: env.NODE_ENV }));
  return { proc, origin: `http://127.0.0.1:${parseInt(m[1], 10)}` };
}

async function req(url, { cookie, headers } = {}) {
  const res = await fetch(url, {
    redirect: 'manual',
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers }
  });
  const text = await res.text();
  return {
    status: res.status,
    location: res.headers.get('location'),
    setCookie: res.headers.get('set-cookie'),
    body: text
  };
}

function sidFrom(setCookie) {
  assert.ok(setCookie, 'expected a Set-Cookie header');
  const m = setCookie.match(/sid=([^;]+)/);
  assert.ok(m, 'expected a sid cookie');
  return `sid=${m[1]}`;
}

// Runs the start -> authorize -> callback flow. Returns the last response.
async function oauthFlow(appOrigin, fakeOrigin, provider, { cookie, startPath } = {}) {
  const start = await req(`${appOrigin}${startPath || `/auth/${provider}`}?returnTo=/en/day-01`, { cookie });
  assert.equal(start.status, 302, `${provider} start should redirect`);
  const authorizeUrl = start.location;
  assert.ok(authorizeUrl && authorizeUrl.startsWith(`${fakeOrigin}/authorize?`),
    `${provider} start should redirect to the fake provider, got ${authorizeUrl}`);

  const authParams = new URL(authorizeUrl).searchParams;
  assert.equal(authParams.get('code_challenge_method'), 'S256');
  assert.ok((authParams.get('code_challenge') || '').length > 20, 'code_challenge must be present');
  const state = authParams.get('state');
  assert.ok(state, 'state must be present');
  const redirectUri = authParams.get('redirect_uri');
  assert.equal(redirectUri, `${appOrigin}/auth/${provider}/callback`);

  const authz = await req(authorizeUrl);
  assert.equal(authz.status, 302, 'fake provider should redirect back');
  const callbackUrl = authz.location;
  assert.ok(callbackUrl.startsWith(`${appOrigin}/auth/${provider}/callback`), `callback URL mismatch: ${callbackUrl}`);

  // The start response binds the state to this browser; the callback must
  // come back from the same browser, carrying that cookie.
  const bind = bindCookieFrom(start.setCookie);
  const cb = await req(callbackUrl, { cookie: [cookie, bind].filter(Boolean).join('; ') });
  return { cb, state, authorizeUrl, callbackUrl, bind, startSetCookie: start.setCookie };
}

function bindCookieFrom(setCookie) {
  assert.ok(setCookie, 'OAuth start must set a browser-binding cookie');
  const m = setCookie.match(/oauth_bind=([^;]+)/);
  assert.ok(m, `expected an oauth_bind cookie, got ${setCookie}`);
  return `oauth_bind=${m[1]}`;
}

// Runs start -> authorize, then returns the callback URL without calling it.
async function startAndAuthorize(appOrigin, provider) {
  const start = await req(`${appOrigin}/auth/${provider}?returnTo=/en/day-01`);
  const authz = await req(start.location);
  return { callbackUrl: authz.location, bind: bindCookieFrom(start.setCookie) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  console.log('--- Running OAuth Adapter Tests (D6) ---');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-adapter-'));
  const dbFile = path.join(tmpDir, 'learn.db');
  const fake = await createFakeProvider();
  const appPort = await freePort();
  const appOrigin = `http://127.0.0.1:${appPort}`;

  const envBase = {
    NODE_ENV: 'development',
    DB_PATH: dbFile,
    PUBLIC_ORIGIN: appOrigin,
    GOOGLE_CLIENT_ID: 'fake-google-client-id',
    GOOGLE_CLIENT_SECRET: FAKE_GOOGLE_SECRET,
    GITHUB_CLIENT_ID: 'fake-github-client-id',
    GITHUB_CLIENT_SECRET: FAKE_GITHUB_SECRET,
    OAUTH_GOOGLE_AUTHORIZE_URL: `${fake.origin}/authorize`,
    OAUTH_GOOGLE_TOKEN_URL: `${fake.origin}/token`,
    OAUTH_GOOGLE_USERINFO_URL: `${fake.origin}/userinfo`,
    OAUTH_GITHUB_AUTHORIZE_URL: `${fake.origin}/authorize`,
    OAUTH_GITHUB_TOKEN_URL: `${fake.origin}/token`,
    OAUTH_GITHUB_USERINFO_URL: `${fake.origin}/gh-user`,
    OAUTH_TIMEOUT_MS: '400'
  };

  const { proc: appProc } = await spawnApp({ ...envBase, PORT: String(appPort) });
  const app = appOrigin;
  try {
    // -- 1. Google sign-in -------------------------------------------------
    {
      const { cb } = await oauthFlow(app, fake.origin, 'google');
      assert.equal(cb.status, 302);
      assert.equal(cb.location, '/en/day-01', `expected redirect to returnTo, got ${cb.location}`);
      const sid = sidFrom(cb.setCookie);
      const me = await req(`${app}/api/auth/me`, { cookie: sid });
      const meJson = JSON.parse(me.body);
      assert.equal(meJson.authenticated, true);
      assert.equal(meJson.user.provider, 'google');
      assert.equal(meJson.user.email, 'alice@example.com');
      assert.equal(meJson.user.name, 'Alice Walker');
      console.log('✓ Google sign-in succeeds');
    }
    assert.ok(fake.seen.pkceVerified, 'token exchange must satisfy the S256 challenge');
    console.log('✓ PKCE verifier matches the S256 challenge');

    // -- 2. GitHub sign-in -------------------------------------------------
    let githubSid;
    {
      const { cb } = await oauthFlow(app, fake.origin, 'github');
      assert.equal(cb.status, 302);
      githubSid = sidFrom(cb.setCookie);
      const me = JSON.parse((await req(`${app}/api/auth/me`, { cookie: githubSid })).body);
      assert.equal(me.authenticated, true);
      assert.equal(me.user.provider, 'github');
      // name || login fallback: fake profile has name: null
      assert.equal(me.user.name, 'alicegh');
      console.log('✓ GitHub sign-in succeeds (name falls back to login)');
    }

    // -- 3. Linking, both directions ----------------------------------------
    {
      const googleSid = sidFrom((await oauthFlow(app, fake.origin, 'google')).cb.setCookie);
      // A fresh GitHub identity: the standalone sign-in above already owns 424242.
      fake.mode.ghId = 555555;
      const link = await oauthFlow(app, fake.origin, 'github', { cookie: googleSid, startPath: '/auth/link/github' });
      assert.equal(link.cb.status, 302);
      assert.ok((link.cb.location || '').includes('linked=github'), `expected linked=github, got ${link.cb.location}`);
      const me = JSON.parse((await req(`${app}/api/auth/me`, { cookie: googleSid })).body);
      const providers = me.user.identities.map(i => i.provider).sort();
      assert.deepEqual(providers, ['github', 'google']);
      fake.mode.ghId = 424242;
      console.log('✓ GitHub linking succeeds');

      // A fresh Google identity for the same reason.
      fake.mode.googleSub = 'google-uid-7';
      const linkG = await oauthFlow(app, fake.origin, 'google', { cookie: githubSid, startPath: '/auth/link/google' });
      assert.equal(linkG.cb.status, 302);
      assert.ok((linkG.cb.location || '').includes('linked=google'), `expected linked=google, got ${linkG.cb.location}`);
      fake.mode.googleSub = 'google-uid-1';
      console.log('✓ Google linking succeeds');
    }

    // -- 4. State protection ------------------------------------------------
    {
      const bad = await req(`${app}/auth/google/callback?code=fake-auth-code-0&state=no-such-state`);
      assert.equal(bad.status, 400, 'unknown state must be rejected');
      assert.ok(!bad.setCookie, 'rejected flow must not create a session');
      console.log('✓ Wrong state is rejected');

      const { callbackUrl } = await oauthFlow(app, fake.origin, 'google');
      const replay = await req(callbackUrl);
      assert.equal(replay.status, 400, 'replayed state must be rejected');
      assert.ok(!replay.setCookie, 'replay must not create a second session');
      console.log('✓ Replayed state is rejected');

      // State minted for google must not authenticate a github callback.
      const start = await req(`${app}/auth/google?returnTo=/en/day-01`);
      const googleState = new URL(start.location).searchParams.get('state');
      const cross = await req(`${app}/auth/github/callback?code=fake-auth-code-x&state=${googleState}`);
      assert.equal(cross.status, 400, 'cross-provider state must be rejected');
      assert.ok(!cross.setCookie, 'cross-provider flow must not create a session');
      console.log('✓ Cross-provider state is rejected');

      // Login CSRF: an attacker's callback URL opened in another browser
      // (no bind cookie, or a different one) must not sign that browser in.
      const unbound = await startAndAuthorize(app, 'google');
      const noBind = await req(unbound.callbackUrl);
      assert.equal(noBind.status, 400, 'callback without the bind cookie must be rejected');
      assert.ok(!noBind.setCookie, 'unbound callback must not create a session');
      const other = await startAndAuthorize(app, 'google');
      const victim = await startAndAuthorize(app, 'google');
      const wrongBind = await req(other.callbackUrl, { cookie: victim.bind });
      assert.equal(wrongBind.status, 400, 'callback with another browser\'s bind cookie must be rejected');
      assert.ok(!wrongBind.setCookie, 'mismatched bind cookie must not create a session');
      console.log('✓ OAuth state is bound to the starting browser (login CSRF)');

      const flow = await oauthFlow(app, fake.origin, 'google');
      assert.match(flow.startSetCookie, /oauth_bind=[^;]+;.*Path=\/auth/);
      assert.match(flow.startSetCookie, /HttpOnly/);
      assert.match(flow.startSetCookie, /SameSite=Lax/);
      assert.match(flow.cb.setCookie || '', /oauth_bind=;[^,]*Max-Age=0/, 'bind cookie is cleared on success');
      console.log('✓ Bind cookie is HttpOnly, scoped to /auth, and cleared on success');
    }

    // -- 5. Provider failure modes -> provider_error -------------------------
    {
      fake.mode.tokenStatus = 500;
      const { cb } = await oauthFlow(app, fake.origin, 'google');
      assert.equal(cb.status, 302);
      assert.ok((cb.location || '').includes('auth_error=provider_error'), `token 500 -> provider_error, got ${cb.location}`);
      assert.ok(!cb.setCookie);
      fake.mode.tokenStatus = 200;
      console.log('✓ Token-endpoint 500 -> provider_error');

      fake.mode.userinfoProfile = 'no-id';
      const noId = await oauthFlow(app, fake.origin, 'google');
      assert.ok((noId.cb.location || '').includes('auth_error=provider_error'), `missing user id -> provider_error, got ${noId.cb.location}`);
      assert.ok(!noId.cb.setCookie);
      fake.mode.userinfoProfile = 'ok';
      console.log('✓ Userinfo without an id -> provider_error');

      fake.mode.userinfoDelayMs = 1500;
      const slow = await oauthFlow(app, fake.origin, 'google');
      assert.ok((slow.cb.location || '').includes('auth_error=provider_error'), `timeout -> provider_error, got ${slow.cb.location}`);
      assert.ok(!slow.cb.setCookie);
      fake.mode.userinfoDelayMs = 0;
      console.log('✓ Userinfo timeout -> provider_error');
    }

    // -- 6. Google unverified email -> null ----------------------------------
    {
      fake.mode.userinfoProfile = 'unverified-email';
      fake.mode.googleSub = 'google-uid-9'; // fresh identity, so a new user is created
      const { cb } = await oauthFlow(app, fake.origin, 'google');
      const sid = sidFrom(cb.setCookie);
      const me = JSON.parse((await req(`${app}/api/auth/me`, { cookie: sid })).body);
      assert.equal(me.authenticated, true);
      // The identity row stores NULL (oauth_identities.email is nullable);
      // users.email is NOT NULL, so the session-level field reads ''.
      const googleIdentity = me.user.identities.find(i => i.provider === 'google');
      assert.equal(googleIdentity.email, null, 'unverified Google email must be stored as null');
      assert.equal(me.user.email, '', 'users.email is NOT NULL; a missing email reads as empty');
      fake.mode.userinfoProfile = 'ok';
      fake.mode.googleSub = 'google-uid-1';
      console.log('✓ Google email_verified=false stores a null email');
    }

    // -- 7. Error reflection is reduced --------------------------------------
    {
      fake.mode.authorize = 'deny';
      const { cb } = await oauthFlow(app, fake.origin, 'google');
      assert.ok((cb.location || '').includes('auth_error=access_denied'), `cancelled sign-in -> access_denied, got ${cb.location}`);
      fake.mode.authorize = 'weird-error';
      const weird = await oauthFlow(app, fake.origin, 'google');
      assert.ok((weird.cb.location || '').includes('auth_error=provider_error'), `unknown provider error -> provider_error, got ${weird.cb.location}`);
      assert.ok(!(weird.cb.location || '').includes('server_error_evil'), 'raw provider error must not be reflected');
      fake.mode.authorize = 'code';
      console.log('✓ Cancelled sign-in -> access_denied; unknown errors reduce to provider_error');
    }

    // -- 8. Secrets and tokens are never persisted or logged -----------------
    {
      const dbBytes = Buffer.concat(fs.readdirSync(tmpDir).map(f => fs.readFileSync(path.join(tmpDir, f))));
      assert.ok(!dbBytes.includes(FAKE_TOKEN), 'access token must not appear in the database file');
      assert.ok(!dbBytes.includes(FAKE_GOOGLE_SECRET) && !dbBytes.includes(FAKE_GITHUB_SECRET),
        'client secrets must not appear in the database file');
      assert.ok(!(appProc._output || '').includes(FAKE_TOKEN), 'access token must not appear in server output');
      assert.ok(!(appProc._output || '').includes(FAKE_GOOGLE_SECRET), 'secrets must not appear in server output');
      console.log('✓ Access tokens and secrets appear nowhere in the DB file or server output');
    }
  } finally {
    appProc.kill('SIGTERM');
  }

  // -- 8b. Non-numeric OAUTH_TIMEOUT_MS falls back to the 10 s default --------
  {
    const port2 = await freePort();
    const origin2 = `http://127.0.0.1:${port2}`;
    const { proc: proc2 } = await spawnApp({
      ...envBase, PORT: String(port2), PUBLIC_ORIGIN: origin2,
      OAUTH_TIMEOUT_MS: 'soon', DB_PATH: path.join(tmpDir, 'learn2.db')
    });
    try {
      const { cb } = await oauthFlow(origin2, fake.origin, 'google');
      assert.equal(cb.status, 302);
      assert.ok(cb.setCookie, 'sign-in must succeed with a non-numeric OAUTH_TIMEOUT_MS');
      console.log('✓ Non-numeric OAUTH_TIMEOUT_MS falls back to the 10 s default');
    } finally {
      proc2.kill('SIGTERM');
    }
  }

  // -- 8c. <P>_CLIENT_SECRET is trimmed like the client id ---------------------
  {
    const port3 = await freePort();
    const origin3 = `http://127.0.0.1:${port3}`;
    const { proc: proc3 } = await spawnApp({
      ...envBase, PORT: String(port3), PUBLIC_ORIGIN: origin3,
      GOOGLE_CLIENT_SECRET: `  ${FAKE_GOOGLE_SECRET}  `, DB_PATH: path.join(tmpDir, 'learn3.db')
    });
    try {
      await oauthFlow(origin3, fake.origin, 'google');
      assert.equal(fake.seen.lastTokenParams.client_secret, FAKE_GOOGLE_SECRET,
        'client secret must be trimmed before the token request');
      console.log('✓ <P>_CLIENT_SECRET is trimmed like the client id');
    } finally {
      proc3.kill('SIGTERM');
    }
  }

  // -- 9. Production ignores endpoint overrides ------------------------------
  {
    const { proc, origin } = await spawnApp({
      NODE_ENV: 'production',
      SESSION_SECRET: 'oauth-prod-test-secret',
      DB_PATH: ':memory:',
      PUBLIC_ORIGIN: 'https://learn.example.test',
      GOOGLE_CLIENT_ID: 'prod-google-id',
      GOOGLE_CLIENT_SECRET: 'prod-google-secret',
      GITHUB_CLIENT_ID: 'prod-github-id',
      GITHUB_CLIENT_SECRET: 'prod-github-secret',
      OAUTH_GOOGLE_AUTHORIZE_URL: `${fake.origin}/authorize`,
      OAUTH_GOOGLE_TOKEN_URL: `${fake.origin}/token`,
      OAUTH_GOOGLE_USERINFO_URL: `${fake.origin}/userinfo`,
      OAUTH_GITHUB_AUTHORIZE_URL: `${fake.origin}/authorize`,
      OAUTH_GITHUB_TOKEN_URL: `${fake.origin}/token`,
      OAUTH_GITHUB_USERINFO_URL: `${fake.origin}/gh-user`
    });
    try {
      const g = await req(`${origin}/auth/google?returnTo=/en/day-01`);
      assert.equal(g.status, 302);
      const gUrl = new URL(g.location);
      assert.equal(`${gUrl.origin}${gUrl.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth',
        `production must use the fixed Google endpoint, got ${g.location}`);
      assert.equal(gUrl.searchParams.get('redirect_uri'), 'https://learn.example.test/auth/google/callback');
      assert.equal(gUrl.searchParams.get('scope'), 'openid email profile');
      assert.equal(gUrl.searchParams.get('code_challenge_method'), 'S256');
      assert.ok(gUrl.searchParams.get('state'));

      const h = await req(`${origin}/auth/github?returnTo=/en/day-01`);
      const hUrl = new URL(h.location);
      assert.equal(`${hUrl.origin}${hUrl.pathname}`, 'https://github.com/login/oauth/authorize',
        `production must use the fixed GitHub endpoint, got ${h.location}`);
      assert.equal(hUrl.searchParams.get('redirect_uri'), 'https://learn.example.test/auth/github/callback');
      assert.ok(!hUrl.searchParams.get('scope'), 'GitHub requests no scope (public profile only)');
      console.log('✓ Production ignores endpoint overrides and uses fixed provider endpoints');
    } finally {
      proc.kill('SIGTERM');
    }
  }

  // -- 10. Production without credentials/test-provider ----------------------
  {
    const { proc, origin } = await spawnApp({
      NODE_ENV: 'production',
      SESSION_SECRET: 'oauth-prod-test-secret',
      DB_PATH: ':memory:',
      PUBLIC_ORIGIN: 'https://learn.example.test'
    });
    try {
      const g = await req(`${origin}/auth/google?returnTo=/en/day-01`);
      assert.equal(g.status, 302);
      assert.ok((g.location || '').includes('auth_error=provider_error'), `unconfigured provider -> provider_error, got ${g.location}`);
      const tp = await req(`${origin}/auth/test-provider?provider=google&state=x`);
      assert.notEqual(tp.status, 200, 'test provider must stay unreachable in production');
      console.log('✓ Production without credentials -> provider_error; test provider unreachable');
    } finally {
      proc.kill('SIGTERM');
    }
  }

  // -- 11. Production requires an https PUBLIC_ORIGIN -------------------------
  {
    const { proc, origin } = await spawnApp({
      NODE_ENV: 'production',
      SESSION_SECRET: 'oauth-prod-test-secret',
      DB_PATH: ':memory:',
      PUBLIC_ORIGIN: 'http://insecure.example.test',
      GOOGLE_CLIENT_ID: 'prod-google-id',
      GOOGLE_CLIENT_SECRET: 'prod-google-secret-leak-check'
    });
    try {
      const g = await req(`${origin}/auth/google?returnTo=/en/day-01`);
      assert.ok((g.location || '').includes('auth_error=provider_error'),
        `http PUBLIC_ORIGIN in production -> provider off, got ${g.location}`);
      assert.ok((proc._output || '').includes('google'), 'startup warning must name the provider');
      assert.ok(!(proc._output || '').includes('prod-google-secret-leak-check'), 'warning must never contain the secret');
      console.log('✓ Non-https PUBLIC_ORIGIN disables the provider in production (warning names provider, never secret)');
    } finally {
      proc.kill('SIGTERM');
    }
  }

  fake.server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('>>> All OAuth adapter tests passed <<<');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
