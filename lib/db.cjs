'use strict';

const { assertSupportedNodeVersion } = require('./runtime.cjs');
assertSupportedNodeVersion();

// SQLite Persistence module for Users, Sessions, OAuth States, and Learning Progress
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

function validateUrlScheme(rawUrl, fieldName = 'URL') {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    throw new Error(`${fieldName} exceeds maximum allowed length of 2048 characters.`);
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (e) {
    throw new Error(`Invalid URL scheme: ${fieldName} must be a valid URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid URL scheme: ${fieldName} must use http or https protocol.`);
  }
  return trimmed;
}

function validateBoundedText(text, maxBytes = 4096, fieldName = 'text_notes') {
  if (!text) return '';
  const str = String(text);
  const bytes = Buffer.byteLength(str, 'utf8');
  if (bytes > maxBytes) {
    throw new Error(`${fieldName} exceeds maximum allowed length of ${maxBytes} bytes (found ${bytes} bytes).`);
  }
  return str;
}

function formatSubmissionRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    user_id: r.user_id,
    project_id: r.project_id,
    activity_id: r.project_id,
    revision: r.revision,
    content_revision: r.revision,
    assistance_mode: r.assistance_mode,
    selected_track: r.selected_track || null,
    repo_url: r.repo_url || '',
    report_url: r.report_url || '',
    text_notes: r.text_notes || '',
    evidence_status: r.evidence_status || 'self_reported',
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}

function initDb(dbPath) {
  let db;
  if (!dbPath || dbPath === ':memory:') {
    db = new DatabaseSync(':memory:');
  } else {
    const resolvedPath = path.resolve(dbPath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new DatabaseSync(resolvedPath);
  }

  // File-backed databases use WAL so online snapshots include committed WAL
  // pages and readers do not require a service restart.
  if (dbPath && dbPath !== ':memory:') {
    const journalMode = db.prepare('PRAGMA journal_mode = WAL').get();
    if (!journalMode || String(journalMode.journal_mode).toLowerCase() !== 'wal') {
      db.close();
      throw new Error('SQLite WAL mode could not be enabled for the file-backed database.');
    }
  }

  try {
    db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // ignore
  }

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      provider TEXT,
      provider_user_id TEXT,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT,
      name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, provider_user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      csrf_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      return_url TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'login',
      user_id TEXT,
      provider TEXT,
      code_verifier TEXT,
      browser_binding TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS progress (
      user_id TEXT NOT NULL,
      activity_id TEXT NOT NULL,
      draft_text TEXT NOT NULL DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, activity_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_tracks (
      user_id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      activity_id TEXT NOT NULL,
      content_revision TEXT NOT NULL,
      assistance_mode TEXT NOT NULL,
      answers TEXT NOT NULL,
      score REAL NOT NULL,
      passed INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_act ON quiz_attempts(user_id, activity_id);

    CREATE TABLE IF NOT EXISTS project_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      assistance_mode TEXT NOT NULL,
      selected_track TEXT,
      repo_url TEXT NOT NULL DEFAULT '',
      report_url TEXT NOT NULL DEFAULT '',
      text_notes TEXT NOT NULL DEFAULT '',
      evidence_status TEXT NOT NULL DEFAULT 'self_reported',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, project_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_project_submissions_user ON project_submissions(user_id, project_id);

    CREATE TABLE IF NOT EXISTS content_corrections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      day_id TEXT NOT NULL,
      lang TEXT NOT NULL,
      activity_id TEXT,
      edition_revision TEXT NOT NULL,
      revision_current INTEGER NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_content_corrections_user ON content_corrections(user_id);
    CREATE TABLE IF NOT EXISTS review_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      diagnostics_summary TEXT NOT NULL,
      recommended_plan TEXT NOT NULL,
      items TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_review_plans_user ON review_plans(user_id);

    CREATE TABLE IF NOT EXISTS diagnostic_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content_revision TEXT NOT NULL,
      assistance_mode TEXT NOT NULL,
      answers TEXT NOT NULL,
      diagnostics_summary TEXT NOT NULL,
      recommended_plan TEXT NOT NULL,
      items TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_user ON diagnostic_attempts(user_id, created_at);
  `);

  try {
    db.exec('ALTER TABLE users ADD COLUMN user_track TEXT DEFAULT NULL;');
  } catch {
    // Column may already exist
  }

  // Handle migrations for preexisting SQLite databases
  try {
    db.exec("ALTER TABLE oauth_states ADD COLUMN action TEXT NOT NULL DEFAULT 'login';");
  } catch {}
  try {
    db.exec("ALTER TABLE oauth_states ADD COLUMN user_id TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE oauth_states ADD COLUMN provider TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE oauth_states ADD COLUMN code_verifier TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE oauth_states ADD COLUMN browser_binding TEXT;");
  } catch {}
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN csrf_token TEXT;");
    const legacySessions = db.prepare('SELECT token FROM sessions WHERE csrf_token IS NULL').all();
    const updateCsrf = db.prepare('UPDATE sessions SET csrf_token = ? WHERE token = ?');
    for (const session of legacySessions) updateCsrf.run(crypto.randomBytes(32).toString('hex'), session.token);
  } catch {}

  return {
    rawDb: db,

    upsertUser({ provider, providerUserId, email, name }) {
      const now = new Date().toISOString();

      // Check if identity already exists in oauth_identities
      const existingIdentity = db.prepare('SELECT * FROM oauth_identities WHERE provider = ? AND provider_user_id = ?').get(provider, providerUserId);
      if (existingIdentity) {
        db.prepare('UPDATE oauth_identities SET email = ?, name = ?, updated_at = ? WHERE id = ?').run(email, name, now, existingIdentity.id);
        // users.email/name are NOT NULL; a missing provider email is stored as ''.
        db.prepare('UPDATE users SET email = ?, name = ?, updated_at = ? WHERE id = ?').run(email || '', name || '', now, existingIdentity.user_id);
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(existingIdentity.user_id);
        return {
          id: user.id,
          provider,
          provider_user_id: providerUserId,
          email: user.email,
          name: user.name,
          created_at: user.created_at,
          updated_at: now
        };
      }

      // Check legacy users table if row exists
      try {
        const legacyUser = db.prepare('SELECT * FROM users WHERE provider = ? AND provider_user_id = ?').get(provider, providerUserId);
        if (legacyUser) {
          const identId = crypto.randomUUID();
          db.prepare(`
            INSERT OR IGNORE INTO oauth_identities (id, user_id, provider, provider_user_id, email, name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(identId, legacyUser.id, provider, providerUserId, email, name, legacyUser.created_at, now);
          db.prepare('UPDATE users SET email = ?, name = ?, updated_at = ? WHERE id = ?').run(email || '', name || '', now, legacyUser.id);
          return {
            id: legacyUser.id,
            provider,
            provider_user_id: providerUserId,
            email,
            name,
            created_at: legacyUser.created_at,
            updated_at: now
          };
        }
      } catch {}

      // New user - strict no-silent-merge: do NOT match on email!
      const id = crypto.randomUUID();
      try {
        db.prepare(`
          INSERT INTO users (id, provider, provider_user_id, email, name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, provider, providerUserId, email || '', name || '', now, now);
      } catch {
        db.prepare(`
          INSERT INTO users (id, email, name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, email || '', name || '', now, now);
      }

      const identId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO oauth_identities (id, user_id, provider, provider_user_id, email, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(identId, id, provider, providerUserId, email, name, now, now);

      return {
        id,
        provider,
        provider_user_id: providerUserId,
        email,
        name,
        created_at: now,
        updated_at: now
      };
    },

    findUserByOAuthIdentity(provider, providerUserId) {
      const row = db.prepare(`
        SELECT u.id, u.email, u.name, u.created_at, u.updated_at, i.provider, i.provider_user_id
        FROM oauth_identities i
        JOIN users u ON i.user_id = u.id
        WHERE i.provider = ? AND i.provider_user_id = ?
      `).get(provider, providerUserId);
      return row || null;
    },

    getIdentitiesForUser(userId) {
      return db.prepare(`
        SELECT id, user_id, provider, provider_user_id, email, name, created_at, updated_at
        FROM oauth_identities
        WHERE user_id = ?
        ORDER BY created_at ASC
      `).all(userId);
    },

    linkOAuthIdentity({ userId, provider, providerUserId, email, name }) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const existingIdentity = db.prepare('SELECT * FROM oauth_identities WHERE provider = ? AND provider_user_id = ?').get(provider, providerUserId);
      if (existingIdentity) {
        if (existingIdentity.user_id === userId) {
          return { success: true, alreadyLinked: true };
        }
        // Conflict: Identity is already bound to another user
        return {
          success: false,
          conflict: true,
          conflictingUserId: existingIdentity.user_id
        };
      }

      const now = new Date().toISOString();
      const identId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO oauth_identities (id, user_id, provider, provider_user_id, email, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(identId, userId, provider, providerUserId, email || '', name || '', now, now);

      return { success: true, linked: true };
    },

    getUserById(id) {
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
    },

    createSession(userId, ttlMs = 7 * 24 * 3600 * 1000) {
      const token = crypto.randomBytes(32).toString('hex');
      const csrfToken = crypto.randomBytes(32).toString('hex');
      const now = Date.now();
      const expiresAt = now + ttlMs;
      const createdAt = new Date(now).toISOString();

      db.prepare(`
        INSERT INTO sessions (token, user_id, expires_at, csrf_token, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(token, userId, expiresAt, csrfToken, createdAt);

      return { token, user_id: userId, expires_at: expiresAt, csrf_token: csrfToken, created_at: createdAt };
    },

    getSession(token) {
      if (!token) return null;
      const stmt = db.prepare(`
        SELECT s.token, s.user_id, s.expires_at, s.csrf_token, s.created_at, u.email, u.name
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ?
      `);
      const session = stmt.get(token);
      if (!session) return null;
      if (session.expires_at <= Date.now()) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
        return null;
      }

      const identities = db.prepare(`
        SELECT provider, provider_user_id, email, name
        FROM oauth_identities
        WHERE user_id = ?
        ORDER BY created_at ASC
      `).all(session.user_id);
      session.identities = identities;
      session.provider = identities.length > 0 ? identities[0].provider : 'oauth';

      return session;
    },

    deleteSession(token) {
      if (!token) return;
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    },

    createOAuthState(state, ttlMs = 600000, returnUrl = '/', options = {}) {
      const now = Date.now();
      const expiresAt = now + ttlMs;
      const createdAt = new Date(now).toISOString();
      const action = (options && options.action) || 'login';
      const userId = (options && options.userId) || null;
      const provider = (options && options.provider) || null;
      const codeVerifier = (options && options.codeVerifier) || null;
      const browserBinding = (options && options.browserBinding) || null;

      db.prepare(`
        INSERT OR REPLACE INTO oauth_states (state, expires_at, return_url, action, user_id, provider, code_verifier, browser_binding, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(state, expiresAt, returnUrl, action, userId, provider, codeVerifier, browserBinding, createdAt);
    },

    consumeOAuthState(state) {
      if (!state) return null;
      const row = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state);
      if (!row) return null;
      db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
      if (row.expires_at <= Date.now()) {
        return null;
      }
      return row;
    },

    getProgress(userId, activityId) {
      return db.prepare('SELECT * FROM progress WHERE user_id = ? AND activity_id = ?').get(userId, activityId) || null;
    },

    getAllProgress(userId, dayId) {
      if (dayId) {
        return db.prepare('SELECT * FROM progress WHERE user_id = ? AND activity_id LIKE ?').all(userId, `${dayId}%`);
      }
      return db.prepare('SELECT * FROM progress WHERE user_id = ?').all(userId);
    },

    saveProgress({ userId, activityId, draftText = '', completed = 0, expectedVersion = null }) {
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT * FROM progress WHERE user_id = ? AND activity_id = ?').get(userId, activityId);

      if (existing) {
        if (expectedVersion !== null && expectedVersion !== 0 && expectedVersion !== existing.version) {
          return {
            success: false,
            conflict: true,
            currentVersion: existing.version,
            currentProgress: existing
          };
        }
        const newVersion = existing.version + 1;
        db.prepare(`
          UPDATE progress
          SET draft_text = ?, completed = ?, version = ?, updated_at = ?
          WHERE user_id = ? AND activity_id = ?
        `).run(draftText, completed ? 1 : 0, newVersion, now, userId, activityId);

        return {
          success: true,
          version: newVersion,
          updated_at: now
        };
      }

      // New entry
      db.prepare(`
        INSERT INTO progress (user_id, activity_id, draft_text, completed, version, updated_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(userId, activityId, draftText, completed ? 1 : 0, now);

      return {
        success: true,
        version: 1,
        updated_at: now
      };
    },

    getUserTrack(userId) {
      if (!userId) return null;
      const row = db.prepare('SELECT track_id FROM user_tracks WHERE user_id = ?').get(userId);
      if (row) return row.track_id;
      try {
        const uRow = db.prepare('SELECT user_track FROM users WHERE id = ?').get(userId);
        if (uRow && uRow.user_track) return uRow.user_track;
      } catch {}
      return null;
    },

    setUserTrack(userId, trackId) {
      if (!userId || !trackId) return false;
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT user_id FROM user_tracks WHERE user_id = ?').get(userId);
      if (existing) {
        db.prepare('UPDATE user_tracks SET track_id = ?, updated_at = ? WHERE user_id = ?').run(trackId, now, userId);
      } else {
        db.prepare('INSERT INTO user_tracks (user_id, track_id, updated_at) VALUES (?, ?, ?)').run(userId, trackId, now);
      }
      try {
        db.prepare('UPDATE users SET user_track = ?, updated_at = ? WHERE id = ?').run(trackId, now, userId);
      } catch {}
      return true;
    },

    recordQuizAttempt({ userId, activityId, contentRevision, assistanceMode, answers, score, passed, id = null, createdAt = null }) {
      if (assistanceMode !== 'independent' && assistanceMode !== 'agent_assisted') {
        throw new Error(`Invalid assistance mode: ${assistanceMode}. Must be 'independent' or 'agent_assisted'.`);
      }

      const attemptId = id || crypto.randomUUID();
      const now = createdAt || new Date().toISOString();
      const answersJson = typeof answers === 'string' ? answers : JSON.stringify(answers || {});
      const passedInt = passed ? 1 : 0;
      const scoreNum = Number(score) || 0;

      db.prepare(`
        INSERT INTO quiz_attempts (id, user_id, activity_id, content_revision, assistance_mode, answers, score, passed, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(attemptId, userId, activityId, contentRevision, assistanceMode, answersJson, scoreNum, passedInt, now);

      return {
        id: attemptId,
        user_id: userId,
        activity_id: activityId,
        content_revision: contentRevision,
        assistance_mode: assistanceMode,
        answers: (() => {
          if (typeof answers !== 'string') return answers;
          try {
            return JSON.parse(answers);
          } catch {
            return {};
          }
        })(),
        score: scoreNum,
        passed: passedInt,
        created_at: now
      };
    },

    getQuizAttempts(userId, activityId = null) {
      let rows;
      if (activityId) {
        rows = db.prepare('SELECT * FROM quiz_attempts WHERE user_id = ? AND activity_id = ? ORDER BY created_at DESC').all(userId, activityId);
      } else {
        rows = db.prepare('SELECT * FROM quiz_attempts WHERE user_id = ? ORDER BY created_at DESC').all(userId);
      }

      return rows.map(r => {
        let parsedAnswers = {};
        try {
          parsedAnswers = JSON.parse(r.answers);
        } catch {
          parsedAnswers = {};
        }
        return {
          id: r.id,
          user_id: r.user_id,
          activity_id: r.activity_id,
          content_revision: r.content_revision,
          assistance_mode: r.assistance_mode,
          answers: parsedAnswers,
          score: r.score,
          passed: !!r.passed,
          created_at: r.created_at
        };
      });
    },

    getQuizAttemptById(attemptId) {
      const r = db.prepare('SELECT * FROM quiz_attempts WHERE id = ?').get(attemptId);
      if (!r) return null;
      let parsedAnswers = {};
      try {
        parsedAnswers = JSON.parse(r.answers);
      } catch {}
      return {
        id: r.id,
        user_id: r.user_id,
        activity_id: r.activity_id,
        content_revision: r.content_revision,
        assistance_mode: r.assistance_mode,
        answers: parsedAnswers,
        score: r.score,
        passed: !!r.passed,
        created_at: r.created_at
      };
    },

    getUserMasterySummary(userId, activityId, currentRevision) {
      const attempts = this.getQuizAttempts(userId, activityId);
      const progress = this.getProgress(userId, activityId);
      const selfReportedCompleted = !!(progress && progress.completed);

      let hasIndependentPass = false;
      let hasAgentAssistedPass = false;
      let staleAttemptsCount = 0;

      const annotatedAttempts = attempts.map(attempt => {
        const isStale = !!(currentRevision && attempt.content_revision !== currentRevision);
        if (isStale) {
          staleAttemptsCount++;
        } else if (attempt.passed) {
          if (attempt.assistance_mode === 'independent') {
            hasIndependentPass = true;
          } else if (attempt.assistance_mode === 'agent_assisted') {
            hasAgentAssistedPass = true;
          }
        }
        return {
          ...attempt,
          is_stale: isStale
        };
      });

      return {
        user_id: userId,
        activity_id: activityId,
        current_revision: currentRevision,
        self_reported_completed: selfReportedCompleted,
        has_independent_pass: hasIndependentPass,
        has_agent_assisted_pass: hasAgentAssistedPass,
        stale_attempts_count: staleAttemptsCount,
        attempts: annotatedAttempts
      };
    },

    saveProjectSubmission({ userId, projectId, revision, contentRevision, assistanceMode, selectedTrack, repoUrl = '', reportUrl = '', textNotes = '', id = null }) {
      if (!userId) throw new Error('userId is required');
      if (!projectId) throw new Error('projectId is required');

      const rev = revision || contentRevision || '1.0.0';
      if (assistanceMode !== 'independent' && assistanceMode !== 'agent_assisted') {
        throw new Error(`Invalid assistance mode: ${assistanceMode}. Must be 'independent' or 'agent_assisted'.`);
      }

      const safeRepoUrl = validateUrlScheme(repoUrl, 'repo_url');
      const safeReportUrl = validateUrlScheme(reportUrl, 'report_url');
      const safeNotes = validateBoundedText(textNotes, 4096, 'text_notes');

      if (!safeRepoUrl && !safeReportUrl && !safeNotes) {
        throw new Error('Project submission must include at least a repoUrl, reportUrl, or textNotes.');
      }

      const track = (selectedTrack && typeof selectedTrack === 'string') ? selectedTrack.trim() : null;
      const now = new Date().toISOString();

      const existing = db.prepare('SELECT * FROM project_submissions WHERE user_id = ? AND project_id = ?').get(userId, projectId);
      if (existing) {
        db.prepare(`
          UPDATE project_submissions
          SET revision = ?, assistance_mode = ?, selected_track = ?, repo_url = ?, report_url = ?, text_notes = ?, updated_at = ?
          WHERE id = ?
        `).run(rev, assistanceMode, track, safeRepoUrl, safeReportUrl, safeNotes, now, existing.id);

        const updatedRow = db.prepare('SELECT * FROM project_submissions WHERE id = ?').get(existing.id);
        return formatSubmissionRow(updatedRow);
      }

      const newId = id || crypto.randomUUID();
      // Crucial invariant: evidence_status defaults to and remains 'self_reported' for user submissions
      const evidenceStatus = 'self_reported';

      db.prepare(`
        INSERT INTO project_submissions (id, user_id, project_id, revision, assistance_mode, selected_track, repo_url, report_url, text_notes, evidence_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, userId, projectId, rev, assistanceMode, track, safeRepoUrl, safeReportUrl, safeNotes, evidenceStatus, now, now);

      const createdRow = db.prepare('SELECT * FROM project_submissions WHERE id = ?').get(newId);
      return formatSubmissionRow(createdRow);
    },

    getProjectSubmission(userId, projectId) {
      if (!userId || !projectId) return null;
      const row = db.prepare('SELECT * FROM project_submissions WHERE user_id = ? AND project_id = ?').get(userId, projectId);
      return formatSubmissionRow(row);
    },

    getAllProjectSubmissions(userId) {
      if (!userId) return [];
      const rows = db.prepare('SELECT * FROM project_submissions WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
      return rows.map(formatSubmissionRow);
    },

    getProjectMasterySummary(userId, projectId, currentRevision) {
      const submission = this.getProjectSubmission(userId, projectId);
      if (!submission) {
        return {
          user_id: userId,
          project_id: projectId,
          current_revision: currentRevision,
          submission: null,
          is_stale: false,
          evidence_status: null
        };
      }

      const isStale = !!(currentRevision && submission.revision !== currentRevision);
      return {
        user_id: userId,
        project_id: projectId,
        current_revision: currentRevision,
        submission,
        is_stale: isStale,
        evidence_status: submission.evidence_status
      };
    },

    setSubmissionEvidenceStatus(userId, projectId, status) {
      const allowed = ['self_reported', 'verified_check', 'independently_reviewed'];
      if (!allowed.includes(status)) {
        throw new Error(`Invalid evidence status: ${status}. Must be one of: ${allowed.join(', ')}`);
      }
      const existing = db.prepare('SELECT * FROM project_submissions WHERE user_id = ? AND project_id = ?').get(userId, projectId);
      if (!existing) {
        throw new Error('Project submission not found.');
      }
      const now = new Date().toISOString();
      db.prepare('UPDATE project_submissions SET evidence_status = ?, updated_at = ? WHERE id = ?').run(status, now, existing.id);
      return formatSubmissionRow(db.prepare('SELECT * FROM project_submissions WHERE id = ?').get(existing.id));
    },

    saveReviewPlan({ userId, diagnosticsSummary, recommendedPlan, items, id = null, updatedAt = null }) {
      if (!userId) {
        throw new Error('userId is required for saveReviewPlan');
      }
      const now = updatedAt || new Date().toISOString();
      const existing = db.prepare('SELECT * FROM review_plans WHERE user_id = ?').get(userId);
      const planId = id || (existing ? existing.id : crypto.randomUUID());
      const attemptId = crypto.randomUUID();

      const summaryJson = typeof diagnosticsSummary === 'string'
        ? diagnosticsSummary
        : JSON.stringify(diagnosticsSummary || {});
      const planJson = typeof recommendedPlan === 'string'
        ? recommendedPlan
        : JSON.stringify(recommendedPlan || {});
      const itemsJson = typeof items === 'string'
        ? items
        : JSON.stringify(items || []);
      const parseInput = (value, fallback) => {
        if (typeof value !== 'string') return value || fallback;
        try {
          return JSON.parse(value);
        } catch {
          throw new Error('Review plan JSON fields must contain valid JSON');
        }
      };
      const summary = parseInput(diagnosticsSummary, {});
      const plan = parseInput(recommendedPlan, {});
      const parsedItems = parseInput(items, []);
      const attemptAnswers = JSON.stringify(summary.results || {});
      const contentRevision = String(summary.content_revision || 'unknown');
      const assistanceMode = String(summary.assistance_mode || 'independent');

      db.exec('BEGIN');
      try {
        db.prepare(`
          INSERT INTO diagnostic_attempts
            (id, user_id, content_revision, assistance_mode, answers, diagnostics_summary, recommended_plan, items, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(attemptId, userId, contentRevision, assistanceMode, attemptAnswers, summaryJson, planJson, itemsJson, now);

        if (existing) {
          db.prepare(`
            UPDATE review_plans
            SET diagnostics_summary = ?, recommended_plan = ?, items = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
          `).run(summaryJson, planJson, itemsJson, now, planId, userId);
        } else {
          db.prepare(`
            INSERT INTO review_plans (id, user_id, diagnostics_summary, recommended_plan, items, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(planId, userId, summaryJson, planJson, itemsJson, now);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      return {
        id: planId,
        attempt_id: attemptId,
        user_id: userId,
        diagnostics_summary: summary,
        recommended_plan: plan,
        items: parsedItems,
        updated_at: now
      };
    },

    getDiagnosticAttempts(userId) {
      if (!userId) return [];
      const rows = db.prepare('SELECT * FROM diagnostic_attempts WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(userId);
      return rows.map(row => {
        let answers = {};
        let summary = {};
        let plan = {};
        let items = [];
        try { answers = JSON.parse(row.answers); } catch {}
        try { summary = JSON.parse(row.diagnostics_summary); } catch {}
        try { plan = JSON.parse(row.recommended_plan); } catch {}
        try { items = JSON.parse(row.items); } catch {}
        return {
          id: row.id,
          user_id: row.user_id,
          content_revision: row.content_revision,
          assistance_mode: row.assistance_mode,
          answers,
          diagnostics_summary: summary,
          recommended_plan: plan,
          items,
          created_at: row.created_at
        };
      });
    },

    getReviewPlan(userId) {
      if (!userId) return null;
      const row = db.prepare('SELECT * FROM review_plans WHERE user_id = ?').get(userId);
      if (!row) return null;

      let summary = {};
      let plan = {};
      let items = [];

      try { summary = JSON.parse(row.diagnostics_summary); } catch {}
      try { plan = JSON.parse(row.recommended_plan); } catch {}
      try { items = JSON.parse(row.items); } catch {}

      return {
        id: row.id,
        user_id: row.user_id,
        diagnostics_summary: summary,
        recommended_plan: plan,
        items: items,
        updated_at: row.updated_at
      };
    },

    getPortableLearningExport(userId) {
      if (!userId) throw new Error('userId is required for export');
      const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId);
      if (!user) throw new Error('User not found');

      const progress = this.getAllProgress(userId).map(row => ({
        activity_id: row.activity_id,
        draft_text: row.draft_text,
        completed: !!row.completed,
        version: row.version,
        updated_at: row.updated_at
      }));
      const quizAttempts = this.getQuizAttempts(userId).map(attempt => ({
        id: attempt.id,
        activity_id: attempt.activity_id,
        content_revision: attempt.content_revision,
        assistance_mode: attempt.assistance_mode,
        answers: attempt.answers,
        score: attempt.score,
        passed: attempt.passed,
        result_meaning: attempt.passed ? 'passed_at_submission_revision' : 'not_passed_at_submission_revision',
        created_at: attempt.created_at
      }));
      const submissions = this.getAllProjectSubmissions(userId).map(row => ({
        id: row.id,
        project_id: row.project_id,
        revision: row.revision,
        assistance_mode: row.assistance_mode,
        selected_track: row.selected_track,
        repo_url: row.repo_url,
        report_url: row.report_url,
        text_notes: row.text_notes,
        evidence_status: row.evidence_status,
        evidence_label: row.evidence_status === 'self_reported'
          ? 'Self-reported; not independently verified'
          : row.evidence_status === 'verified_check'
            ? 'Deterministic verification check'
            : 'Independently reviewed evidence',
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
      const reviewPlan = this.getReviewPlan(userId);
      const diagnosticAttempts = this.getDiagnosticAttempts(userId);
      const assistanceDeclarations = [
        ...quizAttempts.map(row => ({
          source_type: 'quiz_attempt', source_id: row.id, activity_id: row.activity_id,
          content_revision: row.content_revision, assistance_mode: row.assistance_mode,
          declared_at: row.created_at
        })),
        ...submissions.map(row => ({
          source_type: 'project_submission', source_id: row.id, project_id: row.project_id,
          content_revision: row.revision, assistance_mode: row.assistance_mode,
          declared_at: row.updated_at
        })),
        ...diagnosticAttempts.map(row => ({
          source_type: 'diagnostic_attempt', source_id: row.id,
          content_revision: row.content_revision, assistance_mode: row.assistance_mode,
          declared_at: row.created_at
        }))
      ];
      const revisionMap = new Map();
      for (const row of [...quizAttempts, ...submissions, ...diagnosticAttempts]) {
        const revision = row.content_revision || row.revision;
        if (!revision) continue;
        const key = `${row.activity_id || row.project_id || row.source_id || 'record'}:${revision}`;
        revisionMap.set(key, {
          identifier: row.activity_id || row.project_id || row.source_id,
          revision,
          source_type: row.activity_id ? 'activity_record' : row.project_id ? 'project_submission' : 'diagnostic_attempt'
        });
      }

      return {
        format: '90-day-ai-learning.portable-export',
        format_version: 1,
        exported_at: new Date().toISOString(),
        documentation: {
          identifiers: 'activity_id and project_id identify curriculum records; id identifies an exported attempt or submission only.',
          revisions: 'content_revision/revision identifies the content version at the time of the record.',
          result_meaning: 'passed is the deterministic result at the submitted revision; it is not a claim of independent work unless assistance_mode is independent.',
          evidence_labels: 'self_reported means learner-provided evidence and is not an independent verification.',
          omissions: 'Session cookies, OAuth/provider identifiers, provider tokens, credentials, and other users records are never exported.'
        },
        account: { name: user.name, email: user.email },
        records: {
          progress,
          quiz_attempts: quizAttempts,
          assistance_declarations: assistanceDeclarations,
          project_submissions: submissions,
          review_plans: reviewPlan ? [{
            id: reviewPlan.id,
            diagnostics_summary: reviewPlan.diagnostics_summary,
            recommended_plan: reviewPlan.recommended_plan,
            items: reviewPlan.items,
            updated_at: reviewPlan.updated_at
          }] : [],
          diagnostic_attempts: diagnosticAttempts.map(row => ({
            id: row.id,
            content_revision: row.content_revision,
            assistance_mode: row.assistance_mode,
            answers: row.answers,
            diagnostics_summary: row.diagnostics_summary,
            recommended_plan: row.recommended_plan,
            items: row.items,
            created_at: row.created_at
          })),
          content_corrections: this.listUserCorrections(userId),
          revisions: [...revisionMap.values()],
          track_preference: this.getUserTrack(userId) ? { track_id: this.getUserTrack(userId) } : null
        }
      };
    },

    deleteLearningRecords(userId) {
      if (!userId) throw new Error('userId is required');
      if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
        throw new Error('User not found');
      }
      const tables = ['progress', 'user_tracks', 'quiz_attempts', 'project_submissions', 'review_plans', 'diagnostic_attempts', 'content_corrections'];
      const deleted = [];
      try {
        db.exec('BEGIN IMMEDIATE');
        for (const table of tables) {
          const result = db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
          if (result.changes > 0) deleted.push(table);
        }
        db.prepare('UPDATE users SET user_track = NULL, updated_at = ? WHERE id = ?').run(new Date().toISOString(), userId);
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        throw error;
      }
      return {
        success: true,
        account_retained: true,
        deleted,
        already_empty: deleted.length === 0
      };
    },

    // Learner-reported content corrections (spec US59).
    createContentCorrection({ userId, dayId, lang, activityId, editionRevision, revisionCurrent, description }) {
      const row = {
        id: crypto.randomUUID(),
        day_id: dayId,
        lang,
        activity_id: activityId || null,
        edition_revision: editionRevision,
        revision_current: Boolean(revisionCurrent),
        description,
        status: 'open',
        created_at: new Date().toISOString()
      };
      db.prepare(`
        INSERT INTO content_corrections (id, user_id, day_id, lang, activity_id, edition_revision, revision_current, description, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(row.id, userId, row.day_id, row.lang, row.activity_id, row.edition_revision,
        row.revision_current ? 1 : 0, row.description, row.status, row.created_at);
      return row;
    },

    listUserCorrections(userId) {
      return db.prepare('SELECT * FROM content_corrections WHERE user_id = ? ORDER BY created_at, id').all(userId).map(publicCorrection);
    },

    // Maintainer view: no reporter identity leaves the database.
    listOpenCorrections() {
      return db.prepare("SELECT * FROM content_corrections WHERE status = 'open' ORDER BY day_id, lang, created_at").all().map(publicCorrection);
    },

    deleteReviewPlan(userId) {
      if (!userId) return;
      db.prepare('DELETE FROM review_plans WHERE user_id = ?').run(userId);
    }
  };
}

function publicCorrection(row) {
  return {
    id: row.id,
    day_id: row.day_id,
    lang: row.lang,
    activity_id: row.activity_id,
    edition_revision: row.edition_revision,
    revision_current: Boolean(row.revision_current),
    description: row.description,
    status: row.status,
    created_at: row.created_at
  };
}

module.exports = { initDb };
