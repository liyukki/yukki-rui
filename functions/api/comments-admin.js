/**
 * 评论管理 API（Cloudflare Pages Functions）。
 *
 *   GET    /api/comments-admin?limit=50&before=12  最近评论（新→旧，游标分页）
 *   DELETE /api/comments-admin?id=12                删除一条
 *
 * 鉴权：Authorization: Bearer <COMMENTS_ADMIN_TOKEN>（Cloudflare Secret）。
 * 管理页是 /admin/comments/，与本站同源，因此不需要 CORS。
 */
import { parseId } from './comments.js';

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
  'CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id, hidden, id)',
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
  if (!env?.DB) return errorResponse(503, 'db-missing', '评论服务还没配置好');
  const url = new URL(request.url);
  const limit = clampAdminLimit(url.searchParams.get('limit'));
  const rawBefore = url.searchParams.get('before');
  const before = rawBefore === null ? null : parseId(rawBefore);
  if (rawBefore !== null && before === null) {
    return errorResponse(400, 'invalid-before', '分页游标不合法');
  }

  await ensureSchema(env.DB);
  const totalRow = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM comments WHERE hidden = 0')
    .first();
  const baseSql = 'SELECT id, thread, author, body, website, created_at FROM comments WHERE hidden = 0';
  const rows = before
    ? await env.DB
        .prepare(`${baseSql} AND id < ? ORDER BY id DESC LIMIT ?`)
        .bind(before, limit + 1)
        .all()
    : await env.DB.prepare(`${baseSql} ORDER BY id DESC LIMIT ?`).bind(limit + 1).all();

  const pageRows = Array.isArray(rows?.results) ? rows.results.slice(0, limit) : [];
  const items = pageRows.map((row) => ({
    id: Number(row.id ?? 0),
    thread: String(row.thread ?? ''),
    author: String(row.author ?? ''),
    body: String(row.body ?? ''),
    website: String(row.website ?? ''),
    createdAt: String(row.created_at ?? ''),
  }));
  const nextBefore = (Array.isArray(rows?.results) ? rows.results.length : 0) > limit && items.length
    ? items[items.length - 1].id
    : null;
  return jsonResponse({ items, total: Number(totalRow?.n ?? 0), nextBefore }, 200);
}

export async function onRequestDelete(context) {
  const denied = authenticate(context);
  if (denied) return denied;

  const { request, env } = context;
  if (!env?.DB) return errorResponse(503, 'db-missing', '评论服务还没配置好');
  const url = new URL(request.url);
  const id = parseId(url.searchParams.get('id'));
  if (id === null) return errorResponse(400, 'invalid-id', '缺少要删除的评论编号');

  await ensureSchema(env.DB);

  // 回复采用单层结构:把根评论与直接回复在同一事务里隐藏，并清理两者反应。
  // 用子查询而不是拼接 id 列表，避免热门评论超过 D1 单查询 100 个绑定参数。
  const reactionTable = await env.DB
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'comment_reactions'")
    .first();
  const statements = [
    env.DB.prepare('UPDATE comments SET hidden = 1 WHERE parent_id = ?').bind(id),
    env.DB.prepare('UPDATE comments SET hidden = 1 WHERE id = ?').bind(id),
  ];
  if (reactionTable) {
    statements.push(
      env.DB
        .prepare(`DELETE FROM comment_reactions
          WHERE comment_id IN (SELECT id FROM comments WHERE id = ? OR parent_id = ?)`)
        .bind(id, id),
    );
  }
  const results = await env.DB.batch(statements);
  return jsonResponse({ deleted: Number(results?.[1]?.meta?.changes ?? 0) }, 200);
}
