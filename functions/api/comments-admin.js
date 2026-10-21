/**
 * 评论管理 API（Cloudflare Pages Functions）。
 *
 *   GET    /api/comments-admin?limit=50     最近评论（新→旧）
 *   DELETE /api/comments-admin?id=12        删除一条
 *
 * 鉴权：Authorization: Bearer <COMMENTS_ADMIN_TOKEN>（Cloudflare Secret）。
 * 管理页是 /admin/comments/，与本站同源，因此不需要 CORS。
 */

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

const schemaReady = new WeakMap();

async function ensureSchema(db) {
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

/** 常数时间比较，避免按字符逐个提前返回泄漏令牌长度/前缀。 */
export function tokenMatches(expected, got) {
  const a = String(expected ?? '');
  const b = String(got ?? '');
  if (a === '' || b === '') return false;
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return diff === 0;
}

export function readBearer(headers) {
  const raw = headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match ? match[1].trim() : '';
}

export function clampAdminLimit(raw, fallback = 50) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), 200);
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function errorResponse(status, error, message) {
  return jsonResponse({ error, message }, status);
}

/**
 * 鉴权：失败时返回要直接发送的响应，通过则返回 null。
 *
 * @param {any} context
 * @returns {Response | null}
 */
function authenticate(context) {
  const { request, env } = context;
  const expected = env?.COMMENTS_ADMIN_TOKEN;
  if (!expected) return errorResponse(503, 'admin-token-missing', '管理令牌还没配置');
  const got = readBearer(request.headers);
  if (!tokenMatches(expected, got)) return errorResponse(401, 'unauthorized', '管理令牌不正确');
  return null;
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function onRequestGet(context) {
  const denied = authenticate(context);
  if (denied) return denied;

  const { request, env } = context;
  const url = new URL(request.url);
  const limit = clampAdminLimit(url.searchParams.get('limit'));

  await ensureSchema(env.DB);
  const rows = await env.DB.prepare(
    'SELECT id, thread, author, body, website, created_at FROM comments WHERE hidden = 0 ORDER BY id DESC LIMIT ?',
  )
    .bind(limit)
    .all();

  const items = (Array.isArray(rows?.results) ? rows.results : []).map((row) => ({
    id: Number(row.id ?? 0),
    thread: String(row.thread ?? ''),
    author: String(row.author ?? ''),
    body: String(row.body ?? ''),
    website: String(row.website ?? ''),
    createdAt: String(row.created_at ?? ''),
  }));
  return jsonResponse({ items, total: items.length }, 200);
}

export async function onRequestDelete(context) {
  const denied = authenticate(context);
  if (denied) return denied;

  const { request, env } = context;
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return errorResponse(400, 'invalid-id', '缺少要删除的评论编号');

  await ensureSchema(env.DB);

  // 回复采用单层结构:先找出直接子回复,再把根评论与回复一起标记为隐藏。
  // 这里不做物理删除,保留数据便于日后审计/恢复;公开查询统一过滤 hidden = 0。
  const replyRows = await env.DB.prepare('SELECT id FROM comments WHERE parent_id = ?').bind(id).all();
  const replyIds = (Array.isArray(replyRows?.results) ? replyRows.results : []).map((row) => Number(row.id));
  const reactionIds = [id, ...replyIds];

  await env.DB.prepare('UPDATE comments SET hidden = 1 WHERE parent_id = ?').bind(id).run();
  const result = await env.DB.prepare('UPDATE comments SET hidden = 1 WHERE id = ?').bind(id).run();

  // reactions 表可能从未创建过(评论功能刚上线);这种情况直接忽略。
  if (reactionIds.length > 0) {
    const placeholders = reactionIds.map(() => '?').join(',');
    try {
      await env.DB
        .prepare(`DELETE FROM comment_reactions WHERE comment_id IN (${placeholders})`)
        .bind(...reactionIds)
        .run();
    } catch (error) {
      if (!/no such table/i.test(String(error?.message ?? error))) throw error;
    }
  }

  return jsonResponse({ deleted: Number(result?.meta?.changes ?? 0) }, 200);
}
