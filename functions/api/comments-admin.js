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
];

const schemaReady = new WeakMap();

async function ensureSchema(db) {
  const pending = schemaReady.get(db);
  if (pending) return pending;
  const task = (async () => {
    for (const sql of SCHEMA) await db.prepare(sql).run();
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

function authenticate(context) {
  const { request, env } = context;
  const expected = env?.COMMENTS_ADMIN_TOKEN;
  if (!expected) return { ok: false, response: errorResponse(503, 'admin-token-missing', '管理令牌还没配置') };
  const got = readBearer(request.headers);
  if (!tokenMatches(expected, got)) {
    return { ok: false, response: errorResponse(401, 'unauthorized', '管理令牌不正确') };
  }
  return { ok: true, env };
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function onRequestGet(context) {
  const auth = authenticate(context);
  if (!auth.ok) return auth.response;

  const { request, env } = context;
  const url = new URL(request.url);
  const limit = clampAdminLimit(url.searchParams.get('limit'));

  await ensureSchema(env.DB);
  const rows = await env.DB.prepare(
    'SELECT id, thread, author, body, website, created_at FROM comments ORDER BY id DESC LIMIT ?',
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
  const auth = authenticate(context);
  if (!auth.ok) return auth.response;

  const { request, env } = context;
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return errorResponse(400, 'invalid-id', '缺少要删除的评论编号');

  await ensureSchema(env.DB);
  const result = await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  return jsonResponse({ deleted: Number(result?.meta?.changes ?? 0) }, 200);
}
