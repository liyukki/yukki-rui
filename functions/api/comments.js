/**
 * 公开评论 API（Cloudflare Pages Functions）。
 *
 *   GET  /api/comments?thread=/zh/posts/x/&before=12&limit=20
 *   POST /api/comments  { thread, author, body, website?, trap?, elapsed? }
 *   OPTIONS /api/comments
 *
 * 免登录；防刷 = 蜜罐字段 + 最小填写时间 + 按 IP 哈希限流。
 * 只存 sha256(ip + salt)，不存明文 IP。
 */

export const ALLOWED_ORIGINS = new Set([
  'https://yukki-rui.pages.dev',
  'https://liyukki.github.io',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
]);

export const LIMITS = {
  authorMax: 40,
  bodyMax: 2000,
  websiteMax: 200,
  pageSize: 20,
  pageSizeMax: 50,
  minElapsed: 1500,
  rateWindowMs: 60_000,
  rateDayMs: 86_400_000,
  rateDayMax: 20,
};

const THREAD_RE = /^\/[A-Za-z0-9._~%/-]{1,200}$/;
const WEBSITE_RE = /^https?:\/\/[^\s]{1,200}$/i;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread TEXT NOT NULL,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    website TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT ''
  )`,
  'CREATE INDEX IF NOT EXISTS idx_comments_thread ON comments (thread, id)',
  'CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments (ip_hash, created_at)',
  // 旧库升级:parent_id / hidden 用幂等 ALTER 补上,已存在的列在 ensureSchema 里静默跳过。
  'ALTER TABLE comments ADD COLUMN parent_id INTEGER',
  'ALTER TABLE comments ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0',
];

/** 每个 D1 绑定只建一次表；用 WeakMap 让单测里的多个库互不影响。 */
const schemaReady = new WeakMap();

export async function ensureSchema(db) {
  const pending = schemaReady.get(db);
  if (pending) return pending;
  const task = (async () => {
    for (const sql of SCHEMA) {
      try {
        await db.prepare(sql).run();
      } catch (error) {
        // CREATE TABLE IF NOT EXISTS 之后的 ALTER 在升级过的库上会报 duplicate column,直接跳过。
        if (!/duplicate column name/i.test(String(error?.message ?? error))) throw error;
      }
    }
  })().catch((error) => {
    schemaReady.delete(db);
    throw error;
  });
  schemaReady.set(db, task);
  return task;
}

/** thread 规整：必须是站内绝对路径，非法返回 null。 */
export function normalizeThread(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return THREAD_RE.test(value) ? value : null;
}

function cleanText(raw) {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
}

/** 校验一条新评论；通过时返回规整后的值。 */
export function validateNewComment(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'invalid-body', message: '请求内容不合法' };
  }
  const thread = normalizeThread(input.thread);
  if (!thread) return { ok: false, error: 'invalid-thread', message: '评论对象不合法' };

  const author = cleanText(input.author);
  if (author === '') return { ok: false, error: 'invalid-author', message: '昵称不能为空' };
  if ([...author].length > LIMITS.authorMax) {
    return { ok: false, error: 'invalid-author', message: `昵称最多 ${LIMITS.authorMax} 个字` };
  }

  const body = cleanText(input.body);
  if (body === '') return { ok: false, error: 'invalid-body', message: '评论内容不能为空' };
  if ([...body].length > LIMITS.bodyMax) {
    return { ok: false, error: 'invalid-body', message: `评论最多 ${LIMITS.bodyMax} 个字` };
  }

  const website = cleanText(input.website);
  if (website !== '' && !WEBSITE_RE.test(website)) {
    return { ok: false, error: 'invalid-website', message: '网址要以 http:// 或 https:// 开头' };
  }
  if ([...website].length > LIMITS.websiteMax) {
    return { ok: false, error: 'invalid-website', message: '网址太长了' };
  }

  const parentId = normalizeParentId(input.parentId);
  if (Number.isNaN(parentId)) return { ok: false, error: 'invalid-parent', message: '回复对象不合法' };

  return { ok: true, value: { thread, author, body, website, parentId } };
}

/** 父评论编号:空 / 缺省 = 根评论;填错(非正整数)返回 NaN,由调用方给出 invalid-parent。 */
export function normalizeParentId(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : NaN;
}

export function clampLimit(raw, fallback = LIMITS.pageSize) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), LIMITS.pageSizeMax);
}

export function parseId(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

/** 数据库行 → 公开字段（不泄漏 ip_hash / user_agent）。 */
export function toView(row) {
  const record = row ?? {};
  return {
    id: Number(record.id ?? 0),
    parentId: record.parent_id == null ? null : Number(record.parent_id),
    author: String(record.author ?? ''),
    body: String(record.body ?? ''),
    website: String(record.website ?? ''),
    createdAt: String(record.created_at ?? ''),
  };
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

export function isAllowedOrigin(origin, requestUrl) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (isLocalHost(parsed.hostname)) return true;
  try {
    return parsed.origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

export function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (!origin || !isAllowedOrigin(origin, request.url)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function jsonResponse(request, body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request),
    },
  });
}

function errorResponse(request, status, error, message) {
  return jsonResponse(request, { error, message }, status);
}

export function onRequestOptions(context) {
  const { request } = context;
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, request.url)) {
    return errorResponse(request, 403, 'origin-not-allowed', '来源不被允许');
  }
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store', ...corsHeaders(request) },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, request.url)) {
    return errorResponse(request, 403, 'origin-not-allowed', '来源不被允许');
  }

  const url = new URL(request.url);
  const thread = normalizeThread(url.searchParams.get('thread'));
  if (!thread) return errorResponse(request, 400, 'invalid-thread', '评论对象不合法');
  if (!env || !env.DB) return errorResponse(request, 503, 'db-missing', '评论服务还没配置好');

  await ensureSchema(env.DB);
  const limit = clampLimit(url.searchParams.get('limit'));
  const before = parseId(url.searchParams.get('before'));

  // 分页只数根评论;回复跟着所属根评论一起返回,不占分页名额。
  const totalRow = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM comments WHERE thread = ? AND parent_id IS NULL AND hidden = 0')
    .bind(thread)
    .first();

  const rootSql = `SELECT id, parent_id, author, body, website, created_at, hidden
    FROM comments WHERE thread = ? AND parent_id IS NULL AND hidden = 0`;
  const roots = before
    ? await env.DB
        .prepare(`${rootSql} AND id < ? ORDER BY id DESC LIMIT ?`)
        .bind(thread, before, limit + 1)
        .all()
    : await env.DB.prepare(`${rootSql} ORDER BY id DESC LIMIT ?`).bind(thread, limit + 1).all();

  const rootRows = Array.isArray(roots?.results) ? roots.results : [];
  const visibleRoots = rootRows.slice(0, limit);
  const repliesByParent = new Map();

  if (visibleRoots.length > 0) {
    const placeholders = visibleRoots.map(() => '?').join(',');
    const replyRows = await env.DB
      .prepare(`SELECT id, parent_id, author, body, website, created_at
        FROM comments WHERE hidden = 0 AND parent_id IN (${placeholders}) ORDER BY id ASC`)
      .bind(...visibleRoots.map((row) => Number(row.id)))
      .all();
    for (const row of Array.isArray(replyRows?.results) ? replyRows.results : []) {
      const view = toView(row);
      const replies = repliesByParent.get(view.parentId) ?? [];
      replies.push(view);
      repliesByParent.set(view.parentId, replies);
    }
  }

  const items = visibleRoots.map((row) => {
    const view = toView(row);
    const replies = repliesByParent.get(view.id) ?? [];
    return { ...view, replies, replyCount: replies.length };
  });
  const nextBefore = rootRows.length > limit && items.length > 0 ? items[items.length - 1].id : null;
  return jsonResponse(request, { items, total: Number(totalRow?.n ?? 0), nextBefore }, 200);
}

async function isRateLimited(db, ipHash, now, options = {}) {
  // 回复不占用根评论的 60 秒窗口:否则刚发完根评论就无法在楼下回复自己人。
  // 24 小时总量仍然共用,防止用回复绕过总配额。
  if (!options.isReply) {
    const windowStart = new Date(now - LIMITS.rateWindowMs).toISOString();
    const recent = await db
      .prepare('SELECT id FROM comments WHERE ip_hash = ? AND created_at > ? LIMIT 1')
      .bind(ipHash, windowStart)
      .first();
    if (recent) return true;
  }

  const dayStart = new Date(now - LIMITS.rateDayMs).toISOString();
  const dayRow = await db
    .prepare('SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, dayStart)
    .first();
  return Number(dayRow?.n ?? 0) >= LIMITS.rateDayMax;
}

function clientIp(request) {
  const direct = request.headers.get('CF-Connecting-IP');
  if (direct) return direct.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return '0.0.0.0';
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('Origin');
  if (origin && !isAllowedOrigin(origin, request.url)) {
    return errorResponse(request, 403, 'origin-not-allowed', '来源不被允许');
  }
  if (!env || !env.DB) return errorResponse(request, 503, 'db-missing', '评论服务还没配置好');

  let payload;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(request, 400, 'invalid-json', '请求内容不合法');
  }

  const checked = validateNewComment(payload);
  if (!checked.ok) return errorResponse(request, 400, checked.error, checked.message);
  const { value } = checked;

  // 蜜罐：真人看不到这个字段，填了就是脚本。
  if (typeof payload.trap === 'string' && payload.trap.trim() !== '') {
    return errorResponse(request, 400, 'spam-detected', '提交被拒绝');
  }
  // 最小填写时间：从聚焦表单到点提交，太快的是脚本。
  const elapsed = Number(payload.elapsed);
  if (Number.isFinite(elapsed) && elapsed < LIMITS.minElapsed) {
    return errorResponse(request, 400, 'too-fast', '提交太快了，刷新页面后再试');
  }

  await ensureSchema(env.DB);
  const now = Date.now();
  const ipHash = await sha256Hex(`${clientIp(request)}:${env.COMMENTS_SALT || 'yukki-rui'}`);
  if (await isRateLimited(env.DB, ipHash, now, { isReply: value.parentId !== null })) {
    return errorResponse(request, 429, 'rate-limited', '发得太快了，稍后再试');
  }

  let parentId = value.parentId;
  if (parentId !== null) {
    const parent = await env.DB.prepare('SELECT id, thread, parent_id, hidden FROM comments WHERE id = ?')
      .bind(parentId)
      .first();
    if (!parent || parent.thread !== value.thread || parent.hidden === 1 || parent.parent_id !== null) {
      return errorResponse(request, 400, 'invalid-parent', '回复对象不合法');
    }
  }

  const createdAt = new Date(now).toISOString();
  const userAgent = (request.headers.get('User-Agent') || '').slice(0, 200);
  const inserted = await env.DB.prepare(
    'INSERT INTO comments (thread, author, body, website, created_at, ip_hash, user_agent, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(value.thread, value.author, value.body, value.website, createdAt, ipHash, userAgent, parentId)
    .run();

  const id = Number(inserted?.meta?.last_row_id ?? 0);
  const row = id
    ? await env.DB
        .prepare('SELECT id, parent_id, author, body, website, created_at FROM comments WHERE id = ?')
        .bind(id)
        .first()
    : null;

  return jsonResponse(request, { item: row ? toView(row) : { ...value, createdAt, id: 0 } }, 201);
}
