# Deployment, Operations, and Rollback Runbook

This document details the production delivery package, operational assumptions, database backup/restore procedures, and rollback workflows for the 90-Day AI Learning Platform.

---

## 1. Artifact and Configuration Assumptions

### 1.1 Artifact Package
- **Format**: Clean `.tar.gz` bundle produced by `scripts/package_release.cjs` (e.g., `dist/90-day-ai-learning-1.0.0.tar.gz`).
- **Reproducibility**: Tarballs are generated with normalized timestamps, numeric ownership, and deterministic lexical file ordering.
- **Included Assets**:
  - Unified application server (`server.cjs`).
  - Production package metadata (`package.json`).
  - Curriculum content and manifest (`curriculum/`).
  - Web platform assets and styles (`curriculum/assets/`, `assets/`).
  - Legacy annual route lesson catalog (`lessons/`).
  - Legal notices and rights agreements (`LICENSE`, `LICENSE-CC-BY-SA-4.0`, `NOTICE`).
  - Production configuration template (`config.production.json`).
  - Operational scripts: `scripts/backup.cjs`, `scripts/restore.cjs`, `scripts/rollback.cjs`, and `scripts/list_corrections.cjs`.
- **Excluded Material**:
  - Development scratch and planning directories (`.scratch/`, `.pi/`).
  - Python virtual environments and caches (`.venv/`, `__pycache__/`, `.ruff_cache/`).
  - Git repository internals and credentials (`.git/`, `.env*`).
  - Test fixtures and test logs (`tests/`).
  - Unredistributed third-party research archives (`archive/`, `self-media/`, `selfteaching/`, `reference/`, `zettelkasten/`).

### 1.2 System Requirements
- **Runtime**: Node.js `>= 22.13.0` (the first unflagged baseline used by this release for standard-library `node:sqlite`; use a current patched release satisfying this floor).
- **Operating System**: Linux (Ubuntu 22.04+ or Debian 12 recommended).
- **File System**: Persistent disk volume for database storage and periodic backups.

### 1.3 Configuration Variables
Configuration can be supplied via environment variables or a configuration JSON file referenced via `CONFIG_PATH`:

| Variable | Description | Required in Production | Default |
|---|---|---|---|
| `NODE_ENV` | Runtime mode (`development`, `production`, `test`) | Yes (`production`) | `development` |
| `PORT` | Listening TCP port | No | `3000` |
| `HOST` | Bind address | No | `127.0.0.1` |
| `DATA_DIR` | Directory storing SQLite database (`learn.db`) and backups | Yes | `./data` |
| `SESSION_SECRET` | Production startup guard: the server refuses to start in production without it. Session cookies are random server-side tokens stored in the database, so this value is not used to sign them. | **Yes** (server aborts startup if missing) | `""` |
| `DB_PATH` | Full path of the SQLite database file; overrides `DATA_DIR/learn.db` | No | `DATA_DIR/learn.db` |
| `CONFIG_PATH` | Path to JSON config file | No | `""` |
| `PUBLIC_ORIGIN` | Public origin of the site, for example `https://<subdomain>`. OAuth redirect URIs are built from it. In production it must start with `https://`, or every OAuth provider stays disabled and startup logs a warning. | **Yes** (for sign-in) | unset |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client. Google sign-in is enabled only when both are set together with `PUBLIC_ORIGIN`. | **Yes** (for Google sign-in) | unset |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth app. GitHub sign-in is enabled only when both are set together with `PUBLIC_ORIGIN`. | **Yes** (for GitHub sign-in) | unset |
| `OAUTH_<P>_AUTHORIZE_URL`, `OAUTH_<P>_TOKEN_URL`, `OAUTH_<P>_USERINFO_URL`, `OAUTH_TIMEOUT_MS` | Fake-provider overrides for local tests. **Ignored in production**, which always uses the fixed Google/GitHub endpoints and a 10 s timeout. | Must not be set | unset |
| `AUTH_ADAPTER` | `test` enables the mock identity provider for local development and automated tests. **Ignored in production**: the mock provider requires a non-production `NODE_ENV`. | Must not be set | unset |

Precedence: explicit environment values take precedence over the non-secret `CONFIG_PATH` file. In particular, `SESSION_SECRET` is read only from the environment; a config-file value cannot replace it. `NODE_ENV=production` cannot be downgraded by `env: "development"` in the file. The OAuth variables above are read only from the environment; the config file cannot set them. Keep secrets out of the config file and supply them as environment variables from a root-owned file with mode `0600` (for example a systemd `EnvironmentFile`). `allowedOrigins` in `config.production.json` is not read by the current server.

---

## 2. Step-by-Step Deployment Procedure

### Step 1: Transfer and Unpack Artifact
```bash
# On the production server:
mkdir -p /opt/learn/releases/v1.0.0
tar -xzf 90-day-ai-learning-1.0.0.tar.gz -C /opt/learn/releases/v1.0.0
```

### Step 2: Configure Environment
Create the non-secret config `/opt/learn/config.json`:
```json
{
  "env": "production",
  "port": 3000,
  "host": "127.0.0.1",
  "dataDir": "/var/lib/learn/data"
}
```

Put secrets in `/opt/learn/secrets.env` (owner `root`, mode `0600`), never in the config file or the release directory:
```bash
SESSION_SECRET=<output of: openssl rand -hex 32>
PUBLIC_ORIGIN=https://<subdomain>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GITHUB_CLIENT_ID=<from GitHub OAuth app>
GITHUB_CLIENT_SECRET=<from GitHub OAuth app>
```
See section 6 for creating the OAuth clients.
Do not set `AUTH_ADAPTER` on any internet-reachable host.

Ensure `/var/lib/learn/data` exists and is writable by the service user:
```bash
mkdir -p /var/lib/learn/data/backups
chown -R learn:learn /var/lib/learn/data
```

### Step 3: Link Current Release and Start Service
```bash
ln -sfn /opt/learn/releases/v1.0.0 /opt/learn/current
cd /opt/learn/current

# Run with environment or systemd
CONFIG_PATH=/opt/learn/config.json node server.cjs
```

Minimal systemd unit (`/etc/systemd/system/learn-platform.service`):
```ini
[Service]
User=learn
WorkingDirectory=/opt/learn/current
Environment=NODE_ENV=production
Environment=CONFIG_PATH=/opt/learn/config.json
EnvironmentFile=/opt/learn/secrets.env
ExecStart=/usr/bin/node server.cjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Step 4: Verify Deployment Health
```bash
curl -f http://127.0.0.1:3000/healthz
# Expected output:
# {"status":"ok","version":"1.0.0","database":"connected","timestamp":"..."}
```

---

## 3. Database Persistence & Backup Runbook

The platform uses SQLite with Write-Ahead Logging (`WAL`) enabled.

### 3.1 Creating an Online Backup
Backups use SQLite's native `VACUUM INTO`, which guarantees atomic snapshots without locking concurrent active readers or writers:
```bash
node scripts/backup.cjs --data-dir /var/lib/learn/data
```
This generates:
- `/var/lib/learn/data/backups/learn-backup-<ISO-timestamp>.db`
- Companion SHA-256 metadata file: `<backup-path>.meta.json`

### 3.2 Restoring from Backup
```bash
node scripts/restore.cjs /var/lib/learn/data/backups/learn-backup-<timestamp>.db --data-dir /var/lib/learn/data
```
The restore command requires the cooperating service to be stopped: the service holds a per-database maintenance lock while running, and restore refuses an active or unrecoverable lock. Stop the service and verify no other process has the database open before restoring. An arbitrary external SQLite client cannot be detected reliably by the script. Without `--no-pre-backup`, it first creates a verified `VACUUM INTO` safety snapshot including committed WAL pages; a failed snapshot is a hard stop. It copies to a temporary file, validates it, removes stale target WAL/SHM files, atomically renames it, and validates the replacement. Use `--recover-stale-lock` only after confirming no service/process is using the database.

```bash
systemctl stop learn-platform
node scripts/restore.cjs /var/lib/learn/data/backups/learn-backup-<timestamp>.db --data-dir /var/lib/learn/data
systemctl start learn-platform
```

Do not restore over a running production database or use `--no-pre-backup` unless an equivalent operator snapshot is already verified.

---

## 4. Rollback Procedure

When an upgrade causes unexpected regressions or deployment failure:

### Step 1: Stop Active Service
```bash
systemctl stop learn-platform
```

### Step 2: Execute Automated Rollback
```bash
cd /opt/learn/current
node scripts/rollback.cjs --data-dir /var/lib/learn/data
```
This script automatically discovers the latest verified operator/deployment backup, verifies integrity, excludes temporary `pre-restore-safety-*` snapshots, and restores database state cleanly. Stop the service first as above; rollback uses the same maintenance-lock and safety-snapshot protections.

### Step 3: Revert Release Symlink
```bash
ln -sfn /opt/learn/releases/v0.9.0 /opt/learn/current
```

### Step 4: Restart Service & Confirm Health
```bash
systemctl start learn-platform
curl -f http://127.0.0.1:3000/healthz
```
Verify that the endpoint returns HTTP 200 with `status: "ok"` and `database: "connected"`.

---

The release package also contains `scripts/list_corrections.cjs` for the operator review queue. Run it against an approved disposable or stopped database; it prints correction content without reporter identity:

```bash
node scripts/list_corrections.cjs --db /var/lib/learn/data/learn.db
```

## 5. Reverse Proxy, TLS, and DNS



- The proxy must forward `X-Forwarded-Proto: https`. The server adds the `Secure` flag to the session cookie only when it sees an encrypted socket or that header.
- Example (Caddy, which obtains and renews the certificate automatically):
  ```
  learn.example.org {
      reverse_proxy 127.0.0.1:3000
  }
  ```
- Example (nginx, certificate managed separately):
  ```nginx
  location / {
      proxy_pass http://127.0.0.1:3000;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-Proto https;
      client_max_body_size 1m;
  }
  ```
- DNS: one `A` and/or `AAAA` record for the approved subdomain, pointing to the host. Each DNS or proxy change needs its own owner approval (decision D1). Other sites on the same proxy must not be touched.

## 6. OAuth Provider Setup (Google and GitHub)

The server includes real Google and GitHub adapters (`lib/oauth.cjs`): authorization-code flow with PKCE S256 and a single-use state that expires after 10 minutes and is bound to its provider. Creating the OAuth clients needs the owner's accounts and approval (ticket 58, decision D1).

Callback URLs (they must match exactly, including scheme and no trailing slash):
- Google: `https://<subdomain>/auth/google/callback`
- GitHub: `https://<subdomain>/auth/github/callback`

Google:
1. In Google Cloud Console, open **APIs & Services → OAuth consent screen**. Set the app name, support email and the authorized domain. Request only the `openid`, `email` and `profile` scopes. While the app is in *Testing*, only listed test users can sign in; publish it before opening sign-in to learners.
2. Open **Credentials → Create credentials → OAuth client ID**, application type **Web application**. Add the Google callback URL above under *Authorized redirect URIs*.
3. Put the client ID and secret into `secrets.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

GitHub:
1. In **Settings → Developer settings → OAuth Apps → New OAuth App**, set *Homepage URL* to `https://<subdomain>` and *Authorization callback URL* to the GitHub callback URL above.
2. Generate a client secret. Put the client ID and secret into `secrets.env` as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
3. The app requests no scopes, so it gets only the public profile. A learner without a public email signs in with an empty email field.

Behaviour to know:
- Google email is stored only when Google reports it as verified. Accounts are never merged by email. A second provider is attached only through the explicit link flow while signed in.
- Every provider failure (rejected code, timeout, malformed response) sends the learner back with `auth_error=provider_error`. A cancelled consent screen gives `auth_error=access_denied`. Tokens and provider responses are never logged or stored.
- After changing a secret, restart the service: `systemctl restart learn-platform`. To disable one provider, remove both of its variables and restart.
- At startup, look for `Warning: OAuth provider ... disabled` in the journal (`journalctl -u learn-platform`). It means `PUBLIC_ORIGIN` is not `https://`.

## 7. Pre-Production Checklist

Run these against the public origin (`https://<subdomain>`) before announcing it:

1. `curl -f https://<subdomain>/healthz` returns 200 with `"database":"connected"`.
2. `curl -s -o /dev/null -w '%{http_code}' https://<subdomain>/auth/test-provider` returns `404`, which shows the mock identity provider is unreachable.
3. Signing in sets a cookie with `HttpOnly; SameSite=Lax; Secure`.
4. `npm run backup` creates a backup, and a restore of that backup into a disposable `DATA_DIR` passes its integrity check.
5. The release directory contains no `.env`, `.pi/`, `.scratch/`, `learning-records/` or `archive/` (the packaging test enforces this for the tarball).
6. `curl -s -o /dev/null -w '%{redirect_url}\n' https://<subdomain>/auth/google` points to `accounts.google.com` with `code_challenge_method=S256` and `redirect_uri=https://<subdomain>/auth/google/callback`. The same check for `/auth/github` points to `github.com/login/oauth/authorize`. A redirect to `?auth_error=provider_error` means that provider is not configured.
7. Live Google and GitHub sign-in, including linking the second provider, are accepted separately under ticket 58. Fake-provider test results do not count as live evidence.
