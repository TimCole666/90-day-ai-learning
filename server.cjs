// Minimal coherent application server for 90-Day AI Curriculum & Legacy Portal
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { assertSupportedNodeVersion } = require('./lib/runtime.cjs');
try {
  assertSupportedNodeVersion();
} catch (error) {
  console.error(`FATAL: ${error.message}`);
  process.exit(1);
}
const {
  acquireDatabaseLock,
  readConfigFile,
  resolveDatabasePath
} = require('./lib/database-maintenance.cjs');
const { initDb } = require('./lib/db.cjs');
const { buildOAuthAdapters } = require('./lib/oauth.cjs');

const ROOT = __dirname;
const SUPPORTED_LANGS = ['zh-Hans', 'zh-Hant', 'en', 'ja'];
const DEFAULT_LANG = 'zh-Hans';
const VALID_TRACKS = ['claude-code', 'codex', 'pi-agent', 'deepseek-harness'];
const DEFAULT_TRACK = 'claude-code';

function loadConfig() {
  const explicitNodeEnv = process.env.NODE_ENV;
  const envVal = explicitNodeEnv || 'development';
  let fileConfig = {};
  const explicitConfigPath = process.env.CONFIG_PATH;

  if (explicitConfigPath) {
    if (!fs.existsSync(explicitConfigPath)) {
      console.error(`FATAL: Configuration file not found at ${explicitConfigPath}`);
      process.exit(1);
    }
    try {
      fileConfig = readConfigFile(explicitConfigPath);
    } catch (error) {
      console.error(`FATAL: ${error.message}`);
      process.exit(1);
    }
  }

  const config = {
    ...fileConfig,
    env: explicitNodeEnv || fileConfig.env || envVal,
    port: process.env.PORT
      ? parseInt(process.env.PORT, 10)
      : (fileConfig.port || 3000),
    host: process.env.HOST || fileConfig.host || '127.0.0.1',
    dataDir: process.env.DATA_DIR || fileConfig.dataDir || path.join(ROOT, 'data'),
    // Session cookies are server-side random tokens; this value remains a
    // production startup guard and is never read from a config file.
    sessionSecret: process.env.SESSION_SECRET || ''
  };

  // An explicit NODE_ENV always wins; notably, production cannot be
  // downgraded by a CONFIG_PATH file.
  if (explicitNodeEnv === 'production') config.env = 'production';

  if (config.env === 'production' && !config.sessionSecret.trim()) {
    console.error('FATAL: Missing required configuration: SESSION_SECRET must be set in production mode.');
    process.exit(1);
  }

  return config;
}

const config = loadConfig();
const dbPath = resolveDatabasePath({ rootDir: ROOT, env: process.env, config });
let releaseDatabaseLock = () => {};
try {
  releaseDatabaseLock = acquireDatabaseLock(dbPath, 'server');
} catch (error) {
  console.error(`FATAL: ${error.message}`);
  process.exit(1);
}

// The mock identity provider (/auth/test-provider and mock-code-* callbacks)
// exists only for local development and automated tests. It requires BOTH a
// non-production environment AND an explicit opt-in: the AUTH_ADAPTER=test
// environment variable or the enableTestAuthProvider config flag. Because the
// production check is env-based, shipping enableTestAuthProvider in
// config.production.json cannot enable it — production only allows real
// providers to be configured.
const testProviderEnabled = config.env !== 'production' &&
  (process.env.AUTH_ADAPTER === 'test' || config.enableTestAuthProvider === true);

// Real Google/GitHub adapters (D6). A provider is configured only when its
// client credentials and PUBLIC_ORIGIN are all present; in production the
// origin must be https://. The mock provider keeps precedence whenever it is
// enabled, so local tests are unaffected.
const oauth = buildOAuthAdapters({ env: process.env, isProduction: config.env === 'production' });
for (const warning of oauth.warnings) console.warn(`Warning: ${warning}`);

const db = (() => {
  try {
    return initDb(dbPath);
  } catch (error) {
    releaseDatabaseLock();
    console.error(`FATAL: Database initialization failed: ${error.message}`);
    process.exit(1);
  }
})();

function oauthRedirectUri(provider) {
  return `${oauth.publicOrigin}/auth/${provider}/callback`;
}

const OAUTH_BIND_COOKIE = 'oauth_bind';
const oauthBindSecure = String(oauth.publicOrigin || '').startsWith('https:') || config.env === 'production' ? '; Secure' : '';

function hashBinding(nonce) {
  return crypto.createHash('sha256').update(nonce).digest('hex');
}

// Clears the browser-binding cookie once a real-provider flow completes.
const OAUTH_BIND_CLEAR = `${OAUTH_BIND_COOKIE}=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0${oauthBindSecure}`;

// Mints a single-use, provider-bound OAuth state and redirects either to the
// real provider's authorize endpoint with a PKCE S256 challenge, or to the
// mock provider when it is enabled. Real-provider states are also bound to
// the starting browser through a short-lived cookie (blocks login CSRF).
function issueOAuthRedirect(res, provider, returnTo, stateOpts, adapter) {
  const state = crypto.randomUUID();
  if (adapter) {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const bindNonce = crypto.randomBytes(32).toString('base64url');
    db.createOAuthState(state, 600000, returnTo, {
      ...stateOpts, provider, codeVerifier, browserBinding: hashBinding(bindNonce)
    });
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    res.writeHead(302, {
      'Set-Cookie': `${OAUTH_BIND_COOKIE}=${bindNonce}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=600${oauthBindSecure}`,
      Location: adapter.authorizeUrl({ state, codeChallenge, redirectUri: oauthRedirectUri(provider) })
    });
  } else {
    db.createOAuthState(state, 600000, returnTo, { ...stateOpts, provider });
    const linkParam = stateOpts.action === 'link' ? '&action=link' : '';
    res.writeHead(302, { Location: `/auth/test-provider?provider=${provider}${linkParam}&state=${encodeURIComponent(state)}` });
  }
  res.end();
}

// Appends one query parameter to a same-site path that may already carry a query.
function withQueryParam(url, key, value) {
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${value}`;
}

// Session cookies are always Secure in production; elsewhere only when the
// request itself arrived over https.
function sessionSecureFlag(req) {
  const isSecure = config.env === 'production'
    || req.socket.encrypted
    || req.headers['x-forwarded-proto'] === 'https';
  return isSecure ? '; Secure' : '';
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Only same-site paths survive. Control characters and backslashes are
// rejected outright: browsers strip tab/newline and treat "\" as "/", which
// turns "/\t/evil" into "//evil", and a newline in a Location header throws.
function sanitizeReturnTo(raw) {
  const fallback = `/${DEFAULT_LANG}/day-01`;
  if (!raw || typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/') || /[\x00-\x1f\x7f\\]/.test(raw)) return fallback;
  try {
    const probe = new URL(raw, 'http://same-origin.invalid');
    if (probe.origin !== 'http://same-origin.invalid') return fallback;
  } catch {
    return fallback;
  }
  return raw;
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts.shift().trim();
      if (key) {
        list[key] = decodeURIComponent(parts.join('='));
      }
    });
  }
  return list;
}

function getSessionFromReq(req) {
  const cookies = parseCookies(req);
  const sid = cookies.sid;
  if (!sid) return null;
  return db.getSession(sid);
}

function requireCsrf(req, session) {
  const supplied = req.headers['x-csrf-token'];
  return typeof supplied === 'string' && supplied.length > 0 && supplied === session.csrf_token;
}

function renderCsrfMeta(session) {
  return session ? `<meta name="csrf-token" content="${escapeHtml(session.csrf_token)}">` : '';
}

function renderLogoutForm(session, label) {
  return `<form class="logout-form" action="/auth/logout" method="post"><input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}"><button class="btn-logout" type="submit">${escapeHtml(label)}</button></form>`;
}

const ACCOUNT_COPY = {
  'zh-Hans': { title: '删除个人学习记录', intro: '此操作会删除您的学习记录，但保留登录账户身份。', scope: '将删除：进度、测验尝试、项目提交、诊断尝试、复习计划、工具轨道选择和内容更正报告。', backup: '运行备份可能在备份保留期内继续包含这些记录；恢复策略会在备份轮换或按运营流程处理时移除它们，不承诺历史备份即时彻底擦除。', checkbox: '我确认删除上述全部学习记录（账户身份保留）。', phrase: '请输入 DELETE MY LEARNING RECORDS', button: '永久删除学习记录', done: '学习记录已删除。账户身份仍保留。', cancel: '取消' },
  'zh-Hant': { title: '刪除個人學習記錄', intro: '此操作會刪除您的學習記錄，但保留登入帳戶身分。', scope: '將刪除：進度、測驗嘗試、專案提交、診斷嘗試、複習計畫、工具軌道選擇和內容更正回報。', backup: '執行中的備份可能在備份保留期內繼續包含這些記錄；恢復策略會在備份輪換或依營運流程處理時移除它們，不承諾歷史備份即時徹底擦除。', checkbox: '我確認刪除上述全部學習記錄（帳戶身分保留）。', phrase: '請輸入 DELETE MY LEARNING RECORDS', button: '永久刪除學習記錄', done: '學習記錄已刪除。帳戶身分仍保留。', cancel: '取消' },
  en: { title: 'Delete personal learning records', intro: 'This deliberately removes your learning records while retaining your account identity.', scope: 'Records removed: progress, quiz attempts, project submissions, diagnostic attempts, review plans, selected tool track, and content correction reports.', backup: 'Running backups may retain copies during their retention window. The restore/rotation process removes records according to the operational retention policy; this does not promise instant erasure from every historical backup.', checkbox: 'I confirm deletion of all records listed above (account identity retained).', phrase: 'Type DELETE MY LEARNING RECORDS', button: 'Permanently delete learning records', done: 'Learning records deleted. Your account identity remains.', cancel: 'Cancel' },
  ja: { title: '個人の学習記録を削除', intro: 'この操作は学習記録を意図的に削除しますが、ログイン用アカウントの本人情報は保持します。', scope: '削除対象：進捗、クイズ試行、プロジェクト提出、診断試行、復習計画、選択したツールトラック、内容の修正報告。', backup: '実行中のバックアップには保持期間中コピーが残る場合があります。復元・ローテーション処理は運用保持方針に従って削除します。すべての過去バックアップから即時消去されるとは約束しません。', checkbox: '上記すべての学習記録を削除することを確認します（アカウント本人情報は保持）。', phrase: 'DELETE MY LEARNING RECORDS と入力', button: '学習記録を完全に削除', done: '学習記録を削除しました。アカウント本人情報は保持されています。', cancel: 'キャンセル' }
};

// Interface strings for the shared page shell and for labels that have no home
// in the per-page content dictionaries. Every locale carries every key.
const UI_COPY = {
  en: {
    pager_label: 'Day navigation',
    skip: 'Skip to content', nav_label: 'Main', footer_nav_label: 'Site', lang_label: 'Language',
    tagline: 'A project-based AI curriculum in four languages.',
    nav_calendar: 'Calendar', nav_agent_track: 'Agent tools', nav_diagnostics: 'Diagnostics', nav_export: 'Export',
    account: 'Account', sign_in: 'Sign in', sign_out: 'Sign out', back: 'Back to Day 01',
    sign_in_required: 'Sign in to manage your learning records.',
    on_this_page: 'On this page', prev_day: 'Previous', next_day: 'Next', all_days: 'All 90 days',
    minutes_short: '{n} min', hours: '{n} hours', minutes: '{n} minutes', bytes: 'bytes',
    calendar_kicker: 'Curriculum ledger', active_minutes: '{n} active minutes',
    block: 'Block {n}', days_range: 'Days {start}–{end}', day_number: 'Day {n}',
    status_legend: 'Status', none: 'None', baseline: 'Baseline',
    calendar_note: '90 study days × 480 active minutes = 43,200 active minutes (720 hours). Days that are not finished stay “planned” under the Course Readiness Gate.',
    track_kicker: 'Agent engineering', track_selection: 'Track selection',
    seven_step_method: '7-step method', agent_check: 'Agent-assisted engineering check',
    diag_mode: 'Mode', diag_agent_mode: 'Agent-assisted practice', question_n: 'Question {n}',
    diag_score: 'Score', diag_correct: '{correct}/{total} correct',
    skip_approved: 'Demonstrated skip approved', skip_not_certified: 'Skip not certified',
    scheduled_into: 'Scheduled into', review_budget_day: 'Day 07 weekly review budget',
    allocated: '{used} / {limit} min allocated',
    hours_kept: '720 mandatory hours kept:', hours_kept_detail: 'review time comes from planned review days and never silently adds required course hours.'
  },
  'zh-Hans': {
    pager_label: '学习日导航',
    skip: '跳到正文', nav_label: '主导航', footer_nav_label: '站点导航', lang_label: '语言',
    tagline: '以项目为驱动、提供四种语言的 AI 课程。',
    nav_calendar: '课程日历', nav_agent_track: 'Agent 工具', nav_diagnostics: '诊断', nav_export: '导出',
    account: '账户', sign_in: '登录', sign_out: '退出登录', back: '返回第 1 天',
    sign_in_required: '请先登录，再管理你的学习记录。',
    on_this_page: '本页内容', prev_day: '上一天', next_day: '下一天', all_days: '全部 90 天',
    minutes_short: '{n} 分钟', hours: '{n} 小时', minutes: '{n} 分钟', bytes: '字节',
    calendar_kicker: '课程台账', active_minutes: '{n} 有效学习分钟',
    block: '第 {n} 单元', days_range: '第 {start}–{end} 天', day_number: '第 {n} 天',
    status_legend: '状态', none: '无', baseline: '起点',
    calendar_note: '90 个学习日 × 每天 480 有效分钟 = 43,200 有效分钟（720 小时）。尚未完成的学习日依据 Course Readiness Gate 保持“规划中”状态。',
    track_kicker: 'Agent 工程', track_selection: '选择工具路线',
    seven_step_method: '七步法', agent_check: 'Agent 协同工程检查',
    diag_mode: '模式', diag_agent_mode: 'Agent 协同练习', question_n: '第 {n} 题',
    diag_score: '得分', diag_correct: '答对 {correct}/{total}',
    skip_approved: '已证明掌握，可跳过', skip_not_certified: '未认证跳过',
    scheduled_into: '已排入', review_budget_day: '第 7 天每周复习预算',
    allocated: '已分配 {used} / {limit} 分钟',
    hours_kept: '720 小时必修时长不变：', hours_kept_detail: '复习时间来自规划中的复习日，不会悄悄增加必修课时。'
  },
  'zh-Hant': {
    pager_label: '學習日導覽',
    skip: '跳至正文', nav_label: '主導覽', footer_nav_label: '網站導覽', lang_label: '語言',
    tagline: '以專案為驅動、提供四種語言的 AI 課程。',
    nav_calendar: '課程行事曆', nav_agent_track: 'Agent 工具', nav_diagnostics: '診斷', nav_export: '匯出',
    account: '帳戶', sign_in: '登入', sign_out: '登出', back: '返回第 1 天',
    sign_in_required: '請先登入，再管理你的學習記錄。',
    on_this_page: '本頁內容', prev_day: '上一天', next_day: '下一天', all_days: '全部 90 天',
    minutes_short: '{n} 分鐘', hours: '{n} 小時', minutes: '{n} 分鐘', bytes: '位元組',
    calendar_kicker: '課程台帳', active_minutes: '{n} 有效學習分鐘',
    block: '第 {n} 單元', days_range: '第 {start}–{end} 天', day_number: '第 {n} 天',
    status_legend: '狀態', none: '無', baseline: '起點',
    calendar_note: '90 個學習日 × 每天 480 有效分鐘 = 43,200 有效分鐘（720 小時）。尚未完成的學習日依據 Course Readiness Gate 維持「規劃中」狀態。',
    track_kicker: 'Agent 工程', track_selection: '選擇工具路線',
    seven_step_method: '七步法', agent_check: 'Agent 協同工程檢查',
    diag_mode: '模式', diag_agent_mode: 'Agent 協同練習', question_n: '第 {n} 題',
    diag_score: '得分', diag_correct: '答對 {correct}/{total}',
    skip_approved: '已證明掌握，可跳過', skip_not_certified: '未認證跳過',
    scheduled_into: '已排入', review_budget_day: '第 7 天每週複習預算',
    allocated: '已分配 {used} / {limit} 分鐘',
    hours_kept: '720 小時必修時數不變：', hours_kept_detail: '複習時間來自規劃中的複習日，不會悄悄增加必修課時。'
  },
  ja: {
    pager_label: '学習日ナビゲーション',
    skip: '本文へスキップ', nav_label: 'メイン', footer_nav_label: 'サイト', lang_label: '言語',
    tagline: 'プロジェクトで学ぶ、4 言語対応の AI カリキュラム。',
    nav_calendar: 'カレンダー', nav_agent_track: 'Agent ツール', nav_diagnostics: '診断', nav_export: 'エクスポート',
    account: 'アカウント', sign_in: 'ログイン', sign_out: 'ログアウト', back: '1 日目に戻る',
    sign_in_required: '学習記録を管理するにはログインしてください。',
    on_this_page: 'このページの内容', prev_day: '前の日', next_day: '次の日', all_days: '90 日間すべて',
    minutes_short: '{n} 分', hours: '{n} 時間', minutes: '{n} 分', bytes: 'バイト',
    calendar_kicker: 'カリキュラム台帳', active_minutes: '有効学習 {n} 分',
    block: 'ブロック {n}', days_range: '{start}〜{end} 日目', day_number: '{n} 日目',
    status_legend: 'ステータス', none: 'なし', baseline: '起点',
    calendar_note: '90 学習日 × 1 日 480 有効分 = 43,200 有効分（720 時間）。未完成の学習日は Course Readiness Gate に従い「計画中」のままです。',
    track_kicker: 'Agent エンジニアリング', track_selection: 'トラック選択',
    seven_step_method: '7 ステップ法', agent_check: 'Agent 支援エンジニアリングチェック',
    diag_mode: 'モード', diag_agent_mode: 'Agent 支援練習', question_n: '問 {n}',
    diag_score: 'スコア', diag_correct: '{total} 問中 {correct} 問正解',
    skip_approved: '習得を実証済み・スキップ可', skip_not_certified: 'スキップ未認定',
    scheduled_into: '割り当て先', review_budget_day: '7 日目の週次復習予算',
    allocated: '{used} / {limit} 分を割り当て済み',
    hours_kept: '必修 720 時間は不変：', hours_kept_detail: '復習時間は計画済みの復習日から割り当て、必修時間を黙って増やすことはありません。'
  }
};

const BRAND_NAME = '90-Day AI Learning';
const LANG_SHORT = { 'zh-Hans': '简', 'zh-Hant': '繁', en: 'EN', ja: '日' };
// Endonyms: each language's name in its own script, used as accessible names.
const LANG_ENDONYM = { 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文', en: 'English', ja: '日本語' };
// Gradient ids must be unique per document, so each instance names its own.
function brandMark(id) {
  return '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset=".55" stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#' + id + ')"/><path d="M9 21.5c2.4-6.5 5.2-11 7-11s3.4 3.6 3.4 6.2c0 2.3-1.3 4.3-3.4 4.3" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="22.5" cy="10.5" r="2.2" fill="#fff"/></svg>';
}
const FAVICON = `data:image/svg+xml,${encodeURIComponent(brandMark('f').replace('class="brand-mark" ', 'xmlns="http://www.w3.org/2000/svg" ').replace(' aria-hidden="true" focusable="false"', ''))}`;
const PROVIDER_ICONS = {
  google: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.4-.2-2.1H12v4h6c-.1 1-.8 2.5-2.3 3.5v2.8h3.7c2.1-2 3.2-4.9 3.2-8.2z"/><path fill="#34A853" d="M12 23c3 0 5.6-1 7.4-2.7l-3.7-2.8c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2v2.9C3.8 20.6 7.6 23 12 23z"/><path fill="#FBBC05" d="M5.8 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7H2C1.4 8.6 1 10.2 1 12s.4 3.4 1 5l3.8-2.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2C17.6 2.1 15 1 12 1 7.6 1 3.8 3.4 2 7l3.8 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>',
  github: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 .8a11.3 11.3 0 0 0-3.6 22c.6.1.8-.2.8-.6v-2c-3.1.7-3.8-1.5-3.8-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.8 2.7 1.3 3.3 1 .1-.8.4-1.3.7-1.6-2.5-.3-5.2-1.3-5.2-5.6 0-1.2.4-2.2 1.2-3-.1-.3-.5-1.5.1-3 0 0 1-.3 3.1 1.2a10.6 10.6 0 0 1 5.6 0c2.2-1.5 3.1-1.2 3.1-1.2.6 1.5.2 2.7.1 3 .7.8 1.2 1.8 1.2 3 0 4.3-2.6 5.3-5.2 5.6.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.3 11.3 0 0 0 12 .8z"/></svg>'
};

function uiCopy(lang) {
  return UI_COPY[lang] || UI_COPY.en;
}

function fmt(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

function renderLangSwitcher(lang, hrefFor) {
  const ui = uiCopy(lang);
  const links = SUPPORTED_LANGS.map(l => {
    const current = l === lang;
    return `<a class="lang-link${current ? ' active' : ''}" data-lang="${l}" href="${escapeHtml(hrefFor(l))}" hreflang="${l}" lang="${l}" title="${LANG_ENDONYM[l]}"${current ? ' aria-current="true"' : ''}><span aria-hidden="true">${LANG_SHORT[l]}</span><span class="visually-hidden">${LANG_ENDONYM[l]}</span></a>`;
  }).join('');
  return `<div class="lang-switcher" role="group" aria-label="${escapeHtml(ui.lang_label)}">${links}</div>`;
}

// Signed-in profile cluster or provider sign-in buttons for the site header.
// `extras` carries page-specific signed-in controls (identity links).
function renderAuthNav(lang, session, returnTo, opts = {}) {
  const ui = uiCopy(lang);
  const auth = opts.authCopy || {};
  if (session) {
    const identities = session.identities || [];
    const badges = identities.length
      ? `<span class="user-identities">${identities.map(i => `<span class="badge badge-identity badge-${escapeHtml(i.provider)}">${escapeHtml(i.provider)}</span>`).join('')}</span>`
      : '';
    const logout = opts.logout === false ? '' : renderLogoutForm(session, auth.sign_out || ui.sign_out);
    return `<div class="user-profile">`
      + `<span class="user-chip"><span class="user-avatar" aria-hidden="true">${escapeHtml(String(session.name || '?').trim().charAt(0).toUpperCase())}</span><span class="user-name">${escapeHtml(session.name)}</span>${badges}</span>`
      + (opts.extras || '')
      + `<a class="btn-account" href="/${escapeHtml(lang)}/account">${escapeHtml(ui.account)}</a>`
      + logout
      + `</div>`;
  }
  // Keep path slashes readable, as the sign-in links always have.
  const target = String(returnTo).split('/').map(encodeURIComponent).join('/');
  return `<div class="auth-buttons" role="group" aria-label="${escapeHtml(ui.sign_in)}">`
    + `<span class="auth-label" aria-hidden="true">${escapeHtml(ui.sign_in)}</span>`
    + `<a class="btn-sign-in btn-sign-in-google" href="/auth/google?returnTo=${target}">${PROVIDER_ICONS.google}<span>${escapeHtml(auth.sign_in_google || 'Google')}</span></a>`
    + `<a class="btn-sign-in btn-sign-in-github" href="/auth/github?returnTo=${target}">${PROVIDER_ICONS.github}<span>${escapeHtml(auth.sign_in_github || 'GitHub')}</span></a>`
    + `</div>`;
}

// Shared header: brand, primary sections, language switcher, account area.
// Nav labels come from UI_COPY so every page names the sections identically.
function renderSiteHeader({ lang, active, langHref, authHtml = '' }) {
  const ui = uiCopy(lang);
  const items = [
    ['calendar', 'nav-calendar-link', `/${lang}/calendar`, ui.nav_calendar],
    ['agent-track', 'nav-track-link', `/${lang}/agent-track`, ui.nav_agent_track],
    ['diagnostics', 'nav-diagnostics-link', `/${lang}/diagnostics`, ui.nav_diagnostics],
    ['export', 'nav-export-link', `/${lang}/export`, ui.nav_export]
  ];
  const links = items.map(([key, cls, href, label]) => {
    const current = key === active;
    return `<a class="nav-link ${cls}${current ? ' active' : ''}" href="${escapeHtml(href)}"${current ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`;
  }).join('');
  return `<a class="skip-link" href="#main">${escapeHtml(ui.skip)}</a>
  <header class="site-header">
    <nav class="site-navbar" aria-label="${escapeHtml(ui.nav_label)}">
      <div class="nav-inner">
        <a class="brand" href="/${escapeHtml(lang)}/calendar">${brandMark('bm-head')}<span class="brand-name">${BRAND_NAME}</span></a>
        <div class="nav-links">${links}</div>
        <div class="nav-actions">
          ${renderLangSwitcher(lang, langHref)}
          ${authHtml}
        </div>
      </div>
    </nav>
  </header>`;
}

function renderSiteFooter(lang, noteHtml = '') {
  const ui = uiCopy(lang);
  return `<footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <a class="footer-home" href="/${escapeHtml(lang)}/calendar">${brandMark('bm-foot')}<span>${BRAND_NAME}</span></a>
        <p class="footer-tagline">${escapeHtml(ui.tagline)}</p>
      </div>
      <nav class="footer-nav" aria-label="${escapeHtml(ui.footer_nav_label)}">
        <a href="/${escapeHtml(lang)}/calendar">${escapeHtml(ui.nav_calendar)}</a>
        <a href="/${escapeHtml(lang)}/agent-track">${escapeHtml(ui.nav_agent_track)}</a>
        <a href="/${escapeHtml(lang)}/diagnostics">${escapeHtml(ui.nav_diagnostics)}</a>
        <a href="/${escapeHtml(lang)}/export">${escapeHtml(ui.nav_export)}</a>
      </nav>
      ${noteHtml}
    </div>
  </footer>`;
}

// Document shell. `<body>` stays attribute-free: page variants are styled
// through the class on <main>.
function renderPage({ lang, title, session = null, header, main, footer, scripts = '' }) {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#08080a">
  ${renderCsrfMeta(session)}
  <title>${escapeHtml(title)} | 90-Day AI Curriculum</title>
  <link rel="icon" href="${FAVICON}">
  <link rel="stylesheet" href="/curriculum/assets/style.css">
</head>
<body>
  ${header}
  ${main}
  ${footer}
  ${scripts}
</body>
</html>`;
}

// Spec US59: each day page discloses its edition's translation-review state
// and revision, and offers signed-in learners a correction report.
const TRANSLATION_REVIEW_PATH = path.join(ROOT, 'curriculum', 'translation-review.json');
const CORRECTION_MAX_LENGTH = 2000;

const TRANSLATION_REVIEW_COPY = {
  en: {
    heading: 'Edition review status',
    states: {
      'source-edition': 'Source edition. Technical review per lesson is recorded in the course review notes.',
      'automated-checks-only': 'Translated edition. Checked by automated structure, number and code parity checks plus author spot checks. No native-speaker review yet.',
      'native-reviewed': 'Native-speaker reviewed by {reviewer} on {date}.'
    },
    revision: 'Edition revision',
    report: 'Report a correction',
    signin: 'Sign in to report a correction.',
    activity: 'Where (optional)',
    whole_day: 'Whole day',
    description: 'What is wrong? Quote the passage if you can.',
    submit: 'Send report',
    sent: 'Thank you. Your report was recorded.',
    failed: 'The report could not be sent. Please try again.'
  },
  ja: {
    heading: 'この版のレビュー状況',
    states: {
      'source-edition': '原典版。レッスンごとの技術レビューはコースのレビュー記録に残しています。',
      'automated-checks-only': '翻訳版。構造・数値・コードの自動整合チェックと作者による抜き取り確認のみで、ネイティブ話者によるレビューはまだです。',
      'native-reviewed': '{date} に {reviewer} がネイティブ話者としてレビュー済み。'
    },
    revision: '版のリビジョン',
    report: '修正を報告する',
    signin: '修正を報告するにはサインインしてください。',
    activity: '箇所（任意）',
    whole_day: 'この日全体',
    description: '何が誤っていますか？可能なら該当箇所を引用してください。',
    submit: '報告を送信',
    sent: 'ありがとうございます。報告を記録しました。',
    failed: '報告を送信できませんでした。もう一度お試しください。'
  },
  'zh-Hans': {
    heading: '本版本审校状态',
    states: {
      'source-edition': '原始版本。每课的技术审查记录在课程审查笔记中。',
      'automated-checks-only': '翻译版本。仅经过结构、数值与代码一致性的自动检查和作者抽查，尚未经过母语审校。',
      'native-reviewed': '已由 {reviewer} 于 {date} 完成母语审校。'
    },
    revision: '版本修订号',
    report: '报告内容错误',
    signin: '登录后即可报告内容错误。',
    activity: '位置（可选）',
    whole_day: '整天内容',
    description: '哪里有误？如可能请引用原文。',
    submit: '提交报告',
    sent: '谢谢，您的报告已记录。',
    failed: '报告未能提交，请重试。'
  },
  'zh-Hant': {
    heading: '本版本審校狀態',
    states: {
      'source-edition': '原始版本。每課的技術審查記錄在課程審查筆記中。',
      'automated-checks-only': '翻譯版本。僅經過結構、數值與程式碼一致性的自動檢查和作者抽查，尚未經過母語審校。',
      'native-reviewed': '已由 {reviewer} 於 {date} 完成母語審校。'
    },
    revision: '版本修訂號',
    report: '回報內容錯誤',
    signin: '登入後即可回報內容錯誤。',
    activity: '位置（選填）',
    whole_day: '整天內容',
    description: '哪裡有誤？如可能請引用原文。',
    submit: '送出回報',
    sent: '謝謝，您的回報已記錄。',
    failed: '回報未能送出，請再試一次。'
  }
};

// Short content hash of one day's edition file: changes whenever that
// edition's text changes, so reviews and reports can name what they saw.
function editionRevisionOf(dayId, lang) {
  const file = path.join(ROOT, 'curriculum', 'content', dayId, `${lang}.json`);
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
}

// Effective review state for one day in one edition. A per-day review only
// counts while it matches the current edition revision.
function translationReviewFor(dayId, lang, revision) {
  let registry = { editions: {} };
  try { registry = JSON.parse(fs.readFileSync(TRANSLATION_REVIEW_PATH, 'utf8')); } catch {}
  const edition = (registry.editions || {})[lang] || { state: 'automated-checks-only' };
  const override = ((registry.days || {})[dayId] || {})[lang];
  if (override && override.state === 'native-reviewed' && override.edition_revision === revision) {
    return override;
  }
  return edition;
}

function renderTranslationReviewNotice(dayId, lang, content, dayMeta, sessionUser, revision) {
  const copy = TRANSLATION_REVIEW_COPY[lang] || TRANSLATION_REVIEW_COPY.en;
  const review = translationReviewFor(dayId, lang, revision);
  const stateText = (copy.states[review.state] || copy.states['automated-checks-only'])
    .replace('{reviewer}', review.reviewer || '')
    .replace('{date}', review.reviewed_at || '');
  let reportHtml;
  if (sessionUser) {
    const options = (dayMeta.activities || []).map(meta => {
      const title = ((content.activities || {})[meta.id] || {}).title || meta.id;
      return `<option value="${escapeHtml(meta.id)}">${escapeHtml(title)}</option>`;
    }).join('');
    reportHtml = `<details class="correction-report"><summary>${escapeHtml(copy.report)}</summary>`
      + `<form id="correction-form" data-day-id="${escapeHtml(dayId)}" data-lang="${escapeHtml(lang)}" data-edition-revision="${escapeHtml(revision)}" data-sent="${escapeHtml(copy.sent)}" data-failed="${escapeHtml(copy.failed)}">`
      + `<label for="correction-activity">${escapeHtml(copy.activity)}</label>`
      + `<select id="correction-activity" name="activity_id"><option value="">${escapeHtml(copy.whole_day)}</option>${options}</select>`
      + `<label for="correction-description">${escapeHtml(copy.description)}</label>`
      + `<textarea id="correction-description" name="description" maxlength="${CORRECTION_MAX_LENGTH}" required rows="4"></textarea>`
      + `<button type="submit" class="btn-primary">${escapeHtml(copy.submit)}</button>`
      + `<p id="correction-status" role="status" aria-live="polite"></p></form></details>`;
  } else {
    reportHtml = `<p class="correction-signin">${escapeHtml(copy.signin)}</p>`;
  }
  return `<aside class="translation-review-notice" data-edition-state="${escapeHtml(review.state)}" data-edition-revision="${escapeHtml(revision)}">`
    + `<p><strong>${escapeHtml(copy.heading)}:</strong> ${escapeHtml(stateText)} `
    + `<span class="edition-revision">${escapeHtml(copy.revision)}: <code>${escapeHtml(revision)}</code></span></p>`
    + `${reportHtml}</aside>`;
}

function renderAccountPage(lang, session) {
  const copy = ACCOUNT_COPY[lang] || ACCOUNT_COPY.en;
  const ui = uiCopy(lang);
  // The only csrf_token input on this page is the deletion form's own, so the
  // header shows the profile without a second (logout) form.
  const header = renderSiteHeader({
    lang,
    active: null,
    langHref: l => `/${l}/account`,
    authHtml: session ? renderAuthNav(lang, session, `/${lang}/account`, { logout: false }) : renderAuthNav(lang, null, `/${lang}/account`)
  });
  const body = session
    ? `<header class="page-hero page-hero-compact">
        <p class="kicker">${escapeHtml(ui.account)}</p>
        <h1>${escapeHtml(copy.title)}</h1>
        <p class="page-lead">${escapeHtml(copy.intro)}</p>
      </header>
      <section class="panel account-delete-page danger-panel">
        <p class="deletion-scope">${escapeHtml(copy.scope)}</p>
        <p class="backup-policy">${escapeHtml(copy.backup)}</p>
        <form id="delete-records-form" class="stack-form">
          <input type="hidden" name="csrf_token" value="${escapeHtml(session.csrf_token)}">
          <label class="check-row"><input id="confirm-scope" type="checkbox" name="confirm_scope"> <span>${escapeHtml(copy.checkbox)}</span></label>
          <div class="form-group">
            <label for="confirm-phrase">${escapeHtml(copy.phrase)}</label>
            <input id="confirm-phrase" name="confirmation" autocomplete="off" spellcheck="false">
          </div>
          <div class="form-actions">
            <button id="delete-records-button" class="btn-danger" type="submit">${escapeHtml(copy.button)}</button>
            <a class="btn-ghost" href="/${escapeHtml(lang)}/day-01">${escapeHtml(copy.cancel)}</a>
          </div>
          <p id="delete-status" class="form-status" role="status" aria-live="polite"></p>
        </form>
      </section>`
    : `<header class="page-hero page-hero-compact">
        <p class="kicker">${escapeHtml(ui.account)}</p>
        <h1>${escapeHtml(copy.title)}</h1>
        <p class="page-lead">${escapeHtml(ui.sign_in_required)}</p>
      </header>`;
  return renderPage({
    lang,
    title: copy.title,
    session,
    header,
    main: `<main id="main" class="main-content page-narrow">${body}</main>`,
    footer: renderSiteFooter(lang),
    scripts: session ? `<script>document.getElementById('delete-records-form').addEventListener('submit',async(e)=>{e.preventDefault();const f=e.currentTarget,s=document.getElementById('delete-status');const r=await fetch('/api/account/delete',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':f.csrf_token.value},body:JSON.stringify({scope:'learning_records',confirm_scope:f.confirm_scope.checked,confirmation:f.confirmation.value})});const d=await r.json();s.textContent=r.ok?${JSON.stringify(copy.done)}:(d.error||'Deletion failed');if(r.ok){f.reset();}});</script>` : ''
  });
}

function readBodyJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function renderSimpleMarkdown(md) {
  if (!md) return '';
  // Convert code blocks
  let html = md.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code.trim())}</code></pre>`;
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, (_, text) => `<strong>${escapeHtml(text)}</strong>`);
  // Paragraphs / line breaks
  return html.split('\n\n').map(p => {
    if (p.startsWith('<pre>')) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}

function getKnownActivityIds() {
  if (getKnownActivityIds.cache) return getKnownActivityIds.cache;
  const ids = new Set(['agent-common-practice-01']);
  try {
    for (const filename of fs.readdirSync(path.join(ROOT, 'curriculum', 'days'))) {
      if (!/^day-\d+\.json$/.test(filename)) continue;
      const day = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum', 'days', filename), 'utf8'));
      for (const activity of day.activities || []) {
        if (typeof activity.id === 'string') ids.add(activity.id);
      }
    }
  } catch {
    // A malformed curriculum must not broaden the accepted identifier set.
  }
  getKnownActivityIds.cache = ids;
  return ids;
}

function isKnownActivityId(activityId) {
  return getKnownActivityIds().has(activityId);
}

function getActivityQuizDef(activityId) {
  if (!activityId) return null;
  const match = activityId.match(/^(day-\d{2})/);
  if (!match) return null;
  const dayId = match[1];
  const dayMetaPath = path.join(ROOT, 'curriculum', 'days', `${dayId}.json`);
  if (!fs.existsSync(dayMetaPath)) return null;

  try {
    const dayMeta = JSON.parse(fs.readFileSync(dayMetaPath, 'utf8'));
    const act = (dayMeta.activities || []).find(a => a.id === activityId);
    if (!act || !act.quiz) return null;
    return {
      activity_id: act.id,
      content_revision: act.content_revision || '1.0.0',
      quiz: act.quiz
    };
  } catch {
    return null;
  }
}

function gradeQuiz(quizDef, submittedAnswers) {
  const questions = quizDef.questions || [];
  let correctCount = 0;
  const results = questions.map(q => {
    const submitted = submittedAnswers && submittedAnswers[q.id] !== undefined
      ? String(submittedAnswers[q.id]).trim().toLowerCase()
      : '';
    const expected = String(q.expected_answer || '').trim().toLowerCase();
    const correct = (submitted === expected);
    if (correct) correctCount++;
    return {
      question_id: q.id,
      correct,
      expected: q.expected_answer,
      submitted: submittedAnswers ? submittedAnswers[q.id] : ''
    };
  });

  const total = questions.length;
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 100;
  const masteryScore = quizDef.mastery_score !== undefined ? quizDef.mastery_score : 100;
  const passed = score >= masteryScore;

  return {
    score,
    passed,
    correctCount,
    total,
    results
  };
}

function getPrerequisitesDiagnosticDef() {
  const p = path.join(ROOT, 'curriculum', 'diagnostics', 'prerequisites.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function getDiagnosticContent(lang) {
  const effectiveLang = SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
  const p = path.join(ROOT, 'curriculum', 'content', 'diagnostics', `${effectiveLang}.json`);
  try {
    if (!fs.existsSync(p)) {
      const fallback = path.join(ROOT, 'curriculum', 'content', 'diagnostics', 'en.json');
      if (fs.existsSync(fallback)) return JSON.parse(fs.readFileSync(fallback, 'utf8'));
      return {};
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function gradeDiagnostics({ answers = {}, uncertainQuestions = [], assistanceMode = 'independent', claimedSkips = [], lang = 'zh-Hans' }) {
  const diagDef = getPrerequisitesDiagnosticDef();
  if (!diagDef) throw new Error('Diagnostic definition not found');
  const content = getDiagnosticContent(lang);

  const questions = diagDef.questions || [];
  const uncertainSet = new Set(Array.isArray(uncertainQuestions) ? uncertainQuestions : []);
  const claimedSet = new Set(Array.isArray(claimedSkips) ? claimedSkips : []);

  let correctCount = 0;
  const results = {};
  const gaps = [];
  const uncertain = [];
  const mastered = [];

  for (const q of questions) {
    const submitted = (answers[q.id] !== undefined ? String(answers[q.id]).trim().toLowerCase() : '');
    const isUncertain = uncertainSet.has(q.id);
    const isCorrect = (submitted === String(q.expected_answer).trim().toLowerCase());

    results[q.id] = {
      question_id: q.id,
      concept_id: q.concept_id,
      correct: isCorrect,
      uncertain: isUncertain,
      submitted: answers[q.id] || ''
    };

    if (isUncertain) {
      uncertain.push(q.concept_id);
    } else if (isCorrect) {
      correctCount++;
      mastered.push(q.concept_id);
    } else {
      gaps.push(q.concept_id);
    }
  }

  const total = questions.length;
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 100;
  const isIndependent = assistanceMode === 'independent';

  // Evaluate Skip Guidance:
  // Merely selecting an option does NOT certify prerequisite mastery.
  // Skip recommendations require demonstrated mastery check.
  const skipRecommendations = [];
  const domains = diagDef.domains || {};

  for (const [domKey, domDef] of Object.entries(domains)) {
    const domQuestions = domDef.question_ids || [];
    const allDomCorrect = domQuestions.every(qid => results[qid] && results[qid].correct && !results[qid].uncertain);
    const claimedByUser = claimedSet.has(domKey);
    const qualifiesForSkip = allDomCorrect && isIndependent;

    if (claimedByUser && !qualifiesForSkip) {
      // Unverified claim rejected
      skipRecommendations.push({
        domain: domKey,
        eligible: false,
        reason: 'unverified_claim',
        demonstrated_criteria: '',
        recovery_material: domDef.recovery_material || [],
        guidance: lang === 'zh-Hans'
          ? '免修申请未予通过：仅勾选选项而不通过独立诊断测验不能证明已掌握前置知识。请先完成独立掌握测验以验证能力。如后续遇到困难，可参考补救学习材料。'
          : (lang === 'zh-Hant'
            ? '免修申請未予通過：僅勾選選項而不通過獨立診斷測驗不能證明已掌握前置知識。請先完成獨立掌握測驗以驗證能力。如後續遇到困難，可參考補救學習材料。'
            : (lang === 'ja'
              ? 'スキップ申請は未承認です：独立診断テストに合格せずにチェックを入れるだけでは習得を証明できません。実力を検証するために独立習得テストを受験してください。'
              : 'Skip recommendation not granted: Selecting a skip checkbox without demonstrated mastery check does not certify prerequisite mastery. Take the diagnostic check independently to verify competence. Refer to recovery materials if needed.'))
      });
    } else if (qualifiesForSkip) {
      // Evidence-based skip recommendation granted
      skipRecommendations.push({
        domain: domKey,
        eligible: true,
        reason: 'demonstrated_mastery',
        demonstrated_criteria: lang === 'zh-Hans'
          ? `已独立通过 ${domKey} 前置诊断测验，达到 100% 掌握标准。`
          : (lang === 'zh-Hant'
            ? `已獨立通過 ${domKey} 前置診斷測驗，達到 100% 掌握標準。`
            : (lang === 'ja'
              ? `${domKey} の前提知識診断テストに合格し、100%の独立習得基準を達成しました。`
              : `Passed ${domKey} prerequisite diagnostic assessment independently with 100% score.`)),
        recovery_material: domDef.recovery_material || [],
        guidance: lang === 'zh-Hans'
          ? `已验证具备 ${domKey} 前置掌握证据。您可选择性跳过 ${domDef.skip_scope}。注意：如遇阻碍，请随时回溯关联补救材料。`
          : (lang === 'zh-Hant'
            ? `已驗證具備 ${domKey} 前置掌握證據。您可選擇性跳過 ${domDef.skip_scope}。注意：如遇阻礙，請隨時回溯關聯補救材料。`
            : (lang === 'ja'
              ? `${domKey} の前提知識の習得証拠が確認されました。${domDef.skip_scope} を任意でスキップできます。補習が必要な場合は復旧教材を参照してください。`
              : `Demonstrated prerequisite mastery in ${domKey}. You may optionally skip ${domDef.skip_scope}. Note: If you encounter unfamiliar concepts later, refer back to the linked recovery material.`))
      });
    }
  }

  // Generate Review Items for Gaps & Uncertain concepts
  const reviewItems = [];
  let totalAllocatedMinutes = 0;
  const needReviewConceptIds = new Set([...gaps, ...uncertain]);

  for (const q of questions) {
    if (needReviewConceptIds.has(q.concept_id)) {
      const isGap = gaps.includes(q.concept_id);
      const conceptInfo = (content.concepts && content.concepts[q.concept_id]) || {};
      const allocatedMin = q.allocated_minutes || 60;
      totalAllocatedMinutes += allocatedMin;

      reviewItems.push({
        concept_id: q.concept_id,
        concept_title: conceptInfo.title || q.concept_id,
        status: isGap ? 'gap' : 'uncertain',
        objective: conceptInfo.objective || 'Review foundational concept.',
        activity_id: q.activity_id,
        target_day: q.target_day,
        scheduled_review_day: q.scheduled_review_day || 'day-07',
        allocated_minutes: allocatedMin,
        retry_condition: conceptInfo.retry_condition || 'Pass activity mastery check.',
        recovery_links: q.recovery_links || [q.target_day]
      });
    }
  }

  const diagnosticsSummary = {
    content_revision: diagDef.content_revision,
    score,
    total_questions: total,
    correct_count: correctCount,
    assistance_mode: assistanceMode,
    gaps,
    uncertain,
    mastered,
    results
  };

  const recommendedPlan = {
    summary_text: lang === 'zh-Hans'
      ? '根据诊断结果制定的针对性复习计划。所有复习活动已编入规划的每周复习日预算中。'
      : (lang === 'zh-Hant'
        ? '根據診斷結果制定的針對性複習計劃。所有複習活動已編入規劃的每週複習日預算中。'
        : (lang === 'ja'
          ? '診断結果に基づいて作成されたターゲット復習プラン。すべての復習タスクは計画された週間復習日予算に組み込まれています。'
          : 'Actionable review plan tailored to identified prerequisite gaps. Scheduled within planned weekly review days.')),
    planned_review_budget_day: 'day-07',
    total_allocated_minutes: Math.min(totalAllocatedMinutes, 480),
    budget_limit_minutes: 480,
    mandatory_curriculum_hours_retained: 720,
    no_extra_hours_added: true,
    skip_recommendations: skipRecommendations
  };

  return {
    diagnostics_summary: diagnosticsSummary,
    recommended_plan: recommendedPlan,
    items: reviewItems
  };
}

function renderSourceResources(sources, common) {
  if (!sources || !sources.length) return '';

  const cardsHtml = sources.map(src => {
    const restrictionsHtml = (src.license_restrictions && src.license_restrictions.length > 0)
      ? src.license_restrictions.map(r => `<span class="badge badge-restriction">${escapeHtml(r)}</span>`).join(' ')
      : '';

    let candidatesHtml = '';
    if (Array.isArray(src.compared_candidates) && src.compared_candidates.length > 0) {
      const candidateItems = src.compared_candidates.map(cand => `
        <div class="compared-candidate-item">
          <div class="candidate-header">
            <a class="candidate-link" href="${escapeHtml(cand.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cand.candidate_name)} ↗</a>
            <span class="badge badge-candidate-status">${escapeHtml(cand.status || '')}</span>
            <span class="candidate-license">[${escapeHtml(cand.license)}]</span>
          </div>
          <p class="candidate-rationale">${escapeHtml(cand.comparison_rationale)}</p>
        </div>
      `).join('\n');

      candidatesHtml = `
        <details class="compared-candidates-details" open>
          <summary class="compared-candidates-summary">
            <strong>${escapeHtml(common.compared_candidates_heading || 'Compared Candidate Sources')} (${src.compared_candidates.length})</strong>
          </summary>
          <div class="compared-candidates-list">
            ${candidateItems}
          </div>
        </details>
      `;
    }

    return `
      <div class="source-resource-card" id="source-${escapeHtml(src.id)}">
        <div class="source-card-header">
          <div class="source-badges">
            <span class="badge badge-reuse source-reuse-badge">${escapeHtml(src.reuse_category_label || src.reuse_category)}</span>
            <span class="badge badge-license source-license-badge">${escapeHtml(src.license)}</span>
            ${restrictionsHtml}
          </div>
          <h4 class="source-title">${escapeHtml(src.title)}</h4>
          <p class="source-meta-line">
            <strong>${escapeHtml(common.source_author_label || 'Author')}:</strong> <span class="source-author">${escapeHtml(src.author)}</span> |
            <a class="source-original-url" href="${escapeHtml(src.original_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(common.source_url_label || 'Original Link')} ↗</a>
          </p>
        </div>

        <div class="source-card-body">
          <p class="source-detail-row">
            <strong>${escapeHtml(common.source_range_label || 'Section / Range')}:</strong>
            <span class="source-range">${src.locator_url
              ? `<a class="source-locator-link" href="${escapeHtml(src.locator_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.relevant_timestamp || 'N/A')}</a>`
              : escapeHtml(src.relevant_timestamp || 'N/A')}</span>
          </p>
          <p class="source-detail-row">
            <strong>${escapeHtml(common.source_verification_label || 'Verification Date')}:</strong>
            <span class="source-verification-date">${escapeHtml(src.version_or_verification_date || 'N/A')}</span>
          </p>
          <div class="source-detail-block">
            <strong>${escapeHtml(common.source_rationale_label || 'Selection Rationale')}:</strong>
            <p class="source-rationale">${escapeHtml(src.selection_rationale)}</p>
          </div>
          <div class="source-detail-block">
            <strong>${escapeHtml(common.source_prereqs_label || 'Prerequisites')}:</strong>
            <p class="source-prerequisites">${escapeHtml(src.prerequisites)}</p>
          </div>
          <div class="source-fallback-box">
            <strong>${escapeHtml(common.source_fallback_label || 'Safe Fallback')}:</strong>
            <p class="source-fallback-notice">${escapeHtml(src.safe_fallback)}</p>
          </div>
          ${candidatesHtml}
        </div>
      </div>
    `;
  }).join('\n');

  return `
    <section class="activity-section source-resources-container">
      <h3>${escapeHtml(common.sources_heading || 'Authoritative Source Resources & Provenance')}</h3>
      ${cardsHtml}
    </section>
  `;
}

function renderDayPage(dayId, lang, sessionUser) {
  const dayMetaPath = path.join(ROOT, 'curriculum', 'days', `${dayId}.json`);
  const contentPath = path.join(ROOT, 'curriculum', 'content', dayId, `${lang}.json`);

  if (!fs.existsSync(dayMetaPath) || !fs.existsSync(contentPath)) {
    return null;
  }

  let dayMeta;
  let content;
  try {
    dayMeta = JSON.parse(fs.readFileSync(dayMetaPath, 'utf8'));
    content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
  } catch {
    return null;
  }
  const common = content.common;

  const ui = uiCopy(lang);
  const authCopy = common.auth || {};
  const dayPath = `/${lang}/${dayId}`;

  // Signed-in learners can attach whichever provider they have not linked yet.
  let linkButtonsHtml = '';
  if (sessionUser) {
    const identities = sessionUser.identities || [];
    const returnTo = `/${encodeURIComponent(lang)}/${encodeURIComponent(dayId)}`;
    if (!identities.some(i => i.provider === 'github')) {
      linkButtonsHtml += `<a class="btn-link-identity btn-link-github" href="/auth/link/github?returnTo=${returnTo}">${PROVIDER_ICONS.github}<span>${escapeHtml(authCopy.link_github || 'GitHub')}</span></a>`;
    }
    if (!identities.some(i => i.provider === 'google')) {
      linkButtonsHtml += `<a class="btn-link-identity btn-link-google" href="/auth/link/google?returnTo=${returnTo}">${PROVIDER_ICONS.google}<span>${escapeHtml(authCopy.link_google || 'Google')}</span></a>`;
    }
  }
  const authNavHtml = renderAuthNav(lang, sessionUser, dayPath, { authCopy, extras: linkButtonsHtml });

  // Neighbouring days that can actually be rendered in this edition.
  const dayNumber = parseInt(dayId.slice(4), 10);
  const neighbour = offset => {
    const id = `day-${String(dayNumber + offset).padStart(2, '0')}`;
    const file = path.join(ROOT, 'curriculum', 'content', id, `${lang}.json`);
    if (!fs.existsSync(path.join(ROOT, 'curriculum', 'days', `${id}.json`)) || !fs.existsSync(file)) return null;
    try {
      return { id, title: JSON.parse(fs.readFileSync(file, 'utf8')).day_title || id };
    } catch {
      return null;
    }
  };
  const prevDay = dayNumber > 1 ? neighbour(-1) : null;
  const nextDay = neighbour(1);
  const pagerLink = (day, rel, label) => day
    ? `<a class="pager-link pager-${rel}" rel="${rel}" href="/${escapeHtml(lang)}/${escapeHtml(day.id)}"><span class="pager-label">${escapeHtml(label)}</span><span class="pager-title">${escapeHtml(day.title)}</span></a>`
    : '<span class="pager-spacer"></span>';
  const pagerHtml = `<nav class="day-pager" aria-label="${escapeHtml(ui.pager_label)}">
      ${pagerLink(prevDay, 'prev', ui.prev_day)}
      <a class="pager-all" href="/${escapeHtml(lang)}/calendar">${escapeHtml(ui.all_days)}</a>
      ${pagerLink(nextDay, 'next', ui.next_day)}
    </nav>`;

  const tocHtml = `<nav class="day-toc" aria-label="${escapeHtml(ui.on_this_page)}">
      <p class="toc-heading">${escapeHtml(ui.on_this_page)}</p>
      <ol class="toc-list">
        ${dayMeta.activities.filter(meta => content.activities[meta.id]).map((meta, index) => `
        <li><a class="toc-link" href="#${escapeHtml(meta.id)}"><span class="toc-index">${String(index + 1).padStart(2, '0')}</span><span class="toc-text">${escapeHtml(content.activities[meta.id].title)}</span></a></li>`).join('')}
      </ol>
    </nav>`;

  // Render activities
  const activitiesHtml = dayMeta.activities.filter(meta => content.activities[meta.id]).map((meta, activityIndex) => {
    const actContent = content.activities[meta.id];

    const hintHtml = actContent.hint ? `
      <div class="exercise-hint" hidden>
        <strong>${escapeHtml(common.hint_title)}:</strong>
        ${renderSimpleMarkdown(actContent.hint)}
      </div>
    ` : '';

    const answerHtml = actContent.answer ? `
      <div class="exercise-answer" hidden>
        <strong>${escapeHtml(common.reveal_answer)}:</strong>
        ${renderSimpleMarkdown(actContent.answer)}
      </div>
    ` : '';

    const optionalMediaHtml = actContent.optional_media ? `
      <div class="optional-media-card">
        <h4>${escapeHtml(actContent.optional_media.title)}</h4>
        <p class="media-fallback-notice">${escapeHtml(actContent.optional_media.fallback_notice)}</p>
      </div>
    ` : '';

    let quizHtml = '';
    if (actContent.quiz && meta.quiz) {
      const qz = actContent.quiz;
      const qzCommon = common.quiz || {};
      const questions = qz.questions || [];

      const questionsListHtml = questions.map((q, idx) => {
        const optionsHtml = Object.entries(q.options || {}).map(([key, val]) => `
          <label class="quiz-option-label">
            <input type="radio" name="quiz_${escapeHtml(meta.id)}_${escapeHtml(q.id)}" value="${escapeHtml(key)}" class="quiz-option-input">
            <span class="option-key">${escapeHtml(key.toUpperCase())}.</span>
            <span class="option-text">${escapeHtml(val)}</span>
          </label>
        `).join('\n');

        const qHintHtml = q.hint ? `
          <div class="question-hint-wrap">
            <button type="button" class="btn-secondary btn-toggle-q-hint" aria-expanded="false">${escapeHtml(qzCommon.view_hint || 'View Hint')}</button>
            <div class="question-hint" hidden>
              ${renderSimpleMarkdown(q.hint)}
            </div>
          </div>
        ` : '';

        return `
          <div class="quiz-question-card" data-question-id="${escapeHtml(q.id)}">
            <div class="quiz-question-header">
              <span class="question-number">${idx + 1}.</span>
              <div class="question-prompt">${renderSimpleMarkdown(q.prompt)}</div>
            </div>
            <div class="quiz-options-group">
              ${optionsHtml}
            </div>
            <div class="question-feedback" hidden>
              <div class="feedback-status-msg"></div>
              <div class="question-explanation" hidden>
                <strong>${escapeHtml(common.reveal_answer || 'Explanation')}:</strong>
                ${renderSimpleMarkdown(q.explanation)}
              </div>
            </div>
            ${qHintHtml}
          </div>
        `;
      }).join('\n');

      quizHtml = `
        <section class="activity-section quiz-container" data-activity-id="${escapeHtml(meta.id)}" data-revision="${escapeHtml(meta.content_revision || '1.0.0')}">
          <h3>${escapeHtml(qz.title || qzCommon.quiz_title || 'Objective Knowledge Check')}</h3>
          <p class="quiz-instructions">${escapeHtml(qzCommon.quiz_instructions || '')}</p>

          <fieldset class="assistance-mode-fieldset">
            <legend>${escapeHtml(qzCommon.assistance_mode_label || 'Declared Assistance Condition')}</legend>
            <label class="radio-label">
              <input type="radio" name="assistance_mode_${escapeHtml(meta.id)}" value="independent" checked>
              <span>${escapeHtml(qzCommon.mode_independent || 'Independent Mastery Check (No AI assistance)')}</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="assistance_mode_${escapeHtml(meta.id)}" value="agent_assisted">
              <span>${escapeHtml(qzCommon.mode_agent_assisted || 'Agent-Assisted Engineering Check (Completed with AI assistance)')}</span>
            </label>
            <p class="mode-disclaimer">${escapeHtml(qzCommon.mode_disclaimer || 'Note: AI-free work is an honest declared condition, not surveillance.')}</p>
          </fieldset>

          <div class="quiz-questions-list">
            ${questionsListHtml}
          </div>

          <div class="quiz-actions">
            <button type="button" class="btn-primary btn-submit-quiz" data-activity-id="${escapeHtml(meta.id)}">
              ${escapeHtml(qzCommon.submit_btn || 'Submit Answers')}
            </button>
            <button type="button" class="btn-secondary btn-retry-quiz" data-activity-id="${escapeHtml(meta.id)}" hidden>
              ${escapeHtml(qzCommon.retry_btn || 'Retry Quiz')}
            </button>
            <span class="quiz-submit-status" role="status" aria-live="polite"></span>
          </div>

          <div class="quiz-results-banner" hidden>
            <div class="quiz-score-badge"></div>
            <div class="quiz-feedback-text"></div>
          </div>

          <div class="mastery-evidence-panel" data-activity-id="${escapeHtml(meta.id)}">
            <h4>${escapeHtml(qzCommon.attempts_history_title || 'Attempt History & Evidence')}</h4>
            <div class="mastery-badges">
              <span class="badge-evidence badge-independent" hidden>${escapeHtml(qzCommon.independent_pass_badge || 'Independent Mastery Verified')}</span>
              <span class="badge-evidence badge-agent" hidden>${escapeHtml(qzCommon.agent_assisted_pass_badge || 'Agent-Assisted Verified')}</span>
              <span class="badge-evidence badge-self-reported" hidden>${escapeHtml(qzCommon.self_reported_badge || 'Self-Reported Checkbox')}</span>
              <span class="badge-evidence badge-stale" hidden>${escapeHtml(qzCommon.stale_badge || 'Historical (Revalidation Needed)')}</span>
            </div>
            <ul class="attempts-history-list"></ul>
          </div>
        </section>
      `;
    }

    let projectSubmissionHtml = '';
    if (meta.project_submission || meta.activity_type === 'project' || (actContent && actContent.project_submission)) {
      const subI18n = common.submissions || {};
      const tracksDict = subI18n.tracks || {};

      projectSubmissionHtml = `
        <section class="activity-section project-submission-container" data-activity-id="${escapeHtml(meta.id)}" data-revision="${escapeHtml(meta.content_revision || '1.0.0')}">
          <h3>${escapeHtml(subI18n.title || 'Learning Project Submission & Evidence')}</h3>
          <p class="submission-instructions">${escapeHtml(subI18n.pasted_log_notice || '')}</p>

          <form class="project-submission-form" data-activity-id="${escapeHtml(meta.id)}" onsubmit="return false;">
            <div class="form-group">
              <label for="repo-url-${escapeHtml(meta.id)}">${escapeHtml(subI18n.repo_label || 'Repository Link')}</label>
              <input type="url" id="repo-url-${escapeHtml(meta.id)}" class="project-repo-input" placeholder="${escapeHtml(subI18n.repo_placeholder || 'https://github.com/...')}" maxlength="2048">
            </div>

            <div class="form-group">
              <label for="report-url-${escapeHtml(meta.id)}">${escapeHtml(subI18n.report_label || 'Report Link (Optional)')}</label>
              <input type="url" id="report-url-${escapeHtml(meta.id)}" class="project-report-input" placeholder="${escapeHtml(subI18n.report_placeholder || 'https://...')}" maxlength="2048">
            </div>

            <div class="form-group">
              <label for="notes-${escapeHtml(meta.id)}">${escapeHtml(subI18n.notes_label || 'Evidence Notes (Max 4096 bytes)')}</label>
              <textarea id="notes-${escapeHtml(meta.id)}" class="project-notes-input" placeholder="${escapeHtml(subI18n.notes_placeholder || '')}" maxlength="4096" rows="4"></textarea>
              <div class="char-counter"><span class="bytes-count">0</span> / 4096 ${escapeHtml(ui.bytes)}</div>
            </div>

            <fieldset class="assistance-mode-fieldset">
              <legend>${escapeHtml(subI18n.assistance_mode_label || 'Declared Assistance Condition')}</legend>
              <label class="radio-label">
                <input type="radio" name="project_mode_${escapeHtml(meta.id)}" value="independent" checked>
                <span>${escapeHtml(subI18n.mode_independent || 'Independent Project (No AI assistance)')}</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="project_mode_${escapeHtml(meta.id)}" value="agent_assisted">
                <span>${escapeHtml(subI18n.mode_agent_assisted || 'Agent-Assisted Project (Directed AI assistance)')}</span>
              </label>
              <p class="mode-disclaimer">${escapeHtml(subI18n.mode_disclaimer || '')}</p>
            </fieldset>

            <div class="form-group">
              <label for="track-${escapeHtml(meta.id)}">${escapeHtml(subI18n.track_label || 'Agent Tool Track')}</label>
              <select id="track-${escapeHtml(meta.id)}" class="project-track-select">
                <option value="">${escapeHtml(tracksDict.none || 'None / Not Applicable')}</option>
                <option value="claude-code">${escapeHtml(tracksDict.claude_code || 'Claude Code')}</option>
                <option value="codex">${escapeHtml(tracksDict.codex || 'Codex')}</option>
                <option value="pi-agent">${escapeHtml(tracksDict.pi_agent || 'Pi Agent')}</option>
                <option value="deepseek-harness">${escapeHtml(tracksDict.deepseek_harness || 'DeepSeek Harness')}</option>
              </select>
            </div>

            <div class="submission-actions">
              <button type="button" class="btn-primary btn-submit-project" data-activity-id="${escapeHtml(meta.id)}">
                ${escapeHtml(subI18n.submit_btn || 'Submit Project Evidence')}
              </button>
              <span class="project-submit-status" role="status" aria-live="polite"></span>
            </div>
          </form>

          <div class="project-evidence-panel" data-activity-id="${escapeHtml(meta.id)}">
            <h4>${escapeHtml(subI18n.inspect_title || 'Current Submitted Evidence Details')}</h4>
            <div class="mastery-badges">
              <span class="badge-evidence badge-verified" hidden>${escapeHtml(subI18n.status_verified_check || 'Deterministic Verification Check')}</span>
              <span class="badge-evidence badge-reviewed" hidden>${escapeHtml(subI18n.status_independently_reviewed || 'Independently Reviewed Evidence')}</span>
              <span class="badge-evidence badge-stale" hidden>${escapeHtml(subI18n.status_stale || 'Historical (Revalidation Needed)')}</span>
            </div>
            <div class="evidence-inspect-details" hidden>
              <div class="evidence-row evidence-repo-row" hidden>
                <strong>${escapeHtml(subI18n.repo_label || 'Repository Link')}:</strong>
                <a class="evidence-repo-link" target="_blank" rel="noopener noreferrer"></a>
              </div>
              <div class="evidence-row evidence-report-row" hidden>
                <strong>${escapeHtml(subI18n.report_label || 'Report Link')}:</strong>
                <a class="evidence-report-link" target="_blank" rel="noopener noreferrer"></a>
              </div>
              <div class="evidence-row evidence-notes-row" hidden>
                <strong>${escapeHtml(subI18n.notes_label || 'Evidence Notes')}:</strong>
                <div class="evidence-notes-text"></div>
              </div>
              <div class="evidence-row evidence-badges-row">
                <span class="badge evidence-mode-badge"></span>
                <span class="badge evidence-track-badge" hidden></span>
              </div>
              <div class="pasted-log-disclaimer">${escapeHtml(subI18n.pasted_log_notice || '')}</div>
            </div>
            <div class="evidence-empty-msg">${escapeHtml(subI18n.no_submission || 'No submission recorded yet.')}</div>
          </div>
        </section>
      `;
    }

    const sourcesToRender = actContent.source_resources || meta.source_resources || [];
    const sourceResourcesHtml = renderSourceResources(sourcesToRender, common);

    return `
      <article class="activity-card" id="${escapeHtml(meta.id)}">
        <header class="activity-header">
          <div class="activity-kicker">
            <span class="activity-index">${String(activityIndex + 1).padStart(2, '0')}</span>
            <span class="badge badge-time">${escapeHtml(fmt(ui.minutes_short, { n: meta.active_minutes }))}</span>
          </div>
          <h2 class="activity-title">${escapeHtml(actContent.title)}</h2>
          <p class="policy-note assistance-policy-badge">${escapeHtml(actContent.assistance_policy_label)}</p>
        </header>

        <div class="activity-brief">
          <section class="activity-section brief-item">
            <h3>${escapeHtml(common.prerequisites_title)}</h3>
            <p class="activity-prerequisites">${escapeHtml(actContent.prerequisites)}</p>
          </section>
          <section class="activity-section brief-item">
            <h3>${escapeHtml(common.objective_title)}</h3>
            <p class="activity-objective">${escapeHtml(actContent.objective)}</p>
          </section>
        </div>

        <section class="activity-section activity-instructions">
          <h3>${escapeHtml(common.instructions_title)}</h3>
          ${renderSimpleMarkdown(actContent.instructions)}
        </section>

        <section class="exercise-container">
          <h3>${escapeHtml(common.exercise_title)}</h3>
          <div class="exercise-prompt">
            ${renderSimpleMarkdown(actContent.exercise_prompt)}
          </div>
          <textarea class="exercise-draft-input" data-activity-id="${escapeHtml(meta.id)}" placeholder="${escapeHtml(common.draft_placeholder)}"></textarea>
          <div class="exercise-actions">
            <button type="button" class="btn-secondary btn-toggle-hint" aria-expanded="false">${escapeHtml(common.hint_title)}</button>
            <button type="button" class="btn-secondary btn-reveal-answer" aria-expanded="false">${escapeHtml(common.reveal_answer)}</button>
          </div>
          <div class="exercise-progress-controls" data-activity-id="${escapeHtml(meta.id)}">
            <label class="completion-checkbox-label">
              <input type="checkbox" class="activity-completion-checkbox" data-activity-id="${escapeHtml(meta.id)}">
              <span>${escapeHtml(common.progress ? common.progress.mark_completed : 'Mark as Completed')}</span>
            </label>
            <button type="button" class="btn-save-progress btn-secondary" data-activity-id="${escapeHtml(meta.id)}">
              ${escapeHtml(common.progress ? common.progress.save_btn : 'Save Progress')}
            </button>
            <span class="save-status-indicator" role="status" aria-live="polite"></span>
          </div>
          ${hintHtml}
          ${answerHtml}
        </section>

        ${quizHtml}

        ${projectSubmissionHtml}

        <div class="mastery-criterion">
          <strong>${escapeHtml(common.mastery_title)}</strong>
          <p>${escapeHtml(actContent.mastery_criterion)}</p>
        </div>

        ${sourceResourcesHtml}

        ${optionalMediaHtml}
      </article>
    `;
  }).join('\n');

  const main = `<main id="main" class="main-content page-day">
    <header class="day-header page-hero" id="day-header">
      <p class="kicker day-kicker"><span class="day-counter">${String(dayNumber).padStart(2, '0')}<span class="day-counter-total"> / 90</span></span></p>
      <h1>${escapeHtml(content.day_title)}</h1>
      <p class="day-subtitle page-lead">${escapeHtml(content.day_subtitle)}</p>
      <div class="day-meta-tags">
        <span class="badge badge-category">${escapeHtml(content.category_label)}</span>
        <span class="badge badge-time day-time-budget">${escapeHtml(content.time_budget_label)}</span>
      </div>
    </header>

    <div class="day-layout">
      ${tocHtml}
      <div class="day-content">
        ${renderTranslationReviewNotice(dayId, lang, content, dayMeta, sessionUser, editionRevisionOf(dayId, lang))}

        <div id="auth-alert-box" class="auth-alert-box" hidden role="alert"></div>

        <div class="activities-list">
          ${activitiesHtml}
        </div>

        ${pagerHtml}
      </div>
    </div>
  </main>`;

  return renderPage({
    lang,
    title: content.day_title,
    session: sessionUser,
    header: renderSiteHeader({ lang, active: null, langHref: l => `/${l}/${dayId}`, authHtml: authNavHtml }),
    main,
    footer: renderSiteFooter(lang, `<p class="dev-slice-disclaimer">${escapeHtml(common.dev_slice_notice)}</p>`),
    scripts: `<script id="i18n-auth-data" type="application/json">${JSON.stringify(common.auth || {})}</script>
  <script id="i18n-progress-data" type="application/json">${JSON.stringify(common.progress || {})}</script>
  <script id="i18n-quiz-data" type="application/json">${JSON.stringify(common.quiz || {})}</script>
  <script id="i18n-submission-data" type="application/json">${JSON.stringify(common.submissions || {})}</script>
  <script id="current-user-data" type="application/json">${JSON.stringify(sessionUser ? { id: sessionUser.user_id, name: sessionUser.name, email: sessionUser.email, identities: sessionUser.identities || [] } : null)}</script>
  <script src="/curriculum/assets/app.js"></script>`
  });
}

function renderCalendarPage(lang) {
  const manifestPath = path.join(ROOT, 'curriculum', 'manifest.json');
  const calendarContentPath = path.join(ROOT, 'curriculum', 'content', 'calendar', `${lang}.json`);

  if (!fs.existsSync(manifestPath) || !fs.existsSync(calendarContentPath)) {
    return null;
  }

  let manifest;
  let content;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    content = JSON.parse(fs.readFileSync(calendarContentPath, 'utf8'));
  } catch {
    return null;
  }

  const ui = uiCopy(lang);
  const formattedMinutes = Number(manifest.total_active_minutes).toLocaleString('en-US');
  const pad = n => String(n).padStart(2, '0');

  // Category cards HTML
  const categoryCardsHtml = Object.entries(manifest.category_hours).map(([catKey, hours]) => {
    const catName = content.categories[catKey] || catKey;
    const mins = manifest.category_minutes[catKey] || (hours * 60);
    const share = Math.round((Number(mins) / Number(manifest.total_active_minutes || 1)) * 100);
    return `
      <div class="category-card" data-category="${escapeHtml(catKey)}">
        <div class="category-card-header">${escapeHtml(catName)}</div>
        <div class="category-card-hours">${escapeHtml(fmt(ui.hours, { n: hours }))}</div>
        <div class="category-card-minutes">${escapeHtml(fmt(ui.minutes, { n: Number(mins).toLocaleString('en-US') }))}</div>
        <div class="category-meter" aria-hidden="true"><span style="width:${share}%"></span></div>
      </div>
    `;
  }).join('\n');

  // Topic blocks HTML
  const blocksHtml = manifest.blocks.map(block => {
    const blockTitle = lang === 'zh-Hans' ? (block.title_zh_Hans || block.title)
      : lang === 'zh-Hant' ? (block.title_zh_Hant || block.title)
      : lang === 'ja' ? (block.title_ja || block.title)
      : block.title;

    const blockCatName = content.categories[block.topic_category] || block.topic_category;

    // Render the 3 days in this block
    const daysHtml = [];
    for (let dayNum = block.start_day; dayNum <= block.end_day; dayNum++) {
      const dayId = `day-${pad(dayNum)}`;
      const dayFilePath = path.join(ROOT, 'curriculum', 'days', `${dayId}.json`);
      let dayData = {
        id: dayId,
        day_number: dayNum,
        active_minutes: 480,
        status: dayNum === 1 ? 'available' : 'planned',
        is_review_day: manifest.weekly_review_days.includes(dayNum),
        topic_category: block.topic_category,
        prerequisites: dayNum === 1 ? ['High-school reading comprehension', 'Terminal awareness'] : [`day-${pad(dayNum - 1)}`],
        recovery_links: [`day-01`]
      };
      if (fs.existsSync(dayFilePath)) {
        try {
          dayData = JSON.parse(fs.readFileSync(dayFilePath, 'utf8'));
        } catch {}
      }

      const statusLabel = content.status_labels[dayData.status] || dayData.status;
      const reviewBadgeHtml = dayData.is_review_day ? `<span class="badge badge-review">${escapeHtml(content.review_badge)}</span>` : '';
      const dayCatName = content.categories[dayData.topic_category] || dayData.topic_category;
      // Cards already show the day number, so drop the title's "Day N:" prefix.
      const dayTitle = dayTitleFor(dayId, lang).replace(/^(?:Day\s*\d+|第\s*\d+\s*[天日])\s*[:：]\s*/i, '');

      const prereqsHtml = (dayData.prerequisites && dayData.prerequisites.length > 0)
        ? dayData.prerequisites.map(p => `<span class="prereq-item">${escapeHtml(p)}</span>`).join(' ')
        : `<em>${escapeHtml(ui.none)}</em>`;

      const recoveryHtml = (dayData.recovery_links && dayData.recovery_links.length > 0)
        ? dayData.recovery_links.map(r => `<span class="recovery-item">${escapeHtml(r)}</span>`).join(' ')
        : `<em>${escapeHtml(ui.baseline)}</em>`;

      const isReady = dayData.status === 'available' || dayData.status === 'reviewed' || dayData.status === 'accepted';
      const actionHtml = isReady
        ? `<a class="day-link" href="/${lang}/${dayId}">${escapeHtml(content.open_day)}<span aria-hidden="true"> →</span></a>`
        : `<div class="planned-notice-box"><small>${escapeHtml(content.planned_notice)}</small></div>`;

      daysHtml.push(`
        <article class="calendar-day-card status-card-${escapeHtml(dayData.status)} ${dayData.is_review_day ? 'review-day' : ''}" id="calendar-${escapeHtml(dayId)}">
          <div class="card-top">
            <div class="day-id-title"><span class="day-id-number">${pad(dayNum)}</span><span class="visually-hidden"> ${escapeHtml(fmt(ui.day_number, { n: dayNum }))}</span></div>
            <span class="badge status-badge status-${escapeHtml(dayData.status)}">${escapeHtml(statusLabel)}</span>
          </div>
          ${dayTitle ? `<h3 class="calendar-day-title">${escapeHtml(dayTitle)}</h3>` : ''}

          <div class="card-meta-tags">
            <span class="badge badge-category">${escapeHtml(dayCatName)}</span>
            <span class="badge badge-time">${escapeHtml(fmt(ui.minutes_short, { n: dayData.active_minutes }))}</span>
            ${reviewBadgeHtml}
          </div>

          <dl class="card-details">
            <div><dt>${escapeHtml(content.prerequisites_label)}</dt><dd>${prereqsHtml}</dd></div>
            <div><dt>${escapeHtml(content.recovery_label)}</dt><dd>${recoveryHtml}</dd></div>
          </dl>

          <div class="card-action">
            ${actionHtml}
          </div>
        </article>
      `);
    }

    return `
      <section class="topic-block" id="block-${block.block_number}" aria-labelledby="block-${block.block_number}-title">
        <header class="topic-block-header">
          <p class="kicker">${escapeHtml(fmt(ui.block, { n: pad(block.block_number) }))} <span class="kicker-sep" aria-hidden="true">·</span> ${escapeHtml(fmt(ui.days_range, { start: pad(block.start_day), end: pad(block.end_day) }))}</p>
          <h2 id="block-${block.block_number}-title">${escapeHtml(blockTitle)}</h2>
          <span class="badge badge-category">${escapeHtml(blockCatName)}</span>
        </header>
        <div class="block-days-grid">
          ${daysHtml.join('\n')}
        </div>
      </section>
    `;
  }).join('\n');

  const main = `<main id="main" class="main-content page-wide">
    <header class="day-header page-hero page-hero-center" id="calendar-header">
      <p class="kicker">${escapeHtml(ui.calendar_kicker)}</p>
      <h1>${escapeHtml(content.page_title)}</h1>
      <p class="day-subtitle page-lead">${escapeHtml(content.page_subtitle)}</p>
    </header>

    <section class="ledger-dashboard" aria-label="${escapeHtml(content.ledger_title)}">
      <div class="ledger-metrics-grid">
        <div class="metric-card">
          <div class="metric-value">90</div>
          <div class="metric-label">${escapeHtml(content.total_days_label)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">720</div>
          <div class="metric-label">${escapeHtml(content.total_hours_label)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${formattedMinutes}</div>
          <div class="metric-label">${escapeHtml(content.total_minutes_label)}</div>
        </div>
      </div>

      <h2 class="section-label">${escapeHtml(content.category_hours_label || content.ledger_title)}</h2>
      <div class="category-ledger-grid">
        ${categoryCardsHtml}
      </div>
    </section>

    <div class="status-legend-bar">
      <span class="legend-label">${escapeHtml(ui.status_legend)}</span>
      <span class="badge status-badge status-planned">${escapeHtml(content.status_labels.planned)}</span>
      <span class="badge status-badge status-available">${escapeHtml(content.status_labels.available)}</span>
      <span class="badge status-badge status-reviewed">${escapeHtml(content.status_labels.reviewed)}</span>
      <span class="badge status-badge status-accepted">${escapeHtml(content.status_labels.accepted)}</span>
      <span class="legend-sep" aria-hidden="true"></span>
      <span class="badge badge-review">${escapeHtml(content.review_badge)}</span>
    </div>

    <div class="topic-blocks-container">
      ${blocksHtml}
    </div>
  </main>`;

  return renderPage({
    lang,
    title: content.page_title,
    header: renderSiteHeader({ lang, active: 'calendar', langHref: l => `/${l}/calendar` }),
    main,
    footer: renderSiteFooter(lang, `<p class="dev-slice-disclaimer">${escapeHtml(ui.calendar_note)}</p>`)
  });
}

// Day titles for calendar cards, cached per edition file and refreshed when
// the file changes, so the 90-card calendar does not reparse every lesson.
const dayTitleCache = new Map();
function dayTitleFor(dayId, lang) {
  const file = path.join(ROOT, 'curriculum', 'content', dayId, `${lang}.json`);
  try {
    const mtime = fs.statSync(file).mtimeMs;
    const cached = dayTitleCache.get(file);
    if (cached && cached.mtime === mtime) return cached.title;
    const title = JSON.parse(fs.readFileSync(file, 'utf8')).day_title || '';
    dayTitleCache.set(file, { mtime, title });
    return title;
  } catch {
    return '';
  }
}

function renderAgentTrackPage(lang, sessionUser) {
  const registryPath = path.join(ROOT, 'curriculum', 'agent-tracks', 'registry.json');
  const contentPath = path.join(ROOT, 'curriculum', 'content', 'agent-track', `${lang}.json`);

  if (!fs.existsSync(registryPath) || !fs.existsSync(contentPath)) {
    return null;
  }

  let registry;
  let content;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
  } catch {
    return null;
  }
  const common = content.common;
  const policy = content.assistance_policy;
  const sharedEx = content.shared_exercise;

  const userTrack = sessionUser ? (db.getUserTrack(sessionUser.user_id) || DEFAULT_TRACK) : DEFAULT_TRACK;

  const ui = uiCopy(lang);
  const authNavHtml = renderAuthNav(lang, sessionUser, `/${lang}/agent-track`, { authCopy: common.auth || {} });

  // Track cards HTML
  const trackCardsHtml = registry.tracks.map(trackMeta => {
    const trackContent = content.tracks[trackMeta.id] || {};
    const isSelected = trackMeta.id === userTrack;
    const isVerified = trackMeta.verification_state === 'verified';
    const statusLabel = isVerified ? common.status_verified : common.status_pending;
    const badgeClass = isVerified ? 'badge-verified' : 'badge-pending';

    return `
      <div class="track-card ${isSelected ? 'selected' : ''}" data-track="${escapeHtml(trackMeta.id)}">
        <div class="track-card-header">
          <span class="badge ${badgeClass}">${escapeHtml(statusLabel)}</span>
          <span class="track-selected-indicator" ${isSelected ? '' : 'style="display:none;"'}>${escapeHtml(common.selected_badge)}</span>
        </div>
        <h3 class="track-name">${escapeHtml(trackContent.name || trackMeta.name)}</h3>
        <p class="track-summary">${escapeHtml(trackContent.summary || '')}</p>
        <div class="track-meta-list">
          <p class="track-tested-version">
            <strong>${escapeHtml(common.tested_version_label)}:</strong> <code>${escapeHtml(trackMeta.tested_version)}</code>
          </p>
          <p class="track-availability">
            <strong>${escapeHtml(common.availability_label)}:</strong> ${escapeHtml(trackContent.availability || trackMeta.setup_availability)}
          </p>
          <p class="track-cost">
            <strong>${escapeHtml(common.cost_label)}:</strong> ${escapeHtml(trackContent.cost_info || trackMeta.cost_assumptions)}
          </p>
          <p class="track-boundary">
            <strong>${escapeHtml(common.execution_boundary_label)}:</strong> ${escapeHtml(trackMeta.execution_boundary)}
          </p>
        </div>
        <button type="button" class="btn-select-track btn-secondary" data-track="${escapeHtml(trackMeta.id)}">
          ${escapeHtml(common.select_track_btn)}
        </button>
      </div>
    `;
  }).join('\n');

  // Tool-specific instruction panels
  const toolPanelsHtml = registry.tracks.map(trackMeta => {
    const trackContent = content.tracks[trackMeta.id] || {};
    const isSelected = trackMeta.id === userTrack;
    return `
      <div class="track-instructions-panel ${isSelected ? 'active' : ''}" data-track="${escapeHtml(trackMeta.id)}" ${isSelected ? '' : 'style="display:none;"'}>
        <h4>${escapeHtml(trackContent.name || trackMeta.name)} - ${escapeHtml(common.tool_specific_heading)}</h4>
        <div class="tool-operations-content">
          ${renderSimpleMarkdown(trackContent.tool_operations || '')}
        </div>
      </div>
    `;
  }).join('\n');

  // Seven steps HTML
  const sevenStepsHtml = sharedEx.seven_steps.map(s => `
    <div class="seven-step-item">
      <div class="step-badge">0${s.step}</div>
      <div class="step-body">
        <h4>${escapeHtml(s.name)}</h4>
        <p>${escapeHtml(s.detail)}</p>
      </div>
    </div>
  `).join('\n');

  const hintHtml = sharedEx.hint ? `
    <div class="exercise-hint" hidden>
      <strong>${escapeHtml(common.hint_title)}:</strong>
      ${renderSimpleMarkdown(sharedEx.hint)}
    </div>
  ` : '';

  const answerHtml = sharedEx.answer ? `
    <div class="exercise-answer" hidden>
      <strong>${escapeHtml(common.reveal_answer)}:</strong>
      ${renderSimpleMarkdown(sharedEx.answer)}
    </div>
  ` : '';

  const skillModulesHtml = (sharedEx.skill_modules || []).map(m => `
    <article class="skill-module-card" id="${escapeHtml(m.id)}">
      <h3 class="skill-module-title">${escapeHtml(m.title)}</h3>
      <p class="skill-module-objective"><strong>${escapeHtml(common.objective_title)}:</strong> ${escapeHtml(m.objective)}</p>
      <div class="skill-module-instructions">
        ${renderSimpleMarkdown(m.instructions)}
      </div>
      <section class="exercise-container">
        <h4>${escapeHtml(common.exercise_title)}</h4>
        <div class="exercise-prompt">
          ${renderSimpleMarkdown(m.exercise_prompt)}
        </div>
        <div class="exercise-actions">
          <button type="button" class="btn-secondary btn-toggle-hint" aria-expanded="false">${escapeHtml(common.hint_title)}</button>
          <button type="button" class="btn-secondary btn-reveal-answer" aria-expanded="false">${escapeHtml(common.reveal_answer)}</button>
        </div>
        <div class="exercise-hint" hidden>
          <strong>${escapeHtml(common.hint_title)}:</strong>
          ${renderSimpleMarkdown(m.hint)}
        </div>
        <div class="exercise-answer" hidden>
          <strong>${escapeHtml(common.reveal_answer)}:</strong>
          ${renderSimpleMarkdown(m.answer)}
        </div>
      </section>
      <div class="mastery-criterion">
        <strong>${escapeHtml(common.mastery_title)}:</strong>
        <p>${escapeHtml(m.mastery_criterion)}</p>
      </div>
    </article>
  `).join('\n');

  const main = `<main id="main" class="main-content page-wide">
    <header class="day-header page-hero" id="track-header">
      <p class="kicker">${escapeHtml(ui.track_kicker)} <span class="kicker-sep" aria-hidden="true">·</span> ${escapeHtml(ui.track_selection)}</p>
      <h1>${escapeHtml(content.page_title)}</h1>
      <p class="day-subtitle page-lead">${escapeHtml(content.page_subtitle)}</p>
      <div class="tracks-disclaimer-box">
        <p class="tracks-disclaimer">${escapeHtml(common.tracks_disclaimer)}</p>
      </div>
    </header>

    <section class="agent-tracks-section">
      <h2>${escapeHtml(common.tracks_heading)}</h2>
      <div class="agent-tracks-container" id="agent-tracks">
        ${trackCardsHtml}
      </div>
      <div class="tool-instructions-container">
        ${toolPanelsHtml}
      </div>
    </section>

    <section class="activity-section assistance-policy-container">
      <h3>${escapeHtml(policy.title)}</h3>
      <div class="policy-grid">
        <div class="policy-card policy-independent">
          <h4>${escapeHtml(policy.independent_mode_title)}</h4>
          <p>${escapeHtml(policy.independent_mode_desc)}</p>
        </div>
        <div class="policy-card policy-agent">
          <h4>${escapeHtml(policy.agent_mode_title)}</h4>
          <p>${escapeHtml(policy.agent_mode_desc)}</p>
        </div>
        <div class="policy-card policy-safety">
          <h4>${escapeHtml(policy.workspace_safety_title)}</h4>
          <p>${escapeHtml(policy.workspace_safety_desc)}</p>
        </div>
      </div>
    </section>

    <section class="activity-section shared-practice-container">
      <h2>${escapeHtml(common.shared_practice_heading)}</h2>
      <article class="activity-card" id="${escapeHtml(sharedEx.activity_id)}">
        <header class="activity-header">
          <div>
            <div class="day-meta-tags">
              <span class="badge badge-category">${escapeHtml(ui.seven_step_method)}</span>
              <span class="badge badge-policy">${escapeHtml(ui.agent_check)}</span>
            </div>
            <h2 class="activity-title">${escapeHtml(sharedEx.title)}</h2>
          </div>
        </header>

        <section class="activity-section">
          <h3>${escapeHtml(common.prerequisites_title)}</h3>
          <p class="activity-prerequisites">${escapeHtml(sharedEx.prerequisites)}</p>
        </section>

        <section class="activity-section">
          <h3>${escapeHtml(common.objective_title)}</h3>
          <p class="activity-objective">${escapeHtml(sharedEx.objective)}</p>
        </section>

        <section class="activity-section">
          <h3>${escapeHtml(common.instructions_title)}</h3>
          <div class="seven-steps-grid">
            ${sevenStepsHtml}
          </div>
        </section>

        <section class="exercise-container">
          <h3>${escapeHtml(common.exercise_title)}</h3>
          <div class="exercise-prompt">
            ${renderSimpleMarkdown(sharedEx.scenario_prompt)}
          </div>
          <textarea class="exercise-draft-input" data-activity-id="${escapeHtml(sharedEx.activity_id)}" placeholder="${escapeHtml(common.draft_placeholder)}"></textarea>
          <div class="exercise-actions">
            <button type="button" class="btn-secondary btn-toggle-hint" aria-expanded="false">${escapeHtml(common.hint_title)}</button>
            <button type="button" class="btn-secondary btn-reveal-answer" aria-expanded="false">${escapeHtml(common.reveal_answer)}</button>
          </div>
          <div class="exercise-progress-controls" data-activity-id="${escapeHtml(sharedEx.activity_id)}">
            <label class="completion-checkbox-label">
              <input type="checkbox" class="activity-completion-checkbox" data-activity-id="${escapeHtml(sharedEx.activity_id)}">
              <span>${escapeHtml(common.progress ? common.progress.mark_completed : 'Mark as Completed')}</span>
            </label>
            <button type="button" class="btn-save-progress btn-secondary" data-activity-id="${escapeHtml(sharedEx.activity_id)}">
              ${escapeHtml(common.progress ? common.progress.save_btn : 'Save Progress')}
            </button>
            <span class="save-status-indicator" role="status" aria-live="polite"></span>
          </div>
          ${hintHtml}
          ${answerHtml}
        </section>

        <div class="mastery-criterion">
          <strong>${escapeHtml(common.mastery_title)}:</strong>
          <p>${escapeHtml(sharedEx.mastery_criterion)}</p>
        </div>
      </article>

      <section class="skill-modules-section">
        <h2>${escapeHtml(common.skill_modules_heading || 'Skill Modules')}</h2>
        ${skillModulesHtml}
      </section>

      ${(sharedEx.references || []).length ? `
      <section class="skill-references-section">
        <h2>${escapeHtml(common.skill_references_heading || 'References')}</h2>
        <ul class="skill-references-list">
          ${sharedEx.references.map(ref => `
            <li class="skill-reference-item" id="${escapeHtml(ref.id)}">
              <a href="${escapeHtml(ref.url)}" rel="noopener noreferrer">${escapeHtml(ref.title)}</a>
              <p class="skill-reference-meta">${escapeHtml(ref.source_type)} · ${escapeHtml(common.observed_label || 'Observed')}: ${escapeHtml(ref.observed_date)}</p>
              <p class="skill-reference-scope">${escapeHtml(ref.scope)}</p>
              <p class="skill-reference-rights"><strong>${escapeHtml(common.rights_label || 'Rights')}:</strong> ${escapeHtml(ref.rights)}</p>
              <p class="skill-reference-rationale"><strong>${escapeHtml(common.why_selected_label || 'Why selected')}:</strong> ${escapeHtml(ref.selection_rationale)}</p>
              <p class="skill-reference-boundary"><strong>${escapeHtml(common.evidence_boundary_label || 'Evidence boundary')}:</strong> ${escapeHtml(ref.evidence_boundary)}</p>
            </li>
          `).join('\n')}
        </ul>
      </section>` : ''}
    </section>

  </main>`;

  return renderPage({
    lang,
    title: content.page_title,
    session: sessionUser,
    header: renderSiteHeader({ lang, active: 'agent-track', langHref: l => `/${l}/agent-track`, authHtml: authNavHtml }),
    main,
    footer: renderSiteFooter(lang),
    scripts: `<script id="i18n-progress-data" type="application/json">${JSON.stringify(common.progress || {})}</script>
  <script id="current-user-data" type="application/json">${JSON.stringify(sessionUser ? { id: sessionUser.user_id, name: sessionUser.name, email: sessionUser.email, selected_track: userTrack } : null)}</script>
  <script id="current-track-data" type="application/json">${JSON.stringify({ selected_track: userTrack })}</script>
  <script src="/curriculum/assets/app.js"></script>`
  });
}


function renderDiagnosticsPage(lang, sessionUser) {
  const diagDef = getPrerequisitesDiagnosticDef();
  const content = getDiagnosticContent(lang);
  if (!diagDef || !content) return null;

  const ui = uiCopy(lang);
  const authNavHtml = renderAuthNav(lang, sessionUser, `/${lang}/diagnostics`);

  // Check if sessionUser has existing saved review plan
  const existingPlan = sessionUser ? db.getReviewPlan(sessionUser.user_id) : null;

  // Build question cards
  const questionsHtml = (diagDef.questions || []).map((q, idx) => {
    const qContent = (content.questions && content.questions[q.id]) || {};
    const choicesHtml = Object.entries(qContent.choices || {}).map(([key, label]) => `
      <label class="diagnostic-option-label">
        <input type="radio" name="diag_${escapeHtml(q.id)}" value="${escapeHtml(key)}" class="diag-option-input">
        <span class="opt-key">${escapeHtml(key.toUpperCase())}.</span>
        <span class="opt-text">${escapeHtml(label)}</span>
      </label>
    `).join('\n');

    const hintHtml = qContent.hint ? `
      <div class="question-hint-wrap">
        <button type="button" class="btn btn-secondary btn-sm btn-toggle-q-hint" aria-expanded="false">${escapeHtml(content.view_hint || 'View Hint')}</button>
        <div class="question-hint" hidden>
          ${renderSimpleMarkdown(qContent.hint)}
        </div>
      </div>
    ` : '';

    return `
      <article class="diagnostic-question-card" data-question-id="${escapeHtml(q.id)}" data-concept-id="${escapeHtml(q.concept_id)}">
        <div class="q-card-header">
          <span class="badge badge-concept">${escapeHtml(q.concept_id)}</span>
          <span class="badge badge-domain">${escapeHtml(q.domain)}</span>
        </div>
        <h3 class="q-title">${escapeHtml(qContent.title || fmt(ui.question_n, { n: idx + 1 }))}</h3>
        <div class="q-prompt">${renderSimpleMarkdown(qContent.prompt || '')}</div>
        <div class="diag-options-group">
          ${choicesHtml}
        </div>
        <div class="q-card-footer">
          <label class="chk-uncertain-label">
            <input type="checkbox" id="chk-uncertain-${escapeHtml(q.id)}" class="chk-uncertain" value="${escapeHtml(q.id)}">
            <span>${escapeHtml(content.chk_uncertain_label || 'I am uncertain about this concept')}</span>
          </label>
          ${hintHtml}
        </div>
      </article>
    `;
  }).join('\n');

  // Build existing review plan HTML if present
  let initialReviewPlanHtml = '';
  if (existingPlan) {
    const summary = existingPlan.diagnostics_summary || {};
    const plan = existingPlan.recommended_plan || {};
    const items = existingPlan.items || [];
    const skips = plan.skip_recommendations || [];

    const itemsHtml = items.map(it => `
      <div class="review-item-card status-${escapeHtml(it.status)}">
        <div class="review-item-header">
          <span class="badge badge-concept">${escapeHtml(it.concept_id)}</span>
          <span class="badge badge-${escapeHtml(it.status)}">${escapeHtml(it.status.toUpperCase())}</span>
          <span class="review-item-time">${escapeHtml(fmt(ui.minutes_short, { n: it.allocated_minutes }))} · ${escapeHtml(it.scheduled_review_day)}</span>
        </div>
        <h4 class="review-item-title">${escapeHtml(it.concept_title)}</h4>
        <div class="review-item-body">
          <p class="review-item-objective"><strong>${escapeHtml(content.objective_label || 'Objective')}:</strong> ${escapeHtml(it.objective)}</p>
          <p class="review-item-retry"><strong>${escapeHtml(content.retry_condition_label || 'Retry Condition')}:</strong> ${escapeHtml(it.retry_condition)}</p>
          <div class="review-item-links">
            <a class="review-item-link" href="/${escapeHtml(lang)}/${escapeHtml(it.target_day)}#${escapeHtml(it.activity_id)}">
              ${escapeHtml(content.linked_activity_label || 'Linked Activity')}: ${escapeHtml(it.activity_id)} <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>
    `).join('\n');

    const skipsHtml = skips.map(sk => `
      <div class="skip-guidance-card ${sk.eligible ? 'skip-eligible' : 'skip-ineligible'}">
        <div class="skip-header">
          <span class="badge ${sk.eligible ? 'badge-skip-granted' : 'badge-skip-rejected'}">
            ${escapeHtml(sk.eligible ? ui.skip_approved : ui.skip_not_certified)}
          </span>
          <span class="skip-domain">${escapeHtml(sk.domain)}</span>
        </div>
        <p class="skip-guidance-notice">${escapeHtml(sk.guidance)}</p>
        ${sk.demonstrated_criteria ? `<p class="skip-criteria"><strong>${escapeHtml(content.demonstrated_criteria_title || 'Demonstrated Criteria')}:</strong> ${escapeHtml(sk.demonstrated_criteria)}</p>` : ''}
        ${sk.recovery_material && sk.recovery_material.length ? `<p class="skip-recovery"><strong>${escapeHtml(content.recovery_materials_title || 'Recovery Materials')}:</strong> ${sk.recovery_material.map(r => `<a href="/${escapeHtml(lang)}/${escapeHtml(r)}">${escapeHtml(r)}</a>`).join(', ')}</p>` : ''}
      </div>
    `).join('\n');

    initialReviewPlanHtml = `
      <div class="review-plan-banner">
        <h3>${escapeHtml(content.review_plan_title || 'Targeted Review Plan')}</h3>
        <p class="summary-score-line">${escapeHtml(ui.diag_score)} <strong>${escapeHtml(String(summary.score || 0))}%</strong> <span class="summary-count">${escapeHtml(fmt(ui.diag_correct, { correct: summary.correct_count || 0, total: summary.total_questions || 5 }))}</span></p>
      </div>
      <div class="review-budget-accounting-card">
        <h4>${escapeHtml(content.budget_status_title || 'Planned Time Budget Accounting')}</h4>
        <p>${escapeHtml(ui.scheduled_into)} <strong>${escapeHtml(ui.review_budget_day)}</strong> <span class="budget-count">${escapeHtml(fmt(ui.allocated, { used: plan.total_allocated_minutes || 0, limit: 480 }))}</span></p>
        <p class="budget-guarantee"><strong>${escapeHtml(ui.hours_kept)}</strong> ${escapeHtml(ui.hours_kept_detail)}</p>
      </div>
      <div class="skip-guidance-container">
        ${skipsHtml}
      </div>
      <div class="review-items-list">
        ${itemsHtml.length ? itemsHtml : `<p class="all-mastered-note">${escapeHtml(content.all_mastered_message || 'All prerequisite diagnostics passed!')}</p>`}
      </div>
      <div class="review-plan-actions">
        <button type="button" class="btn btn-secondary btn-retry-diagnostic">${escapeHtml(content.btn_retry || 'Retry Diagnostic')}</button>
      </div>
    `;
  }

  const main = `<main id="main" class="main-content diagnostics-main page-wide">
    <header class="diagnostics-header page-hero">
      <p class="kicker">${escapeHtml(content.category_label || ui.nav_diagnostics)}</p>
      <h1>${escapeHtml(content.title)}</h1>
      <p class="day-subtitle page-lead">${escapeHtml(content.subtitle)}</p>
      ${content.budget_note ? `<p class="hero-note">${escapeHtml(content.budget_note)}</p>` : ''}
    </header>

    <div class="diagnostics-container" data-lang="${escapeHtml(lang)}">
      <!-- Skip Requests Card -->
      <section class="skip-request-card">
        <h3>${escapeHtml(content.unverified_skip_section_title || 'Prior Knowledge & Skip Requests')}</h3>
        <p class="skip-guidance-notice">${escapeHtml(content.unverified_skip_notice || '')}</p>
        <div class="skip-checkboxes">
          <label class="skip-chk-label">
            <input type="checkbox" id="chk-skip-py" value="python_fundamentals">
            <span>${escapeHtml(content.chk_skip_py_label || '')}</span>
          </label>
          <label class="skip-chk-label">
            <input type="checkbox" id="chk-skip-math" value="math_foundations">
            <span>${escapeHtml(content.chk_skip_math_label || '')}</span>
          </label>
        </div>
      </section>

      <!-- Questionnaire Form -->
      <section class="questionnaire-section">
        <div class="assistance-mode-bar">
          <span class="legend-label">${escapeHtml(ui.diag_mode)}</span>
          <label class="mode-label">
            <input type="radio" name="diag_assistance_mode" value="independent" checked>
            <span>${escapeHtml(content.assistance_independent_label || 'Independent (No AI)')}</span>
          </label>
          <label class="mode-label">
            <input type="radio" name="diag_assistance_mode" value="agent_assisted">
            <span>${escapeHtml(ui.diag_agent_mode)}</span>
          </label>
        </div>

        <div class="questions-list">
          ${questionsHtml}
        </div>

        <div class="diagnostics-submit-bar">
          <button type="button" class="btn btn-primary btn-submit-diagnostic">${escapeHtml(content.btn_submit || 'Submit Diagnostic')}</button>
          <span class="diag-status-message" hidden></span>
        </div>
      </section>

      <!-- Review Plan & Guidance Section -->
      <section class="review-plan-section" ${existingPlan ? '' : 'hidden'}>
        ${initialReviewPlanHtml}
      </section>
    </div>

  </main>`;

  return renderPage({
    lang,
    title: content.title,
    session: sessionUser,
    header: renderSiteHeader({ lang, active: 'diagnostics', langHref: l => `/${l}/diagnostics`, authHtml: authNavHtml }),
    main,
    footer: renderSiteFooter(lang),
    scripts: `<script id="current-user-data" type="application/json">${JSON.stringify(sessionUser ? { id: sessionUser.user_id, name: sessionUser.name, email: sessionUser.email } : null)}</script>
  <script id="i18n-diag-data" type="application/json">${JSON.stringify(content)}</script>
  <script src="/curriculum/assets/app.js"></script>`
  });
}

function renderTestProviderPage(state, provider = 'google', action = 'login') {
  // Development/test-only mock identity provider; never reachable in production,
  // so its copy stays English.
  const isGithub = provider === 'github';
  const providerName = isGithub ? 'GitHub' : 'Google';
  const actionLabel = action === 'link' ? 'Link Account' : 'Sign In';
  const callbackUrl = isGithub ? '/auth/github/callback' : '/auth/google/callback';
  const scopesHtml = isGithub
    ? `<div class="provider-scopes"><strong>Minimal scopes requested:</strong> <code class="scopes-granted">read:user, user:email</code><span class="scopes-policy-notice">Safe identity scopes only. Repository permissions are excluded.</span></div>`
    : `<div class="provider-scopes"><strong>Scopes requested:</strong> <code class="scopes-granted">openid, email, profile</code></div>`;
  const users = isGithub
    ? [['gh-alice', 'mock-code-gh-alice', 'Alice Walker (GitHub)', 'alice@example.com (gh-alice)'],
       ['gh-bob', 'mock-code-gh-bob', 'Bob Smith (GitHub)', 'bob@example.com (gh-bob)'],
       ['gh-charlie', 'mock-code-gh-charlie', 'Charlie Davis (GitHub)', 'charlie@example.com (gh-charlie)']]
    : [['alice', 'mock-code-alice', 'Alice Walker (Google)', 'alice@example.com'],
       ['bob', 'mock-code-bob', 'Bob Smith (Google)', 'bob@example.com']];
  const userOptionsHtml = users.map(([user, code, name, detail]) => `
      <form method="GET" action="${callbackUrl}">
        <input type="hidden" name="state" value="${escapeHtml(state)}">
        <input type="hidden" name="code" value="${code}">
        <button type="submit" data-user="${user}" class="provider-user">
          <span class="user-avatar" aria-hidden="true">${name.charAt(0)}</span>
          <span><strong>${name}</strong><span class="provider-user-detail">${detail}</span></span>
        </button>
      </form>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Mock ${providerName} Identity Provider</title>
  <link rel="icon" href="${FAVICON}">
  <link rel="stylesheet" href="/curriculum/assets/style.css">
</head>
<body>
  <main id="main" class="provider-page">
    <section class="panel provider-card">
      <p class="kicker">${PROVIDER_ICONS[isGithub ? 'github' : 'google']} Mock ${providerName}</p>
      <h1>${actionLabel}</h1>
      ${scopesHtml}
      <p class="provider-prompt">Choose a test learner identity:</p>
      <div class="provider-users">${userOptionsHtml}</div>
      <div class="provider-footer">
        <a class="provider-cancel" href="${callbackUrl}?error=access_denied&state=${encodeURIComponent(state)}">Cancel Authorization</a>
        <a href="${callbackUrl}?error=server_error&state=${encodeURIComponent(state)}">Simulate Provider Error</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function renderExportPage(lang, sessionUser) {
  const copy = {
    'zh-Hans': { title: '导出个人学习记录', intro: '下载仅属于你的便携 JSON 学习记录。自述证据和未完成记录会明确标注。', button: '生成并下载导出', auth: '请先登录后导出你的学习记录。', empty: '目前没有可导出的学习记录。', success: '导出已生成。', failure: '导出生成失败，请稍后重试。', format: '格式：便携 JSON；不包含会话密钥、令牌或其他用户记录。' },
    'zh-Hant': { title: '匯出個人學習記錄', intro: '下載只屬於你的可攜式 JSON 學習記錄。自述證據和未完成記錄會清楚標示。', button: '產生並下載匯出', auth: '請先登入後匯出你的學習記錄。', empty: '目前沒有可匯出的學習記錄。', success: '匯出已產生。', failure: '匯出產生失敗，請稍後再試。', format: '格式：可攜式 JSON；不包含工作階段密鑰、令牌或其他使用者記錄。' },
    en: { title: 'Export Personal Learning Records', intro: 'Download a portable JSON export of only your learning records. Self-reported evidence and incomplete records remain clearly labeled.', button: 'Generate and download export', auth: 'Sign in before exporting your learning records.', empty: 'There are no learning records to export yet.', success: 'Export generated.', failure: 'Export generation failed. Please try again later.', format: 'Format: portable JSON; session secrets, provider tokens, and other users’ records are excluded.' },
    ja: { title: '個人学習記録をエクスポート', intro: 'あなた自身の学習記録だけをポータブル JSON としてダウンロードします。自己申告の証拠と未完了の記録は明確に表示されます。', button: '生成してダウンロード', auth: '学習記録をエクスポートするには先にログインしてください。', empty: 'エクスポートできる学習記録はまだありません。', success: 'エクスポートを生成しました。', failure: 'エクスポートの生成に失敗しました。後でもう一度お試しください。', format: '形式：ポータブル JSON。セッション秘密情報、プロバイダートークン、他の利用者の記録は含まれません。' }
  }[lang] || null;
  if (!copy) return null;
  const ui = uiCopy(lang);
  const main = `<main id="main" class="main-content page-narrow">
    <header class="page-hero page-hero-compact">
      <p class="kicker">${escapeHtml(ui.nav_export)}</p>
      <h1>${escapeHtml(copy.title)}</h1>
      <p class="page-lead">${escapeHtml(copy.intro)}</p>
    </header>
    <section class="panel export-panel">
      <p class="export-format">${escapeHtml(copy.format)}</p>
      <div class="form-actions">
        <button id="export-button" class="btn-primary" type="button" ${sessionUser ? '' : 'disabled'}>${escapeHtml(copy.button)}</button>
      </div>
      <div id="export-status" class="form-status" role="status" aria-live="polite">${sessionUser ? '' : escapeHtml(copy.auth)}</div>
    </section>
  </main>`;
  return renderPage({
    lang,
    title: copy.title,
    session: sessionUser,
    header: renderSiteHeader({ lang, active: 'export', langHref: l => `/${l}/export`, authHtml: renderAuthNav(lang, sessionUser, `/${lang}/export`) }),
    main,
    footer: renderSiteFooter(lang),
    scripts: `<script>const button=document.getElementById('export-button');const status=document.getElementById('export-status');button?.addEventListener('click',async()=>{button.disabled=true;try{const response=await fetch('/api/export');if(!response.ok)throw new Error(String(response.status));const data=await response.json();const records=data.records||{};const count=Object.values(records).reduce((n,v)=>n+(Array.isArray(v)?v.length:(v?1:0)),0);if(!count){status.textContent=${JSON.stringify(copy.empty)};return;}const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='learning-records-export.json';link.click();URL.revokeObjectURL(url);status.textContent=${JSON.stringify(copy.success)};}catch(error){status.textContent=${JSON.stringify(copy.failure)};button.disabled=false;}});</script>`
  });
}

function serveStatic(res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Error boundary: a throw inside the async handler would otherwise become an
// unhandled rejection and take the whole process down.
const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    const status = err instanceof URIError ? 400 : 500;
    if (status === 500) console.error('Unhandled request error:', err && err.message);
    if (!res.headersSent) {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(status === 400 ? 'Bad Request' : 'Internal Server Error');
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, 'http://' + (req.headers.host || '127.0.0.1'));
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // Health check
  if (pathname === '/healthz') {
    let dbStatus = 'disconnected';
    const raw = db && db.rawDb ? db.rawDb : db;
    if (raw) {
      try {
        const check = raw.prepare('SELECT 1 as healthy').get();
        if (check && check.healthy === 1) {
          dbStatus = 'connected';
        }
      } catch {
        dbStatus = 'error';
      }
    }
    const isHealthy = dbStatus === 'connected';
    res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: isHealthy ? 'ok' : 'degraded',
      version: '1.0.0',
      database: dbStatus,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Auth: /api/auth/me
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const session = getSessionFromReq(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (!session) {
      res.end(JSON.stringify({ authenticated: false }));
    } else {
      res.end(JSON.stringify({
        authenticated: true,
        user: {
          id: session.user_id,
          email: session.email,
          name: session.name,
          provider: session.provider,
          selected_track: db.getUserTrack(session.user_id) || DEFAULT_TRACK,
          identities: session.identities || []
        }
      }));
    }
    return;
  }

  // Deliberate account deletion confirmation page (GET never mutates state)
  const accountMatch = pathname.match(/^\/([a-zA-Z-]+)\/account$/);
  if (accountMatch && req.method === 'GET') {
    const lang = SUPPORTED_LANGS.includes(accountMatch[1]) ? accountMatch[1] : DEFAULT_LANG;
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderAccountPage(lang, null));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(renderAccountPage(lang, session));
    return;
  }

  // Deliberate deletion API: authenticated, owner-scoped, CSRF-protected, idempotent
  if (pathname === '/api/account/delete' && req.method === 'POST') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (!requireCsrf(req, session)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'csrf validation failed' }));
      return;
    }
    try {
      const body = await readBodyJson(req);
      if (body.scope !== 'learning_records' || body.confirm_scope !== true || body.confirmation !== 'DELETE MY LEARNING RECORDS') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'explicit scope and confirmation are required' }));
        return;
      }
      const result = db.deleteLearningRecords(session.user_id);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(result));
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'learning record deletion failed' }));
    }
    return;
  }

  // Auth: /auth/google (OAuth start)
  if (pathname === '/auth/google') {
    const returnTo = sanitizeReturnTo(parsedUrl.searchParams.get('returnTo'));
    const adapter = testProviderEnabled ? null : oauth.adapters.google;
    if (!testProviderEnabled && !adapter) {
      res.writeHead(302, { Location: withQueryParam(returnTo, 'auth_error', 'provider_error') });
      res.end();
      return;
    }
    issueOAuthRedirect(res, 'google', returnTo, { action: 'login' }, adapter);
    return;
  }

  // Auth: /auth/github (OAuth start)
  if (pathname === '/auth/github') {
    const returnTo = sanitizeReturnTo(parsedUrl.searchParams.get('returnTo'));
    const adapter = testProviderEnabled ? null : oauth.adapters.github;
    if (!testProviderEnabled && !adapter) {
      res.writeHead(302, { Location: withQueryParam(returnTo, 'auth_error', 'provider_error') });
      res.end();
      return;
    }
    issueOAuthRedirect(res, 'github', returnTo, { action: 'login' }, adapter);
    return;
  }

  // Auth: /auth/link/github
  if (pathname === '/auth/link/github') {
    const session = getSessionFromReq(req);
    const returnTo = sanitizeReturnTo(parsedUrl.searchParams.get('returnTo'));
    if (!session) {
      res.writeHead(302, { Location: withQueryParam(returnTo, 'auth_error', 'session_expired') });
      res.end();
      return;
    }
    const adapter = testProviderEnabled ? null : oauth.adapters.github;
    if (!testProviderEnabled && !adapter) {
      res.writeHead(302, { Location: withQueryParam(returnTo, 'auth_error', 'provider_error') });
      res.end();
      return;
    }
    issueOAuthRedirect(res, 'github', returnTo, { action: 'link', userId: session.user_id }, adapter);
    return;
  }

  // Auth: /auth/link/google
  if (pathname === '/auth/link/google') {
    const session = getSessionFromReq(req);
    const returnTo = sanitizeReturnTo(parsedUrl.searchParams.get('returnTo'));
    if (!session) {
      res.writeHead(302, { Location: withQueryParam(returnTo, 'auth_error', 'session_expired') });
      res.end();
      return;
    }
    const adapter = testProviderEnabled ? null : oauth.adapters.google;
    if (!testProviderEnabled && !adapter) {
      res.writeHead(302, { Location: withQueryParam(returnTo, 'auth_error', 'provider_error') });
      res.end();
      return;
    }
    issueOAuthRedirect(res, 'google', returnTo, { action: 'link', userId: session.user_id }, adapter);
    return;
  }

  // Auth: /auth/test-provider (Mock Identity Provider UI)
  if (pathname === '/auth/test-provider') {
    if (!testProviderEnabled) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const state = parsedUrl.searchParams.get('state') || '';
    const provider = parsedUrl.searchParams.get('provider') || 'google';
    const action = parsedUrl.searchParams.get('action') || 'login';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderTestProviderPage(state, provider, action));
    return;
  }

  async function handleOAuthCallback(provider) {
    const errorParam = parsedUrl.searchParams.get('error');
    const state = parsedUrl.searchParams.get('state') || '';

    if (errorParam) {
      let returnUrl = `/${DEFAULT_LANG}/day-01`;
      if (state) {
        const stateRow = db.consumeOAuthState(state);
        if (stateRow && stateRow.provider === provider) returnUrl = sanitizeReturnTo(stateRow.return_url);
      }
      // Provider error strings are attacker-influenced; only the two known
      // values are ever reflected back to the page.
      const safeError = errorParam === 'access_denied' ? 'access_denied' : 'provider_error';
      res.writeHead(302, { Location: withQueryParam(returnUrl, 'auth_error', safeError) });
      res.end();
      return;
    }

    if (!state) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing OAuth state parameter');
      return;
    }

    const stateRow = db.consumeOAuthState(state);
    if (!stateRow) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid or expired OAuth state token');
      return;
    }

    // The consumed state is bound to the provider it was minted for; a state
    // arriving at the other provider's callback is rejected either way.
    if (stateRow.provider !== provider) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid OAuth state for this provider');
      return;
    }

    // A real-provider state only completes in the browser that started it.
    if (stateRow.browser_binding) {
      const nonce = parseCookies(req)[OAUTH_BIND_COOKIE] || '';
      const expected = Buffer.from(stateRow.browser_binding, 'hex');
      const actual = Buffer.from(hashBinding(nonce), 'hex');
      if (!nonce || !crypto.timingSafeEqual(expected, actual)) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('OAuth state does not belong to this browser');
        return;
      }
    }

    const returnUrl = sanitizeReturnTo(stateRow.return_url);
    const code = parsedUrl.searchParams.get('code');
    // Mock authorization codes are honored only while the test provider is
    // explicitly enabled outside production; otherwise the code goes through
    // the real provider exchange below.
    let profile;
    if (testProviderEnabled && provider === 'google') {
      if (code === 'mock-code-alice') {
        profile = {
          provider: 'google',
          providerUserId: 'mock-google-1',
          email: 'alice@example.com',
          name: 'Alice Walker'
        };
      } else if (code === 'mock-code-bob') {
        profile = {
          provider: 'google',
          providerUserId: 'mock-google-2',
          email: 'bob@example.com',
          name: 'Bob Smith'
        };
      }
    } else if (testProviderEnabled && provider === 'github') {
      if (code === 'mock-code-gh-alice') {
        profile = {
          provider: 'github',
          providerUserId: 'mock-gh-1',
          email: 'alice@example.com',
          name: 'Alice Walker'
        };
      } else if (code === 'mock-code-gh-bob') {
        profile = {
          provider: 'github',
          providerUserId: 'mock-gh-2',
          email: 'bob@example.com',
          name: 'Bob Smith'
        };
      } else if (code === 'mock-code-gh-charlie') {
        profile = {
          provider: 'github',
          providerUserId: 'mock-gh-3',
          email: 'charlie@example.com',
          name: 'Charlie Davis'
        };
      }
    }

    // Real provider exchange (D6): every adapter failure — non-2xx, missing
    // token, missing user id, timeout — collapses to auth_error=provider_error.
    if (!profile && !testProviderEnabled) {
      const adapter = oauth.adapters[provider];
      if (adapter && code) {
        try {
          profile = await adapter.exchange({
            code,
            codeVerifier: stateRow.code_verifier || '',
            redirectUri: oauthRedirectUri(provider)
          });
        } catch {
          res.writeHead(302, { Location: withQueryParam(returnUrl, 'auth_error', 'provider_error') });
          res.end();
          return;
        }
        if (profile.provider !== provider) profile = null;
      }
    }

    if (!profile) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid authorization code');
      return;
    }

    try {
      // If explicit linking action
      if (stateRow.action === 'link') {
        const session = getSessionFromReq(req);
        if (!session || session.user_id !== stateRow.user_id) {
          res.writeHead(302, { Location: withQueryParam(returnUrl, 'auth_error', 'session_expired') });
          res.end();
          return;
        }

        const linkResult = db.linkOAuthIdentity({
          userId: stateRow.user_id,
          provider: profile.provider,
          providerUserId: profile.providerUserId,
          email: profile.email,
          name: profile.name
        });

        if (linkResult.conflict) {
          res.writeHead(302, { Location: withQueryParam(returnUrl, 'auth_error', 'identity_conflict') });
          res.end();
          return;
        }

        res.writeHead(302, {
          ...(stateRow.browser_binding ? { 'Set-Cookie': OAUTH_BIND_CLEAR } : {}),
          Location: withQueryParam(returnUrl, 'linked', encodeURIComponent(profile.provider))
        });
        res.end();
        return;
      }

      // Normal sign-in action
      const user = db.upsertUser(profile);
      const session = db.createSession(user.id);
      const secureFlag = sessionSecureFlag(req);

      const sidCookie = `sid=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secureFlag}`;
      res.writeHead(302, {
        'Set-Cookie': stateRow.browser_binding ? [sidCookie, OAUTH_BIND_CLEAR] : sidCookie,
        Location: returnUrl
      });
      res.end();
    } catch {
      // A storage failure must not take the process down; the user sees the
      // same provider_error as any upstream failure.
      if (!res.headersSent) {
        res.writeHead(302, { Location: withQueryParam(returnUrl, 'auth_error', 'provider_error') });
        res.end();
      }
    }
  }

  // Auth: /auth/google/callback
  if (pathname === '/auth/google/callback') {
    await handleOAuthCallback('google');
    return;
  }

  // Auth: /auth/github/callback
  if (pathname === '/auth/github/callback') {
    await handleOAuthCallback('github');
    return;
  }

  // Logout is a session-scoped mutation, never a GET navigation.
  if (pathname === '/auth/logout') {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      res.end('Logout requires POST');
      return;
    }
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401);
      res.end('Sign in is required');
      return;
    }
    let validCsrf = requireCsrf(req, session);
    if (!validCsrf && (req.headers['content-type'] || '').split(';')[0].trim() === 'application/x-www-form-urlencoded') {
      let body = '';
      let size = 0;
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 4096) {
            res.writeHead(413);
            res.end('Logout form is too large');
            return;
          }
          body += chunk.toString();
        }
      } catch {
        res.writeHead(400);
        res.end('Invalid logout form');
        return;
      }
      const token = new URLSearchParams(body).get('csrf_token');
      validCsrf = typeof token === 'string' && token.length > 0 && token === session.csrf_token;
    }
    if (!validCsrf) {
      res.writeHead(403);
      res.end('CSRF validation failed');
      return;
    }
    db.deleteSession(parseCookies(req).sid);
    res.writeHead(303, {
      'Set-Cookie': `sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${sessionSecureFlag(req)}`,
      Location: '/'
    });
    res.end();
    return;
  }

  // Content correction reports (spec US59): POST /api/corrections
  if (pathname === '/api/corrections' && req.method === 'POST') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (!requireCsrf(req, session)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'csrf' }));
      return;
    }
    let body;
    try {
      body = await readBodyJson(req);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_json' }));
      return;
    }
    const reject = (status, error) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error }));
    };
    if (!body || typeof body !== 'object') return reject(400, 'invalid_body');
    if (body.user_id !== undefined && body.user_id !== session.user_id) return reject(403, 'client_user_id_rejected');
    const dayId = typeof body.day_id === 'string' ? body.day_id : '';
    const lang = typeof body.lang === 'string' ? body.lang : '';
    if (!/^day-\d{2}$/.test(dayId)) return reject(400, 'invalid_day_id');
    if (!SUPPORTED_LANGS.includes(lang)) return reject(400, 'invalid_lang');
    let dayMeta;
    try {
      dayMeta = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum', 'days', `${dayId}.json`), 'utf8'));
    } catch {
      return reject(400, 'unknown_day_id');
    }
    const activityId = body.activity_id === null || body.activity_id === undefined || body.activity_id === '' ? null : body.activity_id;
    if (activityId !== null && !(dayMeta.activities || []).some(a => a.id === activityId)) {
      return reject(400, 'activity_not_in_day');
    }
    const editionRevision = typeof body.edition_revision === 'string' ? body.edition_revision.trim() : '';
    if (!/^[0-9a-z]{1,64}$/i.test(editionRevision)) return reject(400, 'edition_revision_required');
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (!description) return reject(400, 'description_required');
    if (description.length > CORRECTION_MAX_LENGTH) return reject(400, 'description_too_long');
    let current;
    try { current = editionRevisionOf(dayId, lang); } catch { return reject(400, 'unknown_edition'); }
    const report = db.createContentCorrection({
      userId: session.user_id, dayId, lang, activityId, editionRevision,
      revisionCurrent: editionRevision === current, description
    });
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(report));
    return;
  }

  // Portable export API: GET /api/export. Ownership is derived only from the session.
  if (pathname === '/api/export' && req.method === 'GET') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    try {
      const exportData = db.getPortableLearningExport(session.user_id);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="learning-records-export.json"',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(exportData));
    } catch (error) {
      console.error('Portable export generation failed:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'export_generation_failed' }));
    }
    return;
  }

  // Guessed-identifier protection: never accept a user id as export authority.
  const userExportMatch = pathname.match(/^\/api\/users\/([^\/]+)\/export$/);
  if (userExportMatch && req.method === 'GET') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (userExportMatch[1] !== session.user_id) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'use_session_scoped_export_endpoint' }));
    return;
  }

  // Progress API: GET /api/progress
  if (pathname === '/api/progress' && req.method === 'GET') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const dayId = parsedUrl.searchParams.get('dayId') || '';
    const records = db.getAllProgress(session.user_id, dayId);
    const progressMap = {};
    for (const r of records) {
      progressMap[r.activity_id] = {
        draft_text: r.draft_text,
        completed: !!r.completed,
        version: r.version,
        updated_at: r.updated_at
      };
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user_id: session.user_id, progress: progressMap }));
    return;
  }

  // Progress API: POST /api/progress
  if (pathname === '/api/progress' && req.method === 'POST') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (!requireCsrf(req, session)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'csrf' }));
      return;
    }

    try {
      const body = await readBodyJson(req);
      const activityId = body.activity_id;
      if (typeof activityId !== 'string' || activityId.length > 128 || !/^[a-z0-9][a-z0-9_.:-]*$/.test(activityId) || !isKnownActivityId(activityId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'activity_id must name a known curriculum activity and use 1-128 lowercase identifier characters' }));
        return;
      }
      const draftText = body.draft_text === undefined ? '' : String(body.draft_text);
      if (Buffer.byteLength(draftText, 'utf8') > 65536) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'draft_text exceeds maximum limit of 65536 bytes' }));
        return;
      }

      // Multi-user isolation enforcement:
      // Client cannot specify another user_id to manipulate ownership
      if (body.user_id && body.user_id !== session.user_id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: Client-controlled user identity rejected' }));
        return;
      }

      const saveResult = db.saveProgress({
        userId: session.user_id,
        activityId,
        draftText,
        completed: body.completed ? 1 : 0,
        expectedVersion: body.version !== undefined ? Number(body.version) : null
      });

      if (saveResult.conflict) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'conflict',
          current_version: saveResult.currentVersion,
          current_progress: saveResult.currentProgress
        }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        version: saveResult.version,
        updated_at: saveResult.updated_at
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Progress API: GET /api/users/:userId/progress (Guessed identifier protection)
  const userProgressMatch = pathname.match(/^\/api\/users\/([^\/]+)\/progress$/);
  if (userProgressMatch && req.method === 'GET') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const requestedUserId = userProgressMatch[1];
    if (requestedUserId !== session.user_id) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Access denied to requested user progress' }));
      return;
    }

    const records = db.getAllProgress(session.user_id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user_id: session.user_id, records }));
    return;
  }

  // Agent Tracks API: GET /api/tracks (All 4 alternative tracks registry)
  if (pathname === '/api/tracks' && req.method === 'GET') {
    const registryPath = path.join(ROOT, 'curriculum', 'agent-tracks', 'registry.json');
    if (!fs.existsSync(registryPath)) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Tracks registry missing' }));
      return;
    }
    let registry;
    try {
      registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Tracks registry is invalid' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(registry));
    return;
  }

  // Agent Track API: GET /api/track
  if (pathname === '/api/track' && req.method === 'GET') {
    const session = getSessionFromReq(req);
    const selectedTrack = session ? (db.getUserTrack(session.user_id) || DEFAULT_TRACK) : null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      selected_track: selectedTrack,
      authenticated: !!session
    }));
    return;
  }

  // Agent Track API: POST /api/track
  if (pathname === '/api/track' && req.method === 'POST') {
    const session = getSessionFromReq(req);
    if (session && !requireCsrf(req, session)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'csrf' }));
      return;
    }
    try {
      const body = await readBodyJson(req);
      const track = body.track || body.track_id;

      if (!track || !VALID_TRACKS.includes(track)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: `Invalid agent tool track: ${escapeHtml(track || '')}. Valid tracks: ${VALID_TRACKS.join(', ')}`
        }));
        return;
      }

      if (session) {
        // Multi-user isolation enforcement: reject client spoofing another user_id
        if (body.user_id && body.user_id !== session.user_id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden: Client-controlled user identity rejected' }));
          return;
        }

        db.setUserTrack(session.user_id, track);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          selected_track: track,
          user_id: session.user_id
        }));
        return;
      }

      // Guest mode
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        selected_track: track,
        guest: true
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Quiz API: POST /api/quiz/submit
  if (pathname === '/api/quiz/submit' && req.method === 'POST') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (!requireCsrf(req, session)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'csrf' }));
      return;
    }

    try {
      const body = await readBodyJson(req);

      // Multi-user isolation enforcement:
      // Client cannot specify another user_id to manipulate ownership
      if (body.user_id && body.user_id !== session.user_id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: Client-controlled user identity rejected' }));
        return;
      }

      const activityId = body.activity_id;
      if (!activityId || typeof activityId !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'activity_id string required' }));
        return;
      }

      const assistanceMode = body.assistance_mode;
      if (assistanceMode !== 'independent' && assistanceMode !== 'agent_assisted') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Invalid assistance mode. Must be 'independent' or 'agent_assisted'" }));
        return;
      }

      const quizDef = getActivityQuizDef(activityId);
      if (!quizDef || !quizDef.quiz) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Quiz not found for activity: ${activityId}` }));
        return;
      }

      if (typeof body.content_revision !== 'string' || !body.content_revision.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 'content_revision_required', error: 'The displayed content revision is required. Reload this lesson before submitting.' }));
        return;
      }
      if (body.content_revision !== quizDef.content_revision) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 'stale_content_revision', current_revision: quizDef.content_revision, error: 'This lesson changed after the page was opened. Reload and revalidate your answers before submitting.' }));
        return;
      }

      const answers = (typeof body.answers === 'object' && body.answers !== null && !Array.isArray(body.answers))
        ? body.answers
        : {};

      // Deterministic server-side grading against declared answer key
      const gradeResult = gradeQuiz(quizDef.quiz, answers);

      // Persist attempt with content revision and declared assistance mode
      const attempt = db.recordQuizAttempt({
        userId: session.user_id,
        activityId,
        contentRevision: quizDef.content_revision,
        assistanceMode,
        answers,
        score: gradeResult.score,
        passed: gradeResult.passed ? 1 : 0
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        attempt_id: attempt.id,
        score: gradeResult.score,
        passed: gradeResult.passed,
        assistance_mode: assistanceMode,
        content_revision: quizDef.content_revision,
        results: gradeResult.results,
        created_at: attempt.created_at
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Agent Track API: GET /api/users/:userId/track (Guessed identifier protection)
  const userTrackMatch = pathname.match(/^\/api\/users\/([^\/]+)\/track$/);
  if (userTrackMatch && req.method === 'GET') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const requestedUserId = userTrackMatch[1];
    if (requestedUserId !== session.user_id) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Access denied to requested user track' }));
      return;
    }

    const track = db.getUserTrack(session.user_id) || DEFAULT_TRACK;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user_id: session.user_id, selected_track: track }));
    return;
  }

  // Quiz API: GET /api/quiz/attempts
  if (pathname === '/api/quiz/attempts' && req.method === 'GET') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const activityId = parsedUrl.searchParams.get('activityId');
    if (!activityId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'activityId query parameter required' }));
      return;
    }

    const quizDef = getActivityQuizDef(activityId);
    const currentRevision = quizDef ? quizDef.content_revision : null;
    const summary = db.getUserMasterySummary(session.user_id, activityId, currentRevision);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      activity_id: activityId,
      current_revision: currentRevision,
      summary
    }));
    return;
  }

  // Quiz API: GET /api/users/:userId/quiz-attempts (Guessed identifier protection)
  const userQuizAttemptsMatch = pathname.match(/^\/api\/users\/([^\/]+)\/quiz-attempts$/);
  if (userQuizAttemptsMatch && req.method === 'GET') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const requestedUserId = userQuizAttemptsMatch[1];
    if (requestedUserId !== session.user_id) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Access denied to requested user quiz attempts' }));
      return;
    }

    const attempts = db.getQuizAttempts(session.user_id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user_id: session.user_id, attempts }));
    return;
  }

  // Project Submission API: POST /api/project/submit
  if (pathname === '/api/project/submit' && req.method === 'POST') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (!requireCsrf(req, session)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'csrf' }));
      return;
    }

    try {
      const body = await readBodyJson(req);

      // Multi-user isolation enforcement:
      // Client cannot specify another user_id to manipulate ownership
      if (body.user_id && body.user_id !== session.user_id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: Client-controlled user identity rejected' }));
        return;
      }

      const projectId = body.project_id || body.activity_id;
      if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'project_id string required' }));
        return;
      }

      const assistanceMode = body.assistance_mode;
      if (assistanceMode !== 'independent' && assistanceMode !== 'agent_assisted') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Invalid assistance mode. Must be 'independent' or 'agent_assisted'" }));
        return;
      }

      const repoUrl = body.repo_url !== undefined ? String(body.repo_url).trim() : '';
      const reportUrl = body.report_url !== undefined ? String(body.report_url).trim() : '';
      const textNotes = body.text_notes !== undefined ? String(body.text_notes).trim() : '';

      if (!repoUrl && !reportUrl && !textNotes) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'At least one of repo_url, report_url, or text_notes must be provided.' }));
        return;
      }

      // Check URL validity and protocol
      if (repoUrl) {
        let p;
        try { p = new URL(repoUrl); } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid URL: repo_url must be a valid URL.' }));
          return;
        }
        if (p.protocol !== 'http:' && p.protocol !== 'https:') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid URL scheme: repo_url must use http or https protocol.' }));
          return;
        }
      }

      if (reportUrl) {
        let p;
        try { p = new URL(reportUrl); } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid URL: report_url must be a valid URL.' }));
          return;
        }
        if (p.protocol !== 'http:' && p.protocol !== 'https:') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid URL scheme: report_url must use http or https protocol.' }));
          return;
        }
      }

      // Bounded constraints: <= 4096 bytes
      if (Buffer.byteLength(textNotes, 'utf8') > 4096) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large: text_notes exceeds maximum limit of 4096 bytes.' }));
        return;
      }

      const selectedTrack = body.selected_track;
      if (selectedTrack !== undefined && selectedTrack !== null && !VALID_TRACKS.includes(selectedTrack)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'selected_track must be null or a valid agent tool track' }));
        return;
      }

      const revision = body.revision || body.content_revision || '1.0.0';

      // Crucial security invariant: No arbitrary server-side fetching of submitted URLs!
      // The links are stored safely without any outbound network calls.

      const submission = db.saveProjectSubmission({
        userId: session.user_id,
        projectId,
        revision,
        assistanceMode,
        selectedTrack,
        repoUrl,
        reportUrl,
        textNotes
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        submission
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Project Submission API: GET /api/project/submission
  if (pathname === '/api/project/submission' && req.method === 'GET') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const projectId = parsedUrl.searchParams.get('projectId') || parsedUrl.searchParams.get('activityId');
    if (!projectId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'projectId or activityId query parameter required' }));
      return;
    }

    let currentRevision = null;
    const match = projectId.match(/^(day-\d{2})/);
    if (match) {
      const dayId = match[1];
      const dayMetaPath = path.join(ROOT, 'curriculum', 'days', `${dayId}.json`);
      if (fs.existsSync(dayMetaPath)) {
        try {
          const dayMeta = JSON.parse(fs.readFileSync(dayMetaPath, 'utf8'));
          const act = (dayMeta.activities || []).find(a => a.id === projectId);
          if (act) currentRevision = act.content_revision || '1.0.0';
        } catch {}
      }
    }

    const summary = db.getProjectMasterySummary(session.user_id, projectId, currentRevision);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      project_id: projectId,
      current_revision: currentRevision,
      submission: summary.submission,
      summary
    }));
    return;
  }

  // Project API: GET /api/users/:userId/project-submissions (Guessed identifier protection)
  const userProjectSubmissionsMatch = pathname.match(/^\/api\/users\/([^\/]+)\/project-submissions$/);
  if (userProjectSubmissionsMatch && req.method === 'GET') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const requestedUserId = userProjectSubmissionsMatch[1];
    if (requestedUserId !== session.user_id) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Access denied to requested user project submissions' }));
      return;
    }

    const submissions = db.getAllProjectSubmissions(session.user_id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user_id: session.user_id, submissions }));
    return;
  }

  // Diagnostics API: GET /api/diagnostics
  if (pathname === '/api/diagnostics' && req.method === 'GET') {
    const lang = parsedUrl.searchParams.get('lang') || DEFAULT_LANG;
    const diagDef = getPrerequisitesDiagnosticDef();
    const content = getDiagnosticContent(lang);
    const session = getSessionFromReq(req);
    const savedPlan = session ? db.getReviewPlan(session.user_id) : null;

    const sanitizedQuestions = (diagDef ? diagDef.questions : []).map(q => {
      const qContent = (content.questions && content.questions[q.id]) || {};
      return {
        id: q.id,
        concept_id: q.concept_id,
        domain: q.domain,
        title: qContent.title,
        prompt: qContent.prompt,
        choices: qContent.choices,
        hint: qContent.hint,
        activity_id: q.activity_id,
        target_day: q.target_day
      };
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      diagnostic: {
        id: diagDef ? diagDef.id : 'diagnostic-prerequisites',
        content_revision: diagDef ? diagDef.content_revision : '1.0.0',
        questions: sanitizedQuestions
      },
      saved_plan: savedPlan
    }));
    return;
  }

  // Diagnostics API: POST /api/diagnostics/submit
  if (pathname === '/api/diagnostics/submit' && req.method === 'POST') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (!requireCsrf(req, session)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'csrf' }));
      return;
    }

    try {
      const body = await readBodyJson(req);

      // Multi-user isolation enforcement:
      // Client cannot specify another user_id to manipulate ownership
      if (body.user_id && body.user_id !== session.user_id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: Client-controlled user identity rejected' }));
        return;
      }

      const answers = (typeof body.answers === 'object' && body.answers !== null && !Array.isArray(body.answers))
        ? body.answers
        : {};
      const diagDef = getPrerequisitesDiagnosticDef();
      const validQuestionIds = new Set((diagDef && diagDef.questions || []).map(q => q.id));
      const validDomainIds = new Set(Object.keys((diagDef && diagDef.domains) || {}));
      const uncertainQuestions = Array.isArray(body.uncertain_questions) ? body.uncertain_questions : [];
      const claimedSkips = Array.isArray(body.claimed_skips) ? body.claimed_skips : [];
      const answerKeys = Object.keys((typeof body.answers === 'object' && body.answers !== null && !Array.isArray(body.answers)) ? body.answers : {});
      const invalidQuestionIds = [...new Set([
        ...answerKeys.filter(id => !validQuestionIds.has(id)),
        ...uncertainQuestions.filter(id => !validQuestionIds.has(id))
      ])];
      const invalidDomains = [...new Set(claimedSkips.filter(id => !validDomainIds.has(id)))];
      if (invalidQuestionIds.length || invalidDomains.length) {
        throw new Error(`Invalid diagnostic reference: questions=${invalidQuestionIds.join(',') || 'none'} domains=${invalidDomains.join(',') || 'none'}`);
      }
      if (uncertainQuestions.length > validQuestionIds.size || claimedSkips.length > validDomainIds.size) {
        throw new Error('Diagnostic reference list is too large');
      }
      if (body.assistance_mode && !['independent', 'agent_assisted'].includes(body.assistance_mode)) {
        throw new Error('Invalid assistance mode');
      }
      const assistanceMode = body.assistance_mode || 'independent';
      const lang = body.lang || DEFAULT_LANG;

      const graded = gradeDiagnostics({
        answers,
        uncertainQuestions,
        assistanceMode,
        claimedSkips,
        lang
      });

      const saved = db.saveReviewPlan({
        userId: session.user_id,
        diagnosticsSummary: graded.diagnostics_summary,
        recommendedPlan: graded.recommended_plan,
        items: graded.items
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        id: saved.id,
        diagnostics_summary: graded.diagnostics_summary,
        recommended_plan: graded.recommended_plan,
        items: graded.items,
        updated_at: saved.updated_at
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Diagnostics API: GET /api/diagnostics/review-plan
  if (pathname === '/api/diagnostics/review-plan' && req.method === 'GET') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const plan = db.getReviewPlan(session.user_id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      has_plan: !!plan,
      plan: plan || null
    }));
    return;
  }

  // Diagnostics API: GET /api/users/:userId/review-plan (Guessed identifier protection)
  const userReviewPlanMatch = pathname.match(/^\/api\/users\/([^\/]+)\/review-plan$/);
  if (userReviewPlanMatch && req.method === 'GET') {
    const session = getSessionFromReq(req);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const requestedUserId = userReviewPlanMatch[1];
    if (requestedUserId !== session.user_id) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Access denied to requested user review plan' }));
      return;
    }

    const plan = db.getReviewPlan(session.user_id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user_id: session.user_id, plan }));
    return;
  }

  // Export page redirect
  if (pathname === '/export') {
    res.writeHead(302, { Location: `/${DEFAULT_LANG}/export` });
    res.end();
    return;
  }

  // Localized export page
  const exportPageMatch = pathname.match(/^\/([a-zA-Z-]+)\/export$/);
  if (exportPageMatch) {
    const [, lang] = exportPageMatch;
    if (!SUPPORTED_LANGS.includes(lang)) {
      res.writeHead(302, { Location: `/${DEFAULT_LANG}/export` });
      res.end();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    const html = renderExportPage(lang, getSessionFromReq(req));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Root redirect
  if (pathname === '/' || pathname === '') {
    res.writeHead(302, { Location: `/${DEFAULT_LANG}/day-01` });
    res.end();
    return;
  }

  // Calendar route redirect
  if (pathname === '/calendar') {
    res.writeHead(302, { Location: `/${DEFAULT_LANG}/calendar` });
    res.end();
    return;
  }

  // Diagnostics route redirect
  if (pathname === '/diagnostics') {
    res.writeHead(302, { Location: `/${DEFAULT_LANG}/diagnostics` });
    res.end();
    return;
  }

  // Localized Diagnostics route: /{lang}/diagnostics
  const diagnosticsMatch = pathname.match(/^\/([a-zA-Z-]+)\/diagnostics$/);
  if (diagnosticsMatch) {
    const [, lang] = diagnosticsMatch;
    if (!SUPPORTED_LANGS.includes(lang)) {
      res.writeHead(302, { Location: `/${DEFAULT_LANG}/diagnostics` });
      res.end();
      return;
    }
    const sessionUser = getSessionFromReq(req);
    res.setHeader('Cache-Control', 'no-store');
    const html = renderDiagnosticsPage(lang, sessionUser);
    if (!html) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Diagnostics page not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Agent Track route redirect
  if (pathname === '/agent-track') {
    res.writeHead(302, { Location: `/${DEFAULT_LANG}/agent-track` });
    res.end();
    return;
  }

  // Localized Agent Track route: /{lang}/agent-track
  const agentTrackMatch = pathname.match(/^\/([a-zA-Z-]+)\/agent-track$/);
  if (agentTrackMatch) {
    const [, lang] = agentTrackMatch;
    if (!SUPPORTED_LANGS.includes(lang)) {
      res.writeHead(302, { Location: `/${DEFAULT_LANG}/agent-track` });
      res.end();
      return;
    }
    const sessionUser = getSessionFromReq(req);
    res.setHeader('Cache-Control', 'no-store');
    const html = renderAgentTrackPage(lang, sessionUser);
    if (!html) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Agent track page not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Localized Calendar route: /{lang}/calendar
  const calendarMatch = pathname.match(/^\/([a-zA-Z-]+)\/calendar$/);
  if (calendarMatch) {
    const [, lang] = calendarMatch;
    if (!SUPPORTED_LANGS.includes(lang)) {
      res.writeHead(302, { Location: `/${DEFAULT_LANG}/calendar` });
      res.end();
      return;
    }
    const html = renderCalendarPage(lang);
    if (!html) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Calendar not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Localized Day route: /{lang}/day-{NN}
  const dayMatch = pathname.match(/^\/([a-zA-Z-]+)\/(day-\d{2})$/);
  if (dayMatch) {
    const [, lang, dayId] = dayMatch;
    if (!SUPPORTED_LANGS.includes(lang)) {
      res.writeHead(302, { Location: `/${DEFAULT_LANG}/${dayId}` });
      res.end();
      return;
    }
    const sessionUser = getSessionFromReq(req);
    res.setHeader('Cache-Control', 'no-store');
    const html = renderDayPage(dayId, lang, sessionUser);
    if (!html) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Day not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Static files under /lessons/
  if (pathname.startsWith('/lessons/')) {
    const relativePath = pathname.replace(/^\/lessons\//, '');
    const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(ROOT, 'lessons', safePath);
    serveStatic(res, fullPath);
    return;
  }

  // Static files under /assets/
  if (pathname.startsWith('/assets/')) {
    const relativePath = pathname.replace(/^\/assets\//, '');
    const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(ROOT, 'assets', safePath);
    serveStatic(res, fullPath);
    return;
  }

  // Static files under /curriculum/assets/
  if (pathname.startsWith('/curriculum/assets/')) {
    const relativePath = pathname.replace(/^\/curriculum\/assets\//, '');
    const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(ROOT, 'curriculum', 'assets', safePath);
    serveStatic(res, fullPath);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

const listenPort = config.port;
const listenHost = config.host;

server.listen(listenPort, listenHost, () => {
  const address = server.address();
  console.log(`Server listening on http://127.0.0.1:${address.port}`);
});

let shuttingDown = false;

function gracefulShutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  // server.close waits for active requests to drain before the database and
  // maintenance lock are released.
  server.close(() => {
    const raw = db && db.rawDb ? db.rawDb : db;
    if (raw) {
      try {
        raw.close();
      } catch {}
    }
    releaseDatabaseLock();
    process.exit(0);
  });
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = server;
module.exports.server = server;
module.exports.db = db;
module.exports.config = config;
