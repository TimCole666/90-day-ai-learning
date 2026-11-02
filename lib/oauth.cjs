// Real OAuth 2.0 provider adapters (Google and GitHub) with PKCE S256.
// Adapters are built purely from environment variables — client secrets are
// never read from committed config files. In production the fixed provider
// endpoints are always used; the OAUTH_<P>_*_URL overrides exist only for
// local fake-server tests outside production.
class ProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderError';
  }
}

const PROVIDER_ENDPOINTS = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile'
  },
  github: {
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    userinfo: 'https://api.github.com/user',
    scope: '' // empty: public profile only — no repository or private-email access
  }
};

const DEFAULT_TIMEOUT_MS = 10000;
const GITHUB_USER_AGENT = '90-day-ai-learning';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// fetch wrapper: non-2xx, network errors, timeouts and malformed JSON all
// collapse into ProviderError. Response bodies are never copied into error
// messages or logs.
async function fetchJson(url, options, fetchImpl, timeoutMs) {
  let res;
  try {
    res = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ProviderError('provider request failed');
  }
  if (!res.ok) throw new ProviderError(`provider responded ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new ProviderError('provider returned malformed JSON');
  }
}

function buildAdapter(provider, { clientId, clientSecret, endpoints, fetchImpl, timeoutMs }) {
  const fixed = PROVIDER_ENDPOINTS[provider];

  return {
    provider,

    authorizeUrl({ state, codeChallenge, redirectUri }) {
      const url = new URL(endpoints.authorize);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('state', state);
      if (fixed.scope) url.searchParams.set('scope', fixed.scope);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      return url.toString();
    },

    async exchange({ code, codeVerifier, redirectUri }) {
      const token = await fetchJson(endpoints.token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri
        }).toString()
      }, fetchImpl, timeoutMs);
      if (!token || typeof token.access_token !== 'string' || token.access_token === '') {
        throw new ProviderError('token response missing access_token');
      }

      const headers = { 'Authorization': `Bearer ${token.access_token}`, 'Accept': 'application/json' };
      if (provider === 'github') headers['User-Agent'] = GITHUB_USER_AGENT;
      const info = await fetchJson(endpoints.userinfo, { headers }, fetchImpl, timeoutMs);

      if (provider === 'google') {
        if (!nonEmpty(String(info.sub || ''))) throw new ProviderError('userinfo missing sub');
        return {
          provider,
          providerUserId: String(info.sub),
          email: info.email_verified === true && nonEmpty(info.email) ? info.email : null,
          name: nonEmpty(info.name) ? info.name : null
        };
      }
      // github
      if (info.id === undefined || info.id === null) throw new ProviderError('userinfo missing id');
      return {
        provider,
        providerUserId: String(info.id),
        email: nonEmpty(info.email) ? info.email : null,
        name: nonEmpty(info.name) ? info.name : (nonEmpty(info.login) ? info.login : null)
      };
    }
  };
}

// Builds per-provider adapters from env. Returns { adapters, publicOrigin,
// warnings } where adapters.<provider> is null whenever that provider is not
// configured. A provider is configured only when <P>_CLIENT_ID,
// <P>_CLIENT_SECRET and PUBLIC_ORIGIN are all non-empty; in production
// PUBLIC_ORIGIN must additionally be an https:// origin.
function buildOAuthAdapters({ env = process.env, isProduction = false, fetchImpl = fetch } = {}) {
  const publicOrigin = nonEmpty(env.PUBLIC_ORIGIN) ? env.PUBLIC_ORIGIN.trim().replace(/\/+$/, '') : null;
  const parsedTimeout = parseInt(env.OAUTH_TIMEOUT_MS, 10);
  const timeoutMs = (!isProduction && nonEmpty(env.OAUTH_TIMEOUT_MS) && Number.isFinite(parsedTimeout) && parsedTimeout > 0)
    ? parsedTimeout
    : DEFAULT_TIMEOUT_MS;
  const adapters = {};
  const warnings = [];

  for (const provider of Object.keys(PROVIDER_ENDPOINTS)) {
    const P = provider.toUpperCase();
    const clientId = env[`${P}_CLIENT_ID`];
    const clientSecret = env[`${P}_CLIENT_SECRET`];
    adapters[provider] = null;
    if (!nonEmpty(clientId) || !nonEmpty(clientSecret) || !publicOrigin) continue;
    if (isProduction && !publicOrigin.startsWith('https://')) {
      // The warning names the provider only; credentials are never logged.
      warnings.push(`OAuth provider "${provider}" disabled: PUBLIC_ORIGIN must be an https:// origin in production.`);
      continue;
    }
    const fixed = PROVIDER_ENDPOINTS[provider];
    const endpoints = {
      authorize: !isProduction && nonEmpty(env[`OAUTH_${P}_AUTHORIZE_URL`]) ? env[`OAUTH_${P}_AUTHORIZE_URL`].trim() : fixed.authorize,
      token: !isProduction && nonEmpty(env[`OAUTH_${P}_TOKEN_URL`]) ? env[`OAUTH_${P}_TOKEN_URL`].trim() : fixed.token,
      userinfo: !isProduction && nonEmpty(env[`OAUTH_${P}_USERINFO_URL`]) ? env[`OAUTH_${P}_USERINFO_URL`].trim() : fixed.userinfo
    };
    adapters[provider] = buildAdapter(provider, { clientId: clientId.trim(), clientSecret: clientSecret.trim(), endpoints, fetchImpl, timeoutMs });
  }

  return { adapters, publicOrigin, warnings };
}

module.exports = { buildOAuthAdapters, ProviderError };
